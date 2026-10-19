import type { Page, Route } from '@playwright/test';

import type { PlannedMeasuresSnapshot } from '../../src/supportmanagement/measures/support-measure-service';
import { mockAdmins, mockNoAdmins } from '../fixtures/mockAdmins';
import { mockMe } from '../fixtures/mockMe';
import { expect, test } from '../fixtures/base.fixture';
import { mockStatusGroupCounts } from '../utils/status-group-counts';
import { errandNumberPrefix } from './fixtures/investigation-flow.mock';

/**
 * The planned-measures overview lives beside the errand table: a sidebar button swaps the table for a
 * list of every approved, dated and not yet executed measure across the errands the user reaches, each
 * row linking back to its errand. The BFF owns the selection; the browser shows what it is given.
 */
const basePath = process.env.NEXT_PUBLIC_BASEPATH ?? '';

const emptyErrandPage = {
  content: [],
  pageable: { pageNumber: 0, pageSize: 12, offset: 0, paged: true, unpaged: false },
  totalPages: 0,
  totalElements: 0,
  size: 12,
  number: 0,
  first: true,
  last: true,
  numberOfElements: 0,
  empty: true,
};

const planned: PlannedMeasuresSnapshot = {
  measures: [
    {
      id: 'measure-soon',
      version: 2,
      type: 'EDUCATION',
      accept: 'TRUE',
      description: 'Utbilda personalen i förflyttningsteknik',
      goal: 'Färre fallskador',
      plannedStart: '2026-09-10T00:00:00+02:00',
      plannedComplete: '2020-01-31T00:00:00+01:00',
      responsibleUser: 'kctest',
      addedByUser: 'kctest',
      addedByRole: 'UNIT_MANAGER',
      errand: { id: 'errand-soon', errandNumber: `${errandNumberPrefix}-2026-0001`, status: 'ONGOING' },
    },
    {
      id: 'measure-later',
      version: 1,
      type: 'EDUCATION',
      accept: 'REWORK',
      description: 'Byt larmmatta',
      plannedComplete: '2099-12-01T00:00:00+01:00',
      addedByUser: 'kctest',
      addedByRole: 'UNIT_MANAGER',
      errand: { id: 'errand-later', errandNumber: `${errandNumberPrefix}-2026-0002`, status: 'ONGOING' },
    },
  ],
  metadata: {
    measureTypes: [
      {
        id: 'dd000000-0000-4000-8000-000000000100',
        name: 'EDUCATION',
        displayName: 'Utbildning',
        measureGroups: ['PREVENTIVE'],
      },
    ],
    roles: [{ name: 'UNIT_MANAGER', displayName: 'Enhetschef' }],
  },
  truncated: false,
};

const jsonRoute = (page: Page, pattern: string | RegExp, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

async function installOverview(page: Page) {
  await page.context().addCookies([{ name: 'connect.sid', value: 'test-session', domain: 'localhost', path: '/' }]);
  await jsonRoute(page, '**/administrators', mockAdmins);
  await jsonRoute(page, '**/me', mockMe);
  await jsonRoute(page, '**/users/admins', mockNoAdmins);
  await jsonRoute(page, '**/supportnotifications/2281', []);
  await mockStatusGroupCounts(page, 0);
  await jsonRoute(page, '**/supportmetadata/2281', {
    categories: [],
    types: [],
    statuses: [
      { name: 'NEW', displayName: 'Ny' },
      { name: 'ONGOING', displayName: 'Pågående' },
    ],
    labels: { labelStructure: [] },
  });
  await jsonRoute(page, /\/supporterrands\/2281\?/, emptyErrandPage);
}

test.describe('Planerade åtgärder i översikten', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('listar godkända planerade åtgärder från alla ärenden med länk tillbaka till ärendet', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installOverview(page);
    const reads: string[] = [];
    await page.route('**/supportmeasures/2281/planned', async (route) => {
      reads.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(planned) });
    });

    await page.goto('oversikt/');
    await dismissCookieConsent();
    await expect(page.locator('[data-cy="main-table"]')).toBeVisible();

    const button = page.locator('[data-cy="planned-measures-button"]');
    await expect(button).toHaveText('Planerade åtgärder');
    await button.click();

    const overview = page.locator('[data-cy="planned-measures-overview"]');
    await expect(overview.getByRole('heading', { level: 1 })).toHaveText('Planerade åtgärder');
    await expect(page.locator('[data-cy="main-table"]')).toHaveCount(0);
    // Dev mode mounts twice under StrictMode, so the count is not asserted; the URL is.
    expect(reads.length).toBeGreaterThanOrEqual(1);
    expect(reads.every((url) => url.endsWith('/supportmeasures/2281/planned'))).toBe(true);

    const rows = overview.locator('[data-cy="planned-measure-row"]');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('[data-cy="planned-measures-summary"]')).toHaveText('2 åtgärder · 1 försenade.');

    // The late measure sits first in its own bucket; the far one under Senare; nothing is due within two weeks.
    const overdue = overview.locator('[data-cy="planned-measures-overdue"]');
    await expect(overdue.getByRole('heading', { level: 2 })).toContainText('Försenade');
    await expect(overdue.locator('[data-cy="planned-measure-row"]')).toHaveCount(1);
    await expect(overview.locator('[data-cy="planned-measures-soon"]')).toHaveCount(0);
    const later = overview.locator('[data-cy="planned-measures-later"]');
    await expect(later.getByRole('heading', { level: 2 })).toContainText('Senare');

    const first = rows.nth(0);
    await expect(first).toContainText('31 jan 2020');
    await expect(first).toContainText('dagar sedan');
    await expect(first).toContainText('Utbildning');
    await expect(first).toContainText('Godkänd');
    const link = first.getByRole('link', { name: `Ärende ${errandNumberPrefix}-2026-0001, öppna ärende i ny flik` });
    await expect(link).toHaveAttribute('href', `${basePath}/arende/${errandNumberPrefix}-2026-0001`);
    await expect(link).toHaveAttribute('target', '_blank');

    // Closed rows keep their details out of view; a click on the row unfolds it in place.
    const description = first.getByText('Utbilda personalen i förflyttningsteknik');
    await expect(description).toBeHidden();
    await first.locator('summary').click();
    await expect(description).toBeVisible();
    await expect(first).toContainText('Mål: Färre fallskador');
    await expect(first).toContainText('Klar senast2020-01-31');
    await expect(first.getByRole('link', { name: 'Öppna ärendet' })).toHaveAttribute(
      'href',
      `${basePath}/arende/${errandNumberPrefix}-2026-0001`
    );

    const second = rows.nth(1);
    await expect(second).toContainText('1 dec 2099');
    await expect(second).toContainText('Delvis godkänd');
    await expect(second).not.toContainText('Försenad');

    // Free text narrows the list; a status click in the sidebar returns to the errand table.
    await page.getByRole('textbox', { name: 'Sök planerade åtgärder' }).fill('larmmatta');
    await expect(rows).toHaveCount(1);
    await expect(page.locator('[data-cy="planned-measures-summary"]')).toHaveText('Visar 1 av 2 åtgärder.');

    await page.locator('[aria-label="status-button-NEW"]').click();
    await expect(overview).toHaveCount(0);
    await expect(page.locator('[data-cy="main-table"]')).toBeVisible();
  });

  test('säger ifrån när det inte finns något att arbeta med och när läsningen nekas', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installOverview(page);
    // Denied until the retry, whatever number of reads the first mount makes.
    let denied = true;
    await page.route('**/supportmeasures/2281/planned', async (route) => {
      if (denied) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Denied' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...planned, measures: [], truncated: true }),
      });
    });

    await page.goto('oversikt/');
    await dismissCookieConsent();
    await page.locator('[data-cy="planned-measures-button"]').click();

    const overview = page.locator('[data-cy="planned-measures-overview"]');
    await expect(overview.getByRole('alert')).toContainText('Du saknar behörighet att läsa åtgärder.');
    denied = false;
    await overview.getByRole('button', { name: 'Försök igen' }).click();
    await expect(overview).toContainText('Det finns inga planerade åtgärder att arbeta med.');
    await expect(overview).toContainText('Listan är ofullständig');
  });
});
