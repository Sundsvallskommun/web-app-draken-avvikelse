import type { Page, Route } from '@playwright/test';

import { persistedStoreKey } from '../../src/common/utils/persisted-store-key';
import { mockAdmins, mockNoAdmins } from '../fixtures/mockAdmins';
import { mockMe } from '../fixtures/mockMe';
import { expect, test } from '../fixtures/base.fixture';
import { mockStatusGroupCounts } from '../utils/status-group-counts';
import { errandNumberPrefix } from './fixtures/investigation-flow.mock';

/**
 * The overview does a good deal of work before it can ask for errands: the investigation profile
 * carries the label filter, so the filter the table is showing is only settled once both that
 * profile and the label metadata have answered. Every round the overview
 * makes is one more answer that can land out of order, and since the table renders only errands
 * whose status the sidebar has selected, an answer fetched for another status renders as an empty
 * table beside a correct count.
 */
const LIST_URL = /\/supporterrands\/2281\?/;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const statusOf = (url: string) => new URL(url).searchParams.get('status');

const labelStructure = [
  {
    id: 'provision-root-id',
    classification: 'PROVISION_ROOT',
    resourceName: 'PROVISION_ROOT',
    resourcePath: 'PROVISION_ROOT',
    displayName: 'Lagrum',
    labels: [
      {
        id: 'provision-sol-id',
        classification: 'PROVISION',
        resourceName: 'SOL',
        resourcePath: 'PROVISION_ROOT/SOL',
        displayName: 'SoL',
      },
      {
        id: 'provision-hsl-id',
        classification: 'PROVISION',
        resourceName: 'HSL',
        resourcePath: 'PROVISION_ROOT/HSL',
        displayName: 'HSL',
      },
    ],
  },
];

const investigationProfile = {
  state: 'active',
  registration: { mode: 'disabled' },
  documents: [],
  labelFilter: {
    groups: [
      {
        key: 'lagrum',
        label: 'Lagrum',
        rootResourcePath: 'PROVISION_ROOT',
        fields: [{ key: 'provision', label: 'Lagrum', classification: 'PROVISION' }],
      },
    ],
  },
};

const errand = (index: number, status: string) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  errandNumber: `${errandNumberPrefix}-2026-000${index}`,
  title: 'Avvikelse',
  priority: 'MEDIUM',
  status,
  resolution: 'INFORMED',
  channel: 'PHONE',
  classification: { category: 'NONE', type: 'NONE' },
  stakeholders: [],
  externalTags: [],
  labels: ['PROVISION_ROOT/SOL'],
  reporterUserId: 'kctest',
  assignedUserId: 'kctest',
  created: '2026-02-22T13:06:02.567+01:00',
  modified: '2026-02-22T13:06:02.567+01:00',
  touched: '2026-02-22T13:06:02.567+01:00',
});

const errandPage = (statuses: string[]) => ({
  content: statuses.map((status, index) => errand(index + 1, status)),
  pageable: { pageNumber: 0, pageSize: 12, offset: 0, paged: true, unpaged: false },
  totalPages: 1,
  totalElements: statuses.length,
  size: 12,
  number: 0,
  first: true,
  last: true,
  numberOfElements: statuses.length,
  empty: statuses.length === 0,
});

const newErrands = errandPage(['NEW', 'NEW', 'NEW', 'NEW']);
// In IAF/VOF an open errand is in one of its phases' statuses, Utredning's INQUIRY among them.
const ongoingErrands = errandPage(['INQUIRY', 'INQUIRY']);

const jsonRoute = (page: Page, pattern: string, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

test.describe('Avvikelsens översikt, långsamma svar', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: 'connect.sid', value: 'test-session', domain: 'localhost', path: '/' }]);
    await jsonRoute(page, '**/administrators', mockAdmins);
    await jsonRoute(page, '**/me', mockMe);
    await jsonRoute(page, '**/users/admins', mockNoAdmins);
    await jsonRoute(page, '**/supportnotifications/2281', []);
    await mockStatusGroupCounts(page, 10);
    await jsonRoute(page, '**/supportmetadata/2281', {
      categories: [],
      types: [],
      statuses: [
        { name: 'NEW', displayName: 'Ny' },
        { name: 'INQUIRY', displayName: 'Utredning' },
      ],
      labels: { labelStructure },
    });
    await jsonRoute(page, '**/supportmanagement/investigation-profile', investigationProfile);
  });

  test.afterEach(async ({ page }) => {
    // The list route below answers slowly on purpose; dropping it keeps a late request from
    // holding up the teardown.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('ett långsamt svar på en ersatt förfrågan tömmer inte tabellen', async ({ page, dismissCookieConsent }) => {
    test.setTimeout(60_000);
    await page.route(LIST_URL, async (route) => {
      const isNewStatusRequest = statusOf(route.request().url()) === 'NEW';
      if (isNewStatusRequest) {
        await delay(8000);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isNewStatusRequest ? newErrands : ongoingErrands),
      });
    });

    const slowRequest = page.waitForRequest(LIST_URL);
    await page.goto('oversikt/');
    await dismissCookieConsent();
    await slowRequest;

    const slowAnswer = page.waitForResponse(
      (response) => LIST_URL.test(response.url()) && statusOf(response.url()) === 'NEW'
    );
    await page.locator('[aria-label="status-button-INQUIRY"]').click();
    await expect(page.locator('[data-cy="main-table"] .sk-table-tbody-tr')).toHaveCount(ongoingErrands.content.length);

    await slowAnswer;
    await expect(page.locator('[data-cy="main-table"] .sk-table-tbody-tr')).toHaveCount(ongoingErrands.content.length);
  });

  // The label metadata may answer after the overview has begun filtering. A stored label filter stays: in what is
  // stored, in the controls once the metadata is there, and in the request.
  test('behåller sparade lagrumsfilter när metadata svarar långsamt', async ({ page, dismissCookieConsent }) => {
    const storageKey = persistedStoreKey('ui-settings');
    const storedSelection = JSON.stringify([
      { groupKey: 'lagrum', fieldKey: 'provision', resourcePath: 'PROVISION_ROOT/HSL' },
    ]);
    await page.addInitScript(
      ({ key, labelFilter }) =>
        window.localStorage.setItem(key, JSON.stringify({ state: { filter: { labelFilter } }, version: 0 })),
      { key: storageKey, labelFilter: storedSelection }
    );
    // Well past the 200 ms in which the overview stores its filter.
    await page.route('**/supportmetadata/2281', async (route) => {
      await delay(1500);
      await route.fallback();
    });
    const labelFilters: string[] = [];
    await page.route(LIST_URL, async (route) => {
      labelFilters.push(new URL(route.request().url()).searchParams.get('labelFilter') ?? '');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(newErrands) });
    });

    await page.goto('oversikt/');
    await dismissCookieConsent();

    await expect(page.locator('[aria-label="Rensa Lagrum"]')).toContainText('Lagrum: HSL');
    const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), storageKey);
    expect(stored.state.filter.labelFilter).toBe(storedSelection);
    await expect.poll(() => labelFilters.at(-1)).toBe(storedSelection);
  });

  test('första laddningen frågar bara efter den valda statusen', async ({ page, dismissCookieConsent }) => {
    const listQueries: string[] = [];
    await page.route(LIST_URL, async (route) => {
      listQueries.push(decodeURIComponent(new URL(route.request().url()).search));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(newErrands) });
    });

    await page.goto('oversikt/');
    await dismissCookieConsent();
    await expect(page.locator('[data-cy="main-table"] .sk-table-tbody-tr')).toHaveCount(newErrands.content.length);

    expect(listQueries).toHaveLength(1);
    expect(listQueries[0]).toContain('status=NEW');
  });
});
