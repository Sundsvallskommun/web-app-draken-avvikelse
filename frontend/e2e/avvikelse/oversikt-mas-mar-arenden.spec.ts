import type { Page, Route } from '@playwright/test';

import { mockAdmins } from '../fixtures/mockAdmins';
import { mockMe } from '../fixtures/mockMe';
import { expect, test } from '../fixtures/base.fixture';
import { mockStatusGroupCounts } from '../utils/status-group-counts';

/**
 * MAS/MAR-ärenden: a checkbox beside Mina ärenden that narrows the overview to the errands with a high HSL risk.
 * MAS/MAR alone are offered it, checked until they uncheck it, and their choice is kept. It asks the BFF through the
 * profile's `risk` label filter, which no other filter offers.
 */
const LIST_URL = /\/supporterrands\/2281\?/;
const highHslRisk = { groupKey: 'risk', fieldKey: 'risk', resourcePath: 'RISK/HIGH_HSL' };

const labelStructure = [
  {
    id: 'provision-root-id',
    classification: 'PROVISION_ROOT',
    resourceName: 'PROVISION',
    resourcePath: 'PROVISION',
    displayName: 'Lagrum',
    labels: [
      { id: 'provision-hsl-id', classification: 'PROVISION', resourceName: 'HSL', resourcePath: 'PROVISION/HSL' },
    ],
  },
  {
    id: 'risk-root-id',
    classification: 'risk-root',
    resourceName: 'RISK',
    resourcePath: 'RISK',
    displayName: 'Risk klass',
    labels: [
      {
        id: 'risk-high-hsl-id',
        classification: 'risk',
        resourceName: 'HIGH_HSL',
        resourcePath: 'RISK/HIGH_HSL',
        displayName: 'Hög risk HSL',
      },
    ],
  },
];

// As the BFF's profile: the overview's own label filters, and the group MAS/MAR-ärenden selects in.
const investigationProfile = {
  state: 'active',
  registration: { mode: 'disabled' },
  documents: [],
  labelFilter: {
    groups: [
      {
        key: 'provision',
        label: 'Lagrum',
        rootResourcePath: 'PROVISION',
        fields: [{ key: 'provision', label: 'Lagrum', classification: 'PROVISION' }],
      },
      {
        key: 'risk',
        label: 'Risk',
        rootResourcePath: 'RISK',
        fields: [{ key: 'risk', label: 'Risk', classification: 'RISK' }],
      },
    ],
  },
};

const emptyPage = {
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

const jsonRoute = (page: Page, pattern: string | RegExp, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

/** Serves the overview to a user holding `roleKeys`, and returns the label filter of every list request. */
async function installOverview(page: Page, roleKeys: string[]) {
  const labelFilters: Array<unknown[]> = [];
  await page.context().addCookies([{ name: 'connect.sid', value: 'test-session', domain: 'localhost', path: '/' }]);
  await jsonRoute(page, '**/administrators', mockAdmins);
  await jsonRoute(page, '**/me', { ...mockMe, data: { ...mockMe.data, roleKeys, superadmin: false } });
  await jsonRoute(page, '**/users/admins', mockAdmins);
  await jsonRoute(page, '**/supportnotifications/2281', []);
  await mockStatusGroupCounts(page, 0);
  await jsonRoute(page, '**/supportmetadata/2281', {
    categories: [],
    types: [],
    statuses: [{ name: 'NEW', displayName: 'Ny' }],
    labels: { labelStructure },
  });
  await jsonRoute(page, '**/supportmanagement/investigation-profile', investigationProfile);
  await page.route(LIST_URL, (route: Route) => {
    labelFilters.push(JSON.parse(new URL(route.request().url()).searchParams.get('labelFilter') ?? '[]'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyPage) });
  });
  return labelFilters;
}

const filterToggle = (page: Page) => page.locator('[data-cy="overview-filter-toggle"]');

test('MAS/MAR-ärenden är ikryssad för MAS/MAR, och ett urkryss sparas', async ({ page, dismissCookieConsent }) => {
  const labelFilters = await installOverview(page, ['mas-mar']);

  await page.goto('oversikt/');
  await dismissCookieConsent();

  await expect(filterToggle(page)).toBeChecked();
  await expect(page.getByText('MAS/MAR-ärenden', { exact: true })).toBeVisible();
  await expect.poll(() => labelFilters.at(-1)).toEqual([highHslRisk]);
  // The group is the checkbox's own: the label filters offer Lagrum, and no Risk.
  await expect(page.getByRole('group', { name: 'Lagrum' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Risk' })).toHaveCount(0);

  // The drawn box sits over the input and takes the pointer; a user clicks that box.
  await filterToggle(page).uncheck({ force: true });
  await expect.poll(() => labelFilters.at(-1)).toEqual([]);

  await page.reload();
  await expect(filterToggle(page)).not.toBeChecked();
  await filterToggle(page).check({ force: true });
  await expect.poll(() => labelFilters.at(-1)).toEqual([highHslRisk]);
});

test('ingen annan än MAS/MAR erbjuds MAS/MAR-ärenden', async ({ page, dismissCookieConsent }) => {
  const labelFilters = await installOverview(page, ['enhetschef']);

  await page.goto('oversikt/');
  await dismissCookieConsent();

  await expect(page.getByRole('group', { name: 'Lagrum' })).toBeVisible();
  await expect(page.getByText('Mina ärenden', { exact: true })).toBeVisible();
  await expect(filterToggle(page)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Risk' })).toHaveCount(0);
  await expect.poll(() => labelFilters.length).toBeGreaterThan(0);
  expect(labelFilters.every((selections) => selections.length === 0)).toBe(true);
});
