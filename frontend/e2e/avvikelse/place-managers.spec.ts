import type { Page, Route } from '@playwright/test';

import type {
  PlaceManagerAssignment,
  PlaceManagerPerson,
} from '../../src/supportmanagement/investigation/avvikelse/place-managers/place-manager-service';
import { mockAdmins, mockNoAdmins } from '../fixtures/mockAdmins';
import { mockMe } from '../fixtures/mockMe';
import { expect, test } from '../fixtures/base.fixture';
import { mockStatusGroupCounts } from '../utils/status-group-counts';
import { defaultInvestigationProfile } from './fixtures/investigation-flow.mock';

/**
 * Chefer per plats: avvikelsens administrationsavsnitt i översiktens sidomeny. Administratören ser vilka
 * personer som har vilka platser och ger eller tar bort platser. BFF:en skriver platserna i AccessMapper;
 * webbläsaren visar dem i platsstrukturen och säger till när en person saknar chefsroll.
 */
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

const label = (id: string, classification: string, resourcePath: string, displayName: string, labels?: unknown[]) => ({
  id,
  classification,
  resourcePath,
  resourceName: resourcePath.split('/').at(-1),
  displayName,
  ...(labels ? { labels } : {}),
});

const NORTH_HOME = 'LOCATION/CARE/NORTH/HOME';
const NORTH_HOUSING = 'LOCATION/CARE/NORTH/HOUSING';
const SOUTH_HOME = 'LOCATION/CARE/SOUTH/HOME';

// Every level down to the unit is a place, and what lies under a unit is a department.
const labelStructure = [
  label('place-root', 'LOCATION_ROOT', 'LOCATION', 'Platsstruktur', [
    label('care', 'LOCATION', 'LOCATION/CARE', 'Vård och omsorg', [
      label('north', 'LOCATION', 'LOCATION/CARE/NORTH', 'Norr', [
        label('north-home', 'LOCATION', NORTH_HOME, 'Norra hemtjänsten', [
          label('night', 'DEPARTMENT', `${NORTH_HOME}/NIGHT`, 'Nattpatrullen'),
        ]),
        label('north-housing', 'LOCATION', NORTH_HOUSING, 'Norra boendet'),
      ]),
      label('south', 'LOCATION', 'LOCATION/CARE/SOUTH', 'Söder', [
        label('south-home', 'LOCATION', SOUTH_HOME, 'Södra hemtjänsten'),
      ]),
    ]),
  ]),
];

const roles = [
  { key: 'UNIT_MANAGER', label: 'Enhetschef' },
  { key: 'HEAD_OF_OPERATIONS', label: 'Verksamhetschef' },
];

const directory: Record<string, PlaceManagerPerson> = {
  nora01: { adAccount: 'nora01', displayName: 'Nora Norr', roleKeys: ['UNIT_MANAGER'] },
  vera02: { adAccount: 'vera02', displayName: 'Vera Verksam', roleKeys: ['HEAD_OF_OPERATIONS'] },
  ulla03: { adAccount: 'ulla03', displayName: 'Ulla Utan', roleKeys: [] },
  nils04: { adAccount: 'nils04', displayName: 'Nils Ny', roleKeys: ['UNIT_MANAGER'] },
};

const seededAssignments = (): PlaceManagerAssignment[] => [
  { adAccount: 'nora01', origin: 'AUTOMATIC', placePaths: [NORTH_HOME] },
  { adAccount: 'VERA02', origin: 'AUTOMATIC', placePaths: [NORTH_HOME, NORTH_HOUSING] },
  { adAccount: 'ulla03', origin: 'MANUAL', placePaths: [NORTH_HOME] },
];

const unitPathsOf: Record<string, string[]> = {
  care: [NORTH_HOME, NORTH_HOUSING, SOUTH_HOME],
  north: [NORTH_HOME, NORTH_HOUSING],
  south: [SOUTH_HOME],
  'north-home': [NORTH_HOME],
  'north-housing': [NORTH_HOUSING],
  'south-home': [SOUTH_HOME],
};

const jsonRoute = (page: Page, pattern: string | RegExp, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

interface PlaceChangeRequest {
  adAccount: string;
  body: { add: string[]; remove: string[] };
}

interface PlaceManagerTrace {
  assignmentReads: number;
  lookups: string[][];
  changes: PlaceChangeRequest[];
}

/** The BFF's place manager routes, answering from one list of assignments that the changes are applied to. */
async function installPlaceManagers(
  page: Page,
  { superadmin = true, assignmentStatus = 200 }: { superadmin?: boolean; assignmentStatus?: number } = {}
): Promise<PlaceManagerTrace> {
  const trace: PlaceManagerTrace = { assignmentReads: 0, lookups: [], changes: [] };
  let assignments = seededAssignments();

  await page.context().addCookies([{ name: 'connect.sid', value: 'test-session', domain: 'localhost', path: '/' }]);
  await jsonRoute(page, '**/administrators', mockAdmins);
  await jsonRoute(page, '**/me', { ...mockMe, data: { ...mockMe.data, roleKeys: [], superadmin } });
  await jsonRoute(page, '**/users/admins', mockNoAdmins);
  await jsonRoute(page, '**/supportnotifications', []);
  await jsonRoute(page, '**/supportmanagement/investigation-profile', defaultInvestigationProfile());
  await mockStatusGroupCounts(page, 0);
  await jsonRoute(page, '**/supportmetadata', {
    categories: [],
    types: [],
    statuses: [
      { name: 'NEW', displayName: 'Ny' },
      { name: 'SOLVED', displayName: 'Avslutat' },
    ],
    labels: { labelStructure },
  });
  await jsonRoute(page, /\/supporterrands\?/, emptyErrandPage);

  await page.route('**/supportplacemanagers', async (route) => {
    trace.assignmentReads += 1;
    await route.fulfill({
      status: assignmentStatus,
      contentType: 'application/json',
      body: JSON.stringify(assignmentStatus === 200 ? { assignments, roles } : { message: 'Missing permissions' }),
    });
  });

  await page.route('**/supportplacemanagers/people', async (route) => {
    const { adAccounts } = route.request().postDataJSON() as { adAccounts: string[] };
    trace.lookups.push(adAccounts);
    const people = adAccounts.map((adAccount) => ({
      ...(directory[adAccount.toLowerCase()] ?? { roleKeys: [] }),
      adAccount,
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ people }) });
  });

  await page.route('**/supportplacemanagers/people/*/places', async (route) => {
    const adAccount = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    const body = route.request().postDataJSON() as PlaceChangeRequest['body'];
    trace.changes.push({ adAccount, body });

    const existing = assignments.find((current) => current.adAccount.toLowerCase() === adAccount.toLowerCase());
    const removed = new Set(body.remove.flatMap((labelId) => unitPathsOf[labelId]));
    const placePaths = [
      ...new Set([...(existing?.placePaths ?? []), ...body.add.flatMap((labelId) => unitPathsOf[labelId])]),
    ].filter((path) => !removed.has(path));
    const changed = { adAccount: existing?.adAccount ?? adAccount.toLowerCase(), origin: 'MANUAL', placePaths };
    assignments = [
      ...assignments.filter((current) => current !== existing),
      ...(placePaths.length > 0 ? [changed] : []),
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(changed) });
  });

  return trace;
}

async function openPlaceManagers(page: Page, dismissCookieConsent: () => Promise<void>) {
  await page.goto('oversikt/');
  await dismissCookieConsent();
  await page.locator('[data-cy="administration-button"]').click();
  await expect(page.locator('[data-cy="place-managers"]').getByRole('heading', { level: 1 })).toHaveText(
    'Chefer per plats'
  );
}

const treeItem = (page: Page, labelId: string) => page.locator(`[data-cy="place-tree-select-${labelId}"]`);
const openArea = (page: Page, labelId: string) => page.locator(`[data-cy="place-tree-toggle-${labelId}"]`).click();
const row = (page: Page, adAccount: string) => page.locator(`[data-cy="place-manager-row-${adAccount}"]`);
const summary = (page: Page) => page.locator('[data-cy="place-managers-summary"]');

async function selectNorthHome(page: Page) {
  await openArea(page, 'care');
  await openArea(page, 'north');
  await treeItem(page, 'north-home').click();
  await expect(page.locator('[data-cy="place-manager-place"]')).toHaveText('Norra hemtjänsten');
}

test.describe('Chefer per plats', () => {
  test('erbjuds administratören i sidomenyn och ingen annan', async ({ page, dismissCookieConsent }) => {
    const trace = await installPlaceManagers(page, { superadmin: false });

    await page.goto('oversikt/');
    await dismissCookieConsent();

    await expect(page.locator('[data-cy="follow-up-button"]')).toBeVisible();
    await expect(page.locator('[data-cy="administration-button"]')).toHaveCount(0);
    expect(trace.assignmentReads).toBe(0);
  });

  test('visar platsstrukturen med enheterna som saknar person', async ({ page, dismissCookieConsent }) => {
    await installPlaceManagers(page);
    await openPlaceManagers(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="administration-button"]')).toHaveText('Chefer per plats');
    await expect(summary(page)).toHaveText('1 av 3 enheter saknar person.');
    await expect(treeItem(page, 'care')).toContainText('1 utan person');
    // Areas open one level at a time; a department under a unit is no place of its own.
    await expect(treeItem(page, 'north')).toHaveCount(0);
    await openArea(page, 'care');
    await openArea(page, 'north');
    await openArea(page, 'south');
    await expect(treeItem(page, 'north-home')).toContainText('3 personer');
    await expect(treeItem(page, 'north-housing')).toContainText('1 person');
    await expect(treeItem(page, 'south-home')).toContainText('Ingen person');
    await expect(page.locator('[data-cy="place-tree-night"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="place-managers-hint"]')).toBeVisible();
  });

  test('söker i strukturen och filtrerar på enheter utan person', async ({ page, dismissCookieConsent }) => {
    await installPlaceManagers(page);
    await openPlaceManagers(page, dismissCookieConsent);

    await page.locator('[data-cy="place-managers-search"]').fill('boendet');
    await expect(treeItem(page, 'north-housing')).toBeVisible();
    await expect(treeItem(page, 'north-home')).toHaveCount(0);
    await expect(treeItem(page, 'south')).toHaveCount(0);

    await page.locator('[data-cy="place-managers-search"]').fill('finns inte');
    await expect(page.locator('[data-cy="place-managers-no-match"]')).toBeVisible();

    await page.locator('[data-cy="place-managers-search"]').fill('');
    await page.locator('[data-cy="place-managers-only-without-holder"]').check({ force: true });
    await expect(treeItem(page, 'south-home')).toBeVisible();
    await expect(treeItem(page, 'north')).toHaveCount(0);
  });

  test('listar personerna på en enhet med namn och roll, och säger till när rollen saknas', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installPlaceManagers(page);
    await openPlaceManagers(page, dismissCookieConsent);
    await selectNorthHome(page);

    await expect(page.locator('[data-cy="place-manager-breadcrumb"]')).toHaveText('Vård och omsorg / Norr');
    await expect(row(page, 'nora01')).toContainText('Nora Norr');
    await expect(row(page, 'nora01')).toContainText('Enhetschef');
    await expect(row(page, 'nora01')).toContainText('Inläst automatiskt');
    await expect(row(page, 'vera02')).toContainText('Vera Verksam');
    await expect(row(page, 'vera02')).toContainText('Verksamhetschef');
    await expect(row(page, 'ulla03')).toContainText('Saknar chefsroll');
    await expect(row(page, 'ulla03')).toContainText('Satt för hand');
    // Names and roles are asked for once, for the people on the place that is shown.
    expect(trace.lookups).toEqual([['nora01', 'ulla03', 'VERA02']]);

    await treeItem(page, 'north-housing').click();
    await expect(row(page, 'vera02')).toContainText('Vera Verksam');
    await expect(row(page, 'nora01')).toHaveCount(0);
    expect(trace.lookups).toHaveLength(1);
  });

  test('visar hur mycket av ett område var och en har', async ({ page, dismissCookieConsent }) => {
    const trace = await installPlaceManagers(page);
    await openPlaceManagers(page, dismissCookieConsent);
    await openArea(page, 'care');
    await treeItem(page, 'north').click();

    await expect(page.locator('[data-cy="place-manager-place"]')).toHaveText('Norr');
    await expect(row(page, 'vera02')).toContainText('Alla 2 enheter');
    await expect(row(page, 'nora01')).toContainText('1 av 2 enheter');
    // A row offers one thing: taking the person away. Giving places is done by adding the person.
    await expect(row(page, 'nora01').getByRole('button')).toHaveCount(1);
    await expect(row(page, 'nora01').locator('[data-cy="place-manager-remove"]')).toBeVisible();
    expect(trace.changes).toEqual([]);
  });

  test('lägger till en person på en enhet efter att ha slagit upp kontot', async ({ page, dismissCookieConsent }) => {
    const trace = await installPlaceManagers(page);
    await openPlaceManagers(page, dismissCookieConsent);
    await openArea(page, 'care');
    await openArea(page, 'south');
    await treeItem(page, 'south-home').click();

    await expect(page.locator('[data-cy="place-manager-without-holder"]')).toContainText('Ingen person har enheten');
    await expect(page.locator('[data-cy="place-manager-table"]')).toHaveCount(0);

    await page.locator('[data-cy="add-place-manager-account"]').fill('okand99');
    await page.locator('[data-cy="add-place-manager-search"]').click();
    await expect(page.locator('[data-cy="add-place-manager-unknown"]')).toContainText('okand99');
    await expect(page.locator('[data-cy="add-place-manager-confirm"]')).toHaveCount(0);

    await page.locator('[data-cy="add-place-manager-account"]').fill('NILS04');
    await page.locator('[data-cy="add-place-manager-search"]').click();
    await expect(page.locator('[data-cy="add-place-manager-found"]')).toContainText('Nils Ny');
    await expect(page.locator('[data-cy="add-place-manager-found"]')).toContainText('Enhetschef');
    await page.locator('[data-cy="add-place-manager-confirm"]').click();

    await expect(row(page, 'nils04')).toContainText('Nils Ny');
    await expect(row(page, 'nils04')).toContainText('Enhetschef');
    await expect(page.locator('[data-cy="place-manager-without-holder"]')).toHaveCount(0);
    await expect(summary(page)).toHaveText('0 av 3 enheter saknar person.');
    await expect(page.locator('[data-cy="add-place-manager-account"]')).toHaveValue('');
    expect(trace.changes).toEqual([{ adAccount: 'NILS04', body: { add: ['south-home'], remove: [] } }]);
  });

  test('säger till innan en person utan chefsroll läggs till', async ({ page, dismissCookieConsent }) => {
    await installPlaceManagers(page);
    await openPlaceManagers(page, dismissCookieConsent);
    await openArea(page, 'care');
    await treeItem(page, 'south').click();

    await page.locator('[data-cy="add-place-manager-account"]').fill('ulla03');
    await page.locator('[data-cy="add-place-manager-search"]').click();

    await expect(page.locator('[data-cy="add-place-manager-found"]')).toContainText('Saknar chefsroll');
    await expect(page.locator('[data-cy="add-place-manager-without-role"]')).toBeVisible();
    await expect(page.locator('[data-cy="add-place-manager-confirm"]')).toHaveText('Lägg till på alla 1 enhet');
  });

  test('tar bort en person från en enhet först efter en fråga', async ({ page, dismissCookieConsent }) => {
    const trace = await installPlaceManagers(page);
    await openPlaceManagers(page, dismissCookieConsent);
    await selectNorthHome(page);

    await row(page, 'ulla03').locator('[data-cy="place-manager-remove"]').click();
    await expect(page.getByRole('dialog')).toContainText('Vill du ta bort Ulla Utan från Norra hemtjänsten?');
    await page.getByRole('dialog').getByRole('button', { name: 'Nej' }).click();
    await expect(row(page, 'ulla03')).toBeVisible();
    expect(trace.changes).toEqual([]);

    await row(page, 'ulla03').locator('[data-cy="place-manager-remove"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ja' }).click();

    await expect(row(page, 'ulla03')).toHaveCount(0);
    await expect(row(page, 'nora01')).toBeVisible();
    expect(trace.changes).toEqual([{ adAccount: 'ulla03', body: { add: [], remove: ['north-home'] } }]);
  });

  test('säger att behörigheten saknas när BFF:en nekar läsningen', async ({ page, dismissCookieConsent }) => {
    await installPlaceManagers(page, { assignmentStatus: 403 });

    await page.goto('oversikt/');
    await dismissCookieConsent();
    await page.locator('[data-cy="administration-button"]').click();

    await expect(page.locator('[data-cy="place-managers-error"]')).toContainText(
      'Du saknar behörighet att administrera chefer per plats.'
    );
  });

  test('lämnar vyn när en statusknapp i sidomenyn väljs', async ({ page, dismissCookieConsent }) => {
    await installPlaceManagers(page);
    await openPlaceManagers(page, dismissCookieConsent);

    await page.locator('[aria-label="status-button-NEW"]').click();

    await expect(page.locator('[data-cy="place-managers"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="main-table"]')).toBeVisible();
  });
});
