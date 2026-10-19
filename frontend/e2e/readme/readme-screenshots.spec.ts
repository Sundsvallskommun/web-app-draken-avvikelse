import type { Measure } from '../../src/common/data-contracts/supportmanagement/data-contracts';
import type { UnitFollowUpSnapshot } from '../../src/supportmanagement/investigation/avvikelse/follow-up/unit-follow-up-service';
import type { MeasuresSnapshot } from '../../src/supportmanagement/measures/support-measure-service';
import managerRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/utredning-enhetschef.schema-request.json';
import lexRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/utredning-sol-lss.schema-request.json';
import lexDecisionRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/beslut-sol-lss.schema-request.json';
import type { Page, Route } from '@playwright/test';
import path from 'node:path';

import {
  errandNumber,
  errandNumberPrefix,
  existingManagerDocument,
  iafLabelFixture,
  iafPlaceFixture,
  installIafApiMock,
  withPlaceStructure,
} from '../avvikelse/fixtures/investigation-flow.mock';
import { expect, test } from '../fixtures/base.fixture';

/**
 * Takes the screenshots in the repository's README. Every request is mocked, so they show invented people and
 * errands only, and the same command renews them after the interface changes:
 *
 *   yarn dev                    (in one terminal; NEXT_PUBLIC_ENVIRONMENT other than TEST hides the debug panels)
 *   yarn screenshots:readme     (in another)
 *
 * The files land in docs/screenshots at the repository root.
 */

test.use({ viewport: { width: 1920, height: 1080 } });

// The project's tests live in frontend/e2e/readme; the screenshots belong at the repository root.
const screenshotPath = (name: string) =>
  path.join(test.info().project.testDir, '..', '..', '..', 'docs', 'screenshots', `${name}.png`);

const jsonRoute = (page: Page, pattern: string | RegExp, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

/** The development build's own indicator is no part of the application. */
const hideDevelopmentIndicator = (page: Page) =>
  page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.head.appendChild(style);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hide);
    else hide();
  });

async function capture(page: Page, name: string) {
  // Let fonts, icons and transitions settle before the picture is taken.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: screenshotPath(name) });
}

const handlers = [
  { name: 'iaf.test', displayName: 'Testare Iaf', guid: 'guid-self', roleKeys: ['enhetschef'] },
  { name: 'anna.lind', displayName: 'Lind Anna', guid: 'guid-anna', roleKeys: ['enhetschef'] },
  { name: 'karin.berg', displayName: 'Berg Karin', guid: 'guid-karin', roleKeys: ['lex-ansvarig'] },
  { name: 'maria.holm', displayName: 'Holm Maria', guid: 'guid-maria', roleKeys: ['mas-mar'] },
];

// The labels an errand carries, as Support Management returns them.
const reportLabel = (kind: 'deviation' | 'misconduct') => ({
  id: iafLabelFixture.reportType[kind].id,
  classification: 'REPORT_TYPE',
  displayName: kind === 'deviation' ? 'Avvikelse' : 'Missförhållande',
  resourcePath: iafLabelFixture.reportType[kind].resourcePath,
});
const classificationLabels = (
  category: { id: string; displayName: string; resourcePath: string },
  type?: typeof category
) => [{ ...category, classification: 'CATEGORY' }, ...(type ? [{ ...type, classification: 'TYPE' }] : [])];
const { classification } = iafLabelFixture;

const overviewErrand = (
  index: number,
  {
    status,
    priority,
    assignedUserId,
    created,
    labels,
    channel = 'ESERVICE',
  }: {
    status: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    assignedUserId?: string;
    created: string;
    labels: unknown[];
    channel?: string;
  }
) => ({
  id: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
  errandNumber: `${errandNumberPrefix}-2026-${String(index).padStart(4, '0')}`,
  title: 'Avvikelse',
  priority,
  status,
  channel,
  classification: { category: 'NONE', type: 'NONE' },
  stakeholders: [],
  externalTags: [],
  labels,
  ...(assignedUserId ? { assignedUserId } : {}),
  created,
  modified: created,
  touched: created,
});

const overviewErrands = [
  overviewErrand(14, {
    status: 'REVIEW',
    priority: 'HIGH',
    assignedUserId: 'iaf.test',
    created: '2026-10-16T09:12:00.000+02:00',
    labels: [
      reportLabel('deviation'),
      ...classificationLabels(classification.medication, classification.incorrectAdministration),
    ],
  }),
  overviewErrand(13, {
    status: 'INQUIRY',
    priority: 'MEDIUM',
    assignedUserId: 'anna.lind',
    created: '2026-10-15T14:40:00.000+02:00',
    labels: [reportLabel('deviation'), ...classificationLabels(classification.rehab, classification.missedAssessment)],
  }),
  overviewErrand(12, {
    status: 'DECISION',
    priority: 'HIGH',
    assignedUserId: 'karin.berg',
    created: '2026-10-14T08:05:00.000+02:00',
    labels: [
      reportLabel('misconduct'),
      ...classificationLabels(classification.executionDeficiency, classification.supportNotProvided),
    ],
  }),
  overviewErrand(11, {
    status: 'INQUIRY',
    priority: 'LOW',
    assignedUserId: 'iaf.test',
    created: '2026-10-10T11:30:00.000+02:00',
    channel: 'WEB_UI',
    labels: [reportLabel('deviation'), ...classificationLabels(classification.medication)],
  }),
  overviewErrand(10, {
    status: 'FOLLOW_UP',
    priority: 'MEDIUM',
    assignedUserId: 'maria.holm',
    created: '2026-10-08T16:20:00.000+02:00',
    labels: [reportLabel('deviation'), ...classificationLabels(classification.rehab, classification.missedAssessment)],
  }),
  overviewErrand(9, {
    status: 'REVIEW',
    priority: 'MEDIUM',
    assignedUserId: 'karin.berg',
    created: '2026-10-02T10:00:00.000+02:00',
    labels: [
      reportLabel('misconduct'),
      ...classificationLabels(classification.legalCertainty, classification.deficientHandling),
    ],
  }),
];

const errandPage = {
  content: overviewErrands,
  pageable: { pageNumber: 0, pageSize: 12, offset: 0, paged: true, unpaged: false },
  totalPages: 1,
  totalElements: overviewErrands.length,
  size: 12,
  number: 0,
  first: true,
  last: true,
  numberOfElements: overviewErrands.length,
  empty: false,
};

/** Answers the sidebar's counters, one number per status group in the order they are asked for. */
const statusGroupCounts = (page: Page, counts: number[]) =>
  page.route('**/countsupporterrands/**', (route: Route) => {
    const groups: unknown = JSON.parse(new URL(route.request().url()).searchParams.get('statusGroups') ?? '[]');
    const answer = Array.isArray(groups) ? groups.map((_group, index) => counts[index] ?? 0) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ counts: answer }) });
  });

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await expect(page.getByRole('tab', { name: 'Grundinformation', exact: true })).toBeVisible();
}

const investigatedErrand = {
  activePhaseName: 'INVESTIGATION' as const,
  ...withPlaceStructure(),
  roleKeys: ['enhetschef'],
  administrators: handlers,
  brukare: { partyId: 'b0000000-0000-4000-8000-000000000001', firstName: 'Bertil', lastName: 'Brukarsson' },
  documents: { 'utredning-enhetschef': existingManagerDocument() },
  locationManagers: {
    [iafPlaceFixture.northBlue.id]: [{ adAccount: 'iaf.test', displayName: 'Testare Iaf', roleKey: 'UNIT_MANAGER' }],
  },
};

const measureMetadata: MeasuresSnapshot['metadata'] = {
  roles: [
    { id: 'role-manager', name: 'UNIT_MANAGER', displayName: 'Enhetschef' },
    { id: 'role-lex', name: 'LEX_INVESTIGATOR', displayName: 'Lex Sarah' },
  ],
  measureTypes: [
    {
      id: 'dd000000-0000-4000-8000-000000000100',
      name: 'EDUCATION',
      displayName: 'Utbildning',
      measureGroups: ['UNIT_MANAGER', 'SOL_LSS'],
    },
    {
      id: 'dd000000-0000-4000-8000-000000000101',
      name: 'ROUTINE',
      displayName: 'Ny eller ändrad rutin',
      measureGroups: ['UNIT_MANAGER', 'SOL_LSS'],
    },
    {
      id: 'dd000000-0000-4000-8000-000000000102',
      name: 'SUPERVISION',
      displayName: 'Handledning',
      measureGroups: ['UNIT_MANAGER'],
    },
  ],
};

const measures: Measure[] = [
  {
    id: 'measure-routine',
    type: 'ROUTINE',
    version: 2,
    goal: 'Alla i personalgruppen dubbelkontrollerar läkemedel vid överlämning.',
    description: 'Uppdatera rutinen för läkemedelsöverlämning mellan dag- och kvällspersonal.',
    addedByRole: 'UNIT_MANAGER',
    addedByUser: 'iaf.test',
    responsibleUser: 'Testare Iaf',
    accept: 'TRUE',
    plannedStart: '2026-10-20T00:00:00+02:00',
    plannedComplete: '2026-11-15T00:00:00+01:00',
    created: '2026-10-16T10:02:00+02:00',
  },
  {
    id: 'measure-education',
    type: 'EDUCATION',
    version: 1,
    goal: 'Personalen känner igen tecken på felaktig administrering.',
    description: 'Gemensam utbildning i läkemedelshantering för hela enheten.',
    addedByRole: 'LEX_INVESTIGATOR',
    addedByUser: 'karin.berg',
    created: '2026-10-17T13:45:00+02:00',
  },
];

const followUpLabels = {
  unit: (name: string) => [
    { id: 'vof', classification: 'LOCATION', displayName: 'Äldreomsorg' },
    { id: name, classification: 'LOCATION', displayName: name },
  ],
  deviation: {
    id: 'deviation',
    classification: 'report-type',
    displayName: 'Avvikelse',
    resourcePath: 'REPORT_TYPE/DEVIATION',
  },
  misconduct: {
    id: 'abuse',
    classification: 'report-type',
    displayName: 'Missförhållande',
    resourcePath: 'REPORT_TYPE/ABUSE',
  },
  hsl: { id: 'hsl', classification: 'PROVISION', displayName: 'HSL', resourcePath: 'PROVISION/HSL' },
  sol: { id: 'sol', classification: 'PROVISION', displayName: 'SoL', resourcePath: 'PROVISION/SOL' },
  medication: {
    id: 'medication',
    classification: 'category',
    displayName: 'Läkemedelshantering',
    resourcePath: 'CATEGORY/HSL/MEDICATION',
  },
  administration: {
    id: 'administration',
    classification: 'type',
    displayName: 'Felaktig administrering',
    resourcePath: 'CATEGORY/HSL/MEDICATION/INCORRECT_ADMINISTRATION',
  },
  rehab: { id: 'rehab', classification: 'category', displayName: 'Rehab', resourcePath: 'CATEGORY/HSL/REHAB' },
  execution: {
    id: 'execution',
    classification: 'category',
    displayName: 'Brister i utförandet av insatser',
    resourcePath: 'CATEGORY/SOL_LSS/EXECUTION_DEFICIENCY',
  },
};

const followUpErrand = (
  number: number,
  status: string,
  created: string,
  labels: unknown[],
  investigation: UnitFollowUpSnapshot['errands'][number]['investigation'],
  errandMeasures: UnitFollowUpSnapshot['errands'][number]['measures'] = []
): UnitFollowUpSnapshot['errands'][number] => ({
  id: `follow-up-${number}`,
  errandNumber: `${errandNumberPrefix}-2026-${String(number).padStart(4, '0')}`,
  status,
  created,
  labels: labels as UnitFollowUpSnapshot['errands'][number]['labels'],
  investigation,
  measures: errandMeasures,
});

const { unit, deviation, misconduct, hsl, sol, medication, administration, rehab, execution } = followUpLabels;

const followUpSnapshot: UnitFollowUpSnapshot = {
  errands: [
    followUpErrand(
      14,
      'ONGOING',
      '2026-10-16T09:12:00.000+02:00',
      [deviation, hsl, medication, administration, ...unit('Norra hemmet')],
      {
        legalBases: ['HSL'],
        riskValueHsl: 6,
        causeAreas: ['procedures_routines_guidelines'],
        policeReportHsl: 'not_applicable',
      },
      [{ id: 'f1', type: 'ROUTINE', addedByUser: 'iaf.test', accept: 'TRUE', plannedStart: '2026-10-20' }]
    ),
    followUpErrand(
      12,
      'ONGOING',
      '2026-10-14T08:05:00.000+02:00',
      [misconduct, sol, execution, ...unit('Södra hemmet')],
      {
        legalBases: ['SOL'],
        riskValueSolLss: 9,
        causeAreas: ['people_knowledge_competence'],
        ivoNotification: 'yes',
        decidedMisconductDegree: 'serious_misconduct',
        policeReportSolLss: 'no',
      },
      [
        {
          id: 'f2',
          type: 'EDUCATION',
          addedByUser: 'karin.berg',
          accept: 'TRUE',
          plannedStart: '2026-09-01',
          executed: '2026-10-01',
          result: 'COMPLETED',
          resultText: 'Utbildningen genomfördes för hela personalgruppen.',
        },
      ]
    ),
    followUpErrand(10, 'ONGOING', '2026-10-08T16:20:00.000+02:00', [deviation, hsl, rehab, ...unit('Norra hemmet')], {
      legalBases: ['HSL'],
      riskValueHsl: 3,
      causeAreas: ['communication_information'],
      policeReportHsl: 'not_applicable',
    }),
    followUpErrand(
      7,
      'SOLVED',
      '2026-08-21T10:00:00.000+02:00',
      [deviation, hsl, medication, ...unit('Södra hemmet')],
      {
        legalBases: ['HSL'],
        riskValueHsl: 4,
        causeAreas: ['procedures_routines_guidelines'],
        ivoNotification: 'no',
        policeReportHsl: 'no',
      },
      [{ id: 'f3', type: 'ROUTINE', accept: 'TRUE', executed: '2026-09-15', result: 'COMPLETED' }]
    ),
    followUpErrand(3, 'NEW', '2026-06-15T08:00:00.000+02:00', [deviation, hsl, ...unit('Norra hemmet')], {
      legalBases: ['HSL'],
      causeAreas: [],
    }),
  ],
  measureTypes: [
    { name: 'EDUCATION', displayName: 'Utbildning' },
    { name: 'ROUTINE', displayName: 'Ny eller ändrad rutin' },
  ],
  truncated: false,
};

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

/** The statuses the namespace names, so the overview shows each phase's status by its name. */
const statuses = [
  { name: 'NEW', displayName: 'Ny' },
  { name: 'REVIEW', displayName: 'Granskning' },
  { name: 'INQUIRY', displayName: 'Utredning' },
  { name: 'DECISION', displayName: 'Beslut' },
  { name: 'FOLLOW_UP', displayName: 'Uppföljning' },
  { name: 'ONGOING', displayName: 'Pågående' },
  { name: 'ASSIGNED', displayName: 'Tilldelad' },
  { name: 'SOLVED', displayName: 'Avslutat' },
];

/** The profile the overview pages are drawn with: no document is read there. */
const overviewProfile = { state: 'active', registration: { mode: 'disabled' }, documents: [] };

async function installOverview(page: Page, roleKeys: string[]) {
  await installIafApiMock(page, { roleKeys, administrators: handlers, statuses });
  await jsonRoute(page, '**/supportmanagement/investigation-profile', overviewProfile);
  await statusGroupCounts(page, [3, 6, 2, 41]);
  await jsonRoute(page, /\/supporterrands\/2281\?/, errandPage);
}

test.describe('README', () => {
  test.beforeEach(async ({ page }) => {
    await hideDevelopmentIndicator(page);
  });

  test('översikten', async ({ page, dismissCookieConsent }) => {
    await installOverview(page, ['enhetschef']);

    await page.goto('oversikt/');
    await dismissCookieConsent();
    await page.locator('[aria-label="status-button-INQUIRY"]').click();
    await expect(page.locator('[data-cy="main-table"] .sk-table-tbody-tr')).toHaveCount(overviewErrands.length);

    await capture(page, 'oversikt');
  });

  test('ärendet och dess utredning', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, investigatedErrand);
    await visitErrand(page, dismissCookieConsent);

    await page.getByRole('tab', { name: 'Grundinformation', exact: true }).click();
    await capture(page, 'arende');

    await page.getByRole('tab', { name: 'Utredning', exact: true }).click();
    await capture(page, 'utredning');
  });

  test('åtgärderna', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, investigatedErrand);
    await page.route(/\/supporterrands\/[^/]+\/[^/]+\/measures$/, (route: Route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            json: {
              measures,
              errandVersion: 7,
              metadata: measureMetadata,
              creationRoles: measureMetadata.roles.slice(0, 1),
              registration: {
                status: 'ready',
                roleTypes: [
                  { roleName: 'UNIT_MANAGER', measureTypes: ['EDUCATION', 'ROUTINE', 'SUPERVISION'], decides: true },
                ],
              },
              canWrite: true,
              mayFollowUp: true,
            } satisfies MeasuresSnapshot,
          })
        : route.fallback()
    );
    await visitErrand(page, dismissCookieConsent);

    await page.getByRole('tab', { name: 'Åtgärder', exact: true }).click();
    // The registered measures, rather than the form for a new one above them.
    const listHeading = page.getByRole('heading', { name: /^Tillagda åtgärder/ });
    await expect(listHeading).toBeVisible();
    await listHeading.evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
    await capture(page, 'atgarder');
  });

  test('verksamhetsuppföljningen', async ({ page, dismissCookieConsent }) => {
    await installOverview(page, ['verksamhetschef']);
    for (const request of [managerRequest, lexRequest, lexDecisionRequest]) {
      await latestSchema(page, { name: request.name, version: request.version, value: request.value });
    }
    await jsonRoute(page, '**/supportfollowup/2281/units?**', followUpSnapshot);

    await page.goto('oversikt/');
    await dismissCookieConsent();
    // The sidebar's counters come with the errand list, which the follow-up replaces.
    await expect(page.locator('[aria-label="status-button-INQUIRY"]')).toContainText('6');
    await page.locator('[data-cy="follow-up-button"]').click();
    await expect(page.locator('[data-cy="follow-up-errands-table"] tbody tr')).toHaveCount(
      followUpSnapshot.errands.length
    );

    await capture(page, 'verksamhetsuppfoljning');
  });
});
