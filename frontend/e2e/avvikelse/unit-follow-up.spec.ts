import type { Page, Route } from '@playwright/test';

import lexDecisionRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/beslut-sol-lss.schema-request.json';
import managerRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/utredning-enhetschef.schema-request.json';
import lexRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/utredning-sol-lss.schema-request.json';
import type { UnitFollowUpSnapshot } from '../../src/supportmanagement/investigation/avvikelse/follow-up/unit-follow-up-service';
import { mockAdmins, mockNoAdmins } from '../fixtures/mockAdmins';
import { mockMe } from '../fixtures/mockMe';
import { expect, test } from '../fixtures/base.fixture';
import { mockStatusGroupCounts } from '../utils/status-group-counts';
import { defaultInvestigationProfile, errandNumberPrefix } from './fixtures/investigation-flow.mock';

/**
 * Verksamhetsuppföljning - Enheter: a sidebar entry of the avvikelse investigation swaps the errand table
 * for the errands and measures of the units the user reaches. The BFF reads them; the browser names,
 * filters and sorts what it is given.
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

const unit = (name: string) => [
  { id: 'vof', classification: 'LOCATION', displayName: 'VOF' },
  { id: name, classification: 'LOCATION', displayName: name },
];
// As Support Management spells the classifications: report-type, category and type.
const deviation = {
  id: 'deviation',
  classification: 'report-type',
  displayName: 'Avvikelse',
  resourcePath: 'REPORT_TYPE/DEVIATION',
};
const misconduct = {
  id: 'abuse',
  classification: 'report-type',
  displayName: 'Missförhållande',
  resourcePath: 'REPORT_TYPE/ABUSE',
};
const hsl = { id: 'hsl', classification: 'PROVISION', displayName: 'HSL', resourcePath: 'PROVISION/HSL' };
const sol = { id: 'sol', classification: 'PROVISION', displayName: 'SoL', resourcePath: 'PROVISION/SOL' };
const pressureUlcer = {
  id: 'pressure-ulcer',
  classification: 'category',
  displayName: 'Trycksår',
  resourcePath: 'CATEGORY/HSL/PRESSURE_ULCER',
};
const pressureUlcerGrade = (grade: number) => ({
  id: `pressure-ulcer-grade-${grade}`,
  classification: 'type',
  displayName: `Grad ${grade}`,
  resourcePath: `CATEGORY/HSL/PRESSURE_ULCER/GRADE_${grade}`,
});
const physicalAbuse = {
  id: 'physical-abuse',
  classification: 'category',
  displayName: 'Fysiska övergrepp',
  resourcePath: 'CATEGORY/SOL_LSS/PHYSICAL_ABUSE',
};
const violenceBetweenClients = {
  id: 'violence-between-clients',
  classification: 'type',
  displayName: 'Våld mellan brukare',
  resourcePath: 'CATEGORY/SOL_LSS/PHYSICAL_ABUSE/VIOLENCE_BETWEEN_CLIENTS',
};

const snapshot: UnitFollowUpSnapshot = {
  errands: [
    {
      id: 'e8',
      errandNumber: `${errandNumberPrefix}-2026-0008`,
      status: 'INQUIRY',
      created: '2026-05-03T09:00:00.000+02:00',
      labels: [deviation, hsl, pressureUlcer, pressureUlcerGrade(2), ...unit('Granlunda 1')],
      investigation: {
        legalBases: ['HSL'],
        riskValueHsl: 3,
        causeAreas: ['communication_information'],
        policeReportHsl: 'not_applicable',
      },
      measures: [],
    },
    {
      id: 'e11',
      errandNumber: `${errandNumberPrefix}-2026-0011`,
      status: 'INQUIRY',
      created: '2026-05-24T10:00:00.000+02:00',
      labels: [misconduct, sol, physicalAbuse, violenceBetweenClients, ...unit('Granlunda 2')],
      investigation: {
        // LEX found the misconduct falls under LSS, whatever the report was filed under.
        legalBases: ['LSS'],
        riskValueSolLss: 9,
        causeAreas: ['procedures_routines_guidelines'],
        ivoNotification: 'yes',
        decidedMisconductDegree: 'serious_misconduct',
        policeReportSolLss: 'yes',
      },
      measures: [
        {
          id: 'm1',
          type: 'EDUCATION',
          addedByUser: 'kctest',
          accept: 'TRUE',
          plannedStart: '2026-02-01',
          executed: '2026-03-02',
          result: 'COMPLETED',
          description: 'Utbilda personalen i bemötande',
          goal: 'Inga fler klagomål',
          resultText: 'Utbildningen genomfördes.',
        },
        { id: 'm2', type: 'DISCIPLINARY', addedByUser: 'kctest', accept: 'TRUE' },
      ],
    },
    {
      id: 'e10',
      errandNumber: `${errandNumberPrefix}-2026-0010`,
      status: 'SOLVED',
      created: '2026-05-17T08:00:00.000+02:00',
      labels: [deviation, hsl, pressureUlcer, pressureUlcerGrade(3), ...unit('Granlunda 1')],
      investigation: {
        legalBases: ['HSL'],
        riskValueHsl: 6,
        causeAreas: ['procedures_routines_guidelines'],
        ivoNotification: 'no',
        policeReportHsl: 'yes',
      },
      measures: [{ id: 'm3', type: 'EDUCATION', accept: 'TRUE', executed: '2026-04-05', result: 'NOT_COMPLETED' }],
    },
    {
      // Still new long after it was registered: the card for errands nobody has started on counts it.
      id: 'e3',
      errandNumber: `${errandNumberPrefix}-2026-0003`,
      status: 'NEW',
      created: '2026-01-15T08:00:00.000+01:00',
      // Reported under HSL but not investigated yet: the BFF counts it under the legal base it was reported under.
      labels: [deviation, hsl, ...unit('Granlunda 1')],
      investigation: { legalBases: ['HSL'], causeAreas: [] },
      measures: [],
    },
  ],
  measureTypes: [
    { name: 'EDUCATION', displayName: 'Utbildning' },
    { name: 'DISCIPLINARY', displayName: 'Disciplinåtgärd' },
  ],
  truncated: false,
};

const jsonRoute = (page: Page, pattern: string | RegExp, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

const latestSchema = (page: Page, request: { name: string; version: string; value: unknown }) =>
  jsonRoute(page, `**/2281/schemas/${request.name}/latest`, {
    data: {
      id: `2281_${request.name}_${request.version}`,
      name: request.name,
      version: request.version,
      value: request.value,
    },
    message: 'success',
  });

/** The signed-in user, with the handler roles `/me` names for them. */
const meWithRoles = (roleKeys: string[]) => ({ ...mockMe, data: { ...mockMe.data, roleKeys, superadmin: false } });

async function installFollowUp(page: Page, me: unknown = mockMe) {
  const reads: URL[] = [];
  await page.context().addCookies([{ name: 'connect.sid', value: 'test-session', domain: 'localhost', path: '/' }]);
  await jsonRoute(page, '**/administrators', mockAdmins);
  await jsonRoute(page, '**/me', me);
  await jsonRoute(page, '**/users/admins', mockNoAdmins);
  await jsonRoute(page, '**/supportnotifications/2281', []);
  await jsonRoute(page, '**/supportmanagement/investigation-profile', defaultInvestigationProfile());
  await mockStatusGroupCounts(page, 0);
  await jsonRoute(page, '**/supportmetadata/2281', {
    categories: [],
    types: [],
    statuses: [
      { name: 'NEW', displayName: 'Ny' },
      { name: 'INQUIRY', displayName: 'Pågående' },
      { name: 'SOLVED', displayName: 'Avslutat' },
    ],
    labels: { labelStructure: [] },
  });
  await jsonRoute(page, /\/supporterrands\/2281\?/, emptyErrandPage);
  await latestSchema(page, { name: managerRequest.name, version: managerRequest.version, value: managerRequest.value });
  await latestSchema(page, { name: lexRequest.name, version: lexRequest.version, value: lexRequest.value });
  await latestSchema(page, {
    name: lexDecisionRequest.name,
    version: lexDecisionRequest.version,
    value: lexDecisionRequest.value,
  });
  await page.route('**/supportfollowup/2281/units?**', async (route) => {
    reads.push(new URL(route.request().url()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) });
  });
  return reads;
}

async function openFollowUp(page: Page, dismissCookieConsent: () => Promise<void>, heading = 'Enheter') {
  await page.goto('oversikt/');
  await dismissCookieConsent();
  await page.locator('[data-cy="follow-up-button"]').click();
  await expect(page.locator('[data-cy="unit-follow-up"]').getByRole('heading', { level: 1 })).toHaveText(heading);
}

const errandRows = (page: Page) => page.locator('[data-cy="follow-up-errands-table"] tbody tr');
const summary = (page: Page) => page.locator('[data-cy="follow-up-summary"]');
const keyFigure = (page: Page, key: string) => page.locator(`[data-cy="follow-up-key-figure-${key}"]`);
const keyFigureCount = (page: Page, key: string) => page.locator(`[data-cy="follow-up-key-figure-${key}-count"]`);

async function chooseUnit(page: Page, name: string) {
  await page.locator('[data-cy="follow-up-filter-unit-input"]').click();
  await page.getByRole('option', { name, exact: true }).click();
  await page.keyboard.press('Escape');
}

test.describe('Verksamhetsuppföljning - Enheter', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('visar de senaste tolv månadernas ärenden, nyaste först, med utredningarnas värden', async ({
    page,
    dismissCookieConsent,
  }) => {
    const reads = await installFollowUp(page);
    await openFollowUp(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="follow-up-period"]')).toContainText('Visar de senaste 12 månaderna');
    expect(reads.length).toBeGreaterThanOrEqual(1);
    expect(reads[0].searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(reads[0].searchParams.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

    await expect(summary(page)).toHaveText('Visar 4 ärenden');
    await expect(errandRows(page)).toHaveCount(4);
    const first = errandRows(page).first();
    await expect(first).toContainText('Granlunda 2');
    await expect(first).toContainText('Missförhållande');
    // Titles come from the current schema, not the stored code.
    await expect(first).toContainText('Processer, rutiner, arbetssätt, riktlinjer');
    await expect(first).toContainText('2026-05-24');
    await expect(first).toContainText('9');
    await expect(first).toContainText('Allvarligt missförhållande');
    await expect(first).toContainText('2 stycken');
    await expect(errandRows(page).nth(1)).toContainText('2026-05-17');
  });

  // The row opens its errand on Enter, and so does the open button inside it - once per press, not once for each.
  test('öppnar ärendet en gång per Enter, från raden och från dess öppna-knapp', async ({
    page,
    dismissCookieConsent,
  }) => {
    await page.addInitScript(() => {
      const opened: string[] = [];
      Object.assign(window, { openedErrands: opened });
      window.open = (url?: string | URL) => {
        opened.push(String(url));
        return null;
      };
    });
    await installFollowUp(page);
    await openFollowUp(page, dismissCookieConsent);
    const openedErrands = () =>
      page.evaluate(() => (window as unknown as { openedErrands: string[] }).openedErrands.length);
    const first = errandRows(page).first();

    await first.getByRole('button', { name: /^Öppna ärende/u }).focus();
    await page.keyboard.press('Enter');
    await expect.poll(openedErrands).toBe(1);

    await first.focus();
    await page.keyboard.press('Enter');
    await expect.poll(openedErrands).toBe(2);
  });

  // Planned measures are followed up across the units, so they sit under Verksamhetsuppföljning, after Enheter.
  test('visar Planerade åtgärder under Verksamhetsuppföljning', async ({ page, dismissCookieConsent }) => {
    await installFollowUp(page);
    await page.goto('oversikt/');
    await dismissCookieConsent();

    const group = page.locator('[data-cy="follow-up-button"]').locator('..');
    await expect(group).toContainText('Verksamhetsuppföljning');
    await expect(group.locator('button')).toHaveText(['Enheter', 'Planerade åtgärder']);
  });

  // Polisanmälan HSL is the unit manager's answer, Polisanmälan SoL/LSS LEX's; an errand is kept for either. The
  // measures are not narrowed by them, and the Åtgärder tab does not offer them.
  test('filtrerar på polisanmälan HSL eller SoL/LSS, och bara bland ärendena', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installFollowUp(page);
    await openFollowUp(page, dismissCookieConsent);

    await page.locator('[data-cy="follow-up-filter-police"]').click();
    await expect(page.locator('[data-cy^="follow-up-filter-police-"]')).toHaveCount(2);
    // The checkbox's drawn box sits over the input and takes the pointer; a user clicks that box.
    await page.locator('[data-cy="follow-up-filter-police-hsl"]').check({ force: true });
    await expect(summary(page)).toHaveText('Visar 1 ärende');
    // The HSL deviation the unit manager answered Ja for, registered 17 May.
    await expect(errandRows(page).first()).toContainText('2026-05-17');
    await page.locator('[data-cy="follow-up-filter-police-sol_lss"]').check({ force: true });
    await page.keyboard.press('Escape');
    await expect(summary(page)).toHaveText('Visar 2 ärenden');

    await page.locator('[data-cy="follow-up-tab-measures"]').click();
    await expect(page.locator('[data-cy="follow-up-filter-police"]')).toHaveCount(0);
    await expect(summary(page)).toHaveText('Visar 3 åtgärder');
  });

  // Ärendetyp and Underkategori are the errand's categorization labels; they narrow the measures by their errand too.
  test('filtrerar på ärendetyp och underkategori, bland ärendena och åtgärderna', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installFollowUp(page);
    await openFollowUp(page, dismissCookieConsent);

    await page.locator('[data-cy="follow-up-filter-category"]').click();
    await expect(page.locator('[data-cy^="follow-up-filter-category-"]')).toHaveCount(2);
    await page.locator('[data-cy="follow-up-filter-category-pressure-ulcer"]').check({ force: true });
    await page.keyboard.press('Escape');
    await expect(summary(page)).toHaveText('Visar 2 ärenden');

    await page.locator('[data-cy="follow-up-filter-subcategory"]').click();
    await page.locator('[data-cy="follow-up-filter-subcategory-pressure-ulcer-grade-3"]').check({ force: true });
    await page.keyboard.press('Escape');
    await expect(summary(page)).toHaveText('Visar 1 ärende');
    // The pressure ulcer of grade 3, registered 17 May.
    await expect(errandRows(page).first()).toContainText('2026-05-17');

    await page.locator('[data-cy="follow-up-tab-measures"]').click();
    await expect(summary(page)).toHaveText('Visar 1 åtgärd');
    await page.locator('[data-cy="follow-up-filter-clear"]').click();
    await page.locator('[data-cy="follow-up-filter-category"]').click();
    await page.locator('[data-cy="follow-up-filter-category-physical-abuse"]').check({ force: true });
    await page.keyboard.press('Escape');
    await expect(summary(page)).toHaveText('Visar 2 åtgärder');
  });

  test('filtrerar på rapporttyp, riskvärde och enhet, och Rensa alla visar allt igen', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installFollowUp(page);
    await openFollowUp(page, dismissCookieConsent);

    await page.locator('[data-cy="follow-up-filter-report-type"]').click();
    // The checkbox's drawn box sits over the input and takes the pointer; a user clicks that box.
    await page.locator('[data-cy="follow-up-filter-report-type-abuse"]').check({ force: true });
    await page.keyboard.press('Escape');
    await expect(summary(page)).toHaveText('Visar 1 ärende');
    await expect(errandRows(page)).toHaveCount(1);

    await page.locator('[data-cy="follow-up-filter-clear"]').click();
    await expect(summary(page)).toHaveText('Visar 4 ärenden');

    // The risk values offered are the ones probability times severity can give.
    const riskHsl = page.locator('[data-cy="follow-up-filter-risk-hsl"]');
    await expect(riskHsl.locator('option')).toHaveCount(10);
    await riskHsl.selectOption('6');
    await expect(errandRows(page)).toHaveCount(1);
    await expect(errandRows(page).first()).toContainText('2026-05-17');
    await page.locator('[data-cy="follow-up-filter-clear"]').click();

    await chooseUnit(page, 'Granlunda 1');
    await expect(errandRows(page)).toHaveCount(3);
    await expect(page.locator('[data-cy="follow-up-filter-chips"]')).toContainText('Enhet: Granlunda 1');
  });

  test('visar lägeskort för perioden och de valda enheterna, och ärendena bakom ett kort', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installFollowUp(page);
    await openFollowUp(page, dismissCookieConsent);

    await expect(keyFigureCount(page, 'deviations')).toHaveText('3');
    await expect(keyFigureCount(page, 'misconducts')).toHaveText('1');
    await expect(keyFigureCount(page, 'legalBaseHsl')).toHaveText('3');
    await expect(keyFigureCount(page, 'legalBaseSolLss')).toHaveText('1');
    await expect(keyFigureCount(page, 'notStarted')).toHaveText('1');
    await expect(keyFigure(page, 'notStarted')).toHaveClass(/bg-warning-background-200/u);
    await expect(keyFigure(page, 'deviations')).not.toHaveClass(/bg-warning/u);

    // A card shows the errands behind its number, and lets go of the filters that would hide some of them.
    await page.locator('[data-cy="follow-up-filter-report-type"]').click();
    await page.locator('[data-cy="follow-up-filter-report-type-abuse"]').check({ force: true });
    await page.keyboard.press('Escape');
    await keyFigure(page, 'notStarted').click();
    await expect(keyFigure(page, 'notStarted')).toHaveAttribute('aria-pressed', 'true');
    await expect(summary(page)).toHaveText('Visar 1 ärende');
    await expect(errandRows(page).first()).toContainText('2026-01-15');
    const chips = page.locator('[data-cy="follow-up-filter-chips"]');
    await expect(chips.getByRole('button')).toHaveCount(1);
    await expect(chips).toContainText('Ej påbörjade ärenden (>30 dagar)');

    // The chip lets the card go again.
    await page.locator('[data-cy="follow-up-filter-chip-keyFigure"]').click();
    await expect(keyFigure(page, 'notStarted')).toHaveAttribute('aria-pressed', 'false');
    await expect(summary(page)).toHaveText('Visar 4 ärenden');
    await expect(chips).toHaveCount(0);

    // The cards count the chosen units only.
    await chooseUnit(page, 'Granlunda 2');
    await expect(keyFigureCount(page, 'deviations')).toHaveText('0');
    await expect(keyFigureCount(page, 'misconducts')).toHaveText('1');
    await expect(keyFigureCount(page, 'legalBaseSolLss')).toHaveText('1');
    await expect(keyFigureCount(page, 'notStarted')).toHaveText('0');
    await expect(keyFigure(page, 'notStarted')).not.toHaveClass(/bg-warning/u);
    await expect(summary(page)).toHaveText('Visar 1 ärende');
  });

  test('heter Verksamhetsområde för LEX, som följer upp hela verksamhetsområdet', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installFollowUp(page, meWithRoles(['lex-ansvarig']));
    await openFollowUp(page, dismissCookieConsent, 'Verksamhetsområde');

    await expect(page.locator('[data-cy="follow-up-button"]')).toHaveText('Verksamhetsområde');
  });

  test('heter Enhet för enhetschefen, och Enheter på sidan när ärendena ligger på flera enheter', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installFollowUp(page, meWithRoles(['enhetschef']));
    // The errands span Granlunda 1 and 2: Support Management lets this unit manager reach both.
    await openFollowUp(page, dismissCookieConsent, 'Enheter');

    await expect(page.locator('[data-cy="follow-up-button"]')).toHaveText('Enhet');
  });

  test('listar ärendenas åtgärder med status och effekt, och fäller ut en åtgärd', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installFollowUp(page);
    await openFollowUp(page, dismissCookieConsent);

    await page.locator('[data-cy="follow-up-tab-measures"]').click();
    await expect(summary(page)).toHaveText('Visar 3 åtgärder');
    const table = page.locator('[data-cy="follow-up-measures-table"]');
    // Sorted on type: Disciplinåtgärd before Utbildning.
    await expect(table.locator('tbody tr').first()).toContainText('Disciplinåtgärd');
    await expect(table.locator('tbody tr').first()).toContainText('Planerad');

    await page.locator('[data-cy="follow-up-filter-effect"]').click();
    // The checkbox's drawn box sits over the input and takes the pointer; a user clicks that box.
    await page.locator('[data-cy="follow-up-filter-effect-yes"]').check({ force: true });
    await page.keyboard.press('Escape');
    await expect(summary(page)).toHaveText('Visar 1 åtgärd');
    const executed = table.locator('tbody tr').first();
    await expect(executed).toContainText('Utbildning');
    await expect(executed).toContainText('Genomförd');
    await expect(executed).toContainText('2026-02-01');
    await expect(executed).toContainText('2026-03-02');
    await expect(executed.getByRole('link', { name: `${errandNumberPrefix}-2026-0011` })).toHaveAttribute(
      'target',
      '_blank'
    );

    await executed.getByRole('button', { name: /Visa åtgärden/u }).click();
    await expect(page.locator('[data-cy="follow-up-measure-details-e11:m1"]')).toContainText(
      'Utbildningen genomfördes.'
    );
  });
});
