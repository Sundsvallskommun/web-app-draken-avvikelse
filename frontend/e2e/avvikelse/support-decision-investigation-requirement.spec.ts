import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import {
  errandNumber,
  existingManagerDocument,
  installIafApiMock,
  type IafApiScenario,
  solDeviationScenario,
} from './fixtures/investigation-flow.mock';

/**
 * The errand is being investigated. Signed in as the handler, so the sidebar is the handler's to use.
 */
async function installInvestigatedErrand(
  page: Page,
  {
    eventType = 'AVVIKELSE',
    managerValue = {},
    lexValue,
    roleKeys,
    activePhaseName = 'INVESTIGATION',
    ...scenario
  }: {
    eventType?: 'AVVIKELSE' | 'MISSFORHALLANDE';
    managerValue?: Record<string, unknown>;
    lexValue?: Record<string, unknown>;
    roleKeys?: string[];
    activePhaseName?: IafApiScenario['activePhaseName'];
  } & Pick<
    IafApiScenario,
    'administrators' | 'assignedBy' | 'measuresCloseRefusal' | 'measuresFollowUpRefusal' | 'labels' | 'classification'
  >
) {
  const manager = existingManagerDocument();
  manager.value = { ...manager.value, ...managerValue };
  return installIafApiMock(page, {
    ...scenario,
    activePhaseName,
    assignedUserId: 'iaf.test',
    eventType,
    roleKeys,
    documents: {
      'utredning-enhetschef': manager,
      ...(lexValue
        ? {
            'utredning-sol-lss': {
              ...manager,
              key: 'utredning-sol-lss',
              schemaId: '2281_utredning-sol-lss_1.4',
              value: lexValue,
            },
          }
        : {}),
    },
  });
}

const nextPhaseButton = (page: Page) => page.locator('[data-cy="next-phase-button"]');
const requirementDialog = (page: Page) => page.locator('[data-cy="investigation-completion-requirement"]');

/** The errand has no measures, so the move to the decision asks first; the handler goes ahead all the same. */
async function confirmDecisionWithoutMeasures(page: Page) {
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Gå till beslutsfasen?' })
    .getByRole('button', { name: 'Ja, byt fas', exact: true })
    .click();
}

async function openErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
}

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  await openErrand(page, dismissCookieConsent);
  await expect(nextPhaseButton(page)).toBeEnabled();
}

test("an unfinished unit manager's investigation holds the errand in Utredning and says which one to finish", async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installInvestigatedErrand(page, { managerValue: { completed: 'no' } });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Utredningen är inte klar');
  await nextPhaseButton(page).click();
  await expect(requirementDialog(page)).toContainText(
    'Utredning enhetschef måste vara markerad som klar och sparad innan ärendet kan skickas till beslut.'
  );
  await requirementDialog(page).getByRole('button', { name: 'Stäng', exact: true }).click();

  await expect(requirementDialog(page)).toHaveCount(0);
  expect(trace.phasePatches).toEqual([]);
});

test("a completed unit manager's investigation sends the errand to the decision", async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installInvestigatedErrand(page, { managerValue: { completed: 'yes' } });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Redo för beslut');
  await nextPhaseButton(page).click();
  await confirmDecisionWithoutMeasures(page);

  await expect.poll(() => trace.phasePatches.length).toBe(1);
  await expect(requirementDialog(page)).toHaveCount(0);
});

test("a reported misconduct waits for the lex Sarah investigation, not the unit manager's", async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installInvestigatedErrand(page, {
    eventType: 'MISSFORHALLANDE',
    managerValue: { completed: 'yes' },
    lexValue: { completed: 'no' },
  });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Utredningen är inte klar');
  await nextPhaseButton(page).click();
  await expect(requirementDialog(page)).toContainText('beslutas på Utredning Lex Sarah');
  expect(trace.phasePatches).toEqual([]);
});

test('a LEX investigator hands the errand to a LEX manager rather than sending it to the decision', async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installInvestigatedErrand(page, {
    eventType: 'MISSFORHALLANDE',
    managerValue: { completed: 'yes' },
    // A finished investigation does not let the investigator through either.
    lexValue: { completed: 'yes' },
    roleKeys: ['lex-utredare'],
  });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Tilldela LEX-ansvarig');
  await nextPhaseButton(page).click();
  const dialog = page.locator('[data-cy="handler-assignment-modal"]');
  await expect(dialog).toContainText('Som LEX-utredare skickar du inte ärendet till beslut.');
  expect(trace.phasePatches).toEqual([]);
});

// The investigator hands the errand back to the LEX manager who gave it to them, not to whoever sorts first.
test("a LEX investigator's handover offers first the LEX manager who gave them the errand", async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installInvestigatedErrand(page, {
    eventType: 'MISSFORHALLANDE',
    managerValue: { completed: 'yes' },
    lexValue: { completed: 'yes' },
    roleKeys: ['lex-utredare'],
    administrators: [
      { name: 'iaf.test', displayName: 'Testare Iaf', guid: 'guid-investigator', roleKeys: ['lex-utredare'] },
      { name: 'lex.first', displayName: 'Anna Ahlberg', guid: 'guid-first', roleKeys: ['lex-ansvarig'] },
      { name: 'lex.giver', displayName: 'Örjan Östberg', guid: 'guid-giver', roleKeys: ['lex-ansvarig'] },
    ],
    // The history names the account as Support Management recorded it, which need not match its case.
    assignedBy: 'LEX.GIVER',
  });
  await visitErrand(page, dismissCookieConsent);

  await nextPhaseButton(page).click();
  const dialog = page.locator('[data-cy="handler-assignment-modal"]');
  await expect(dialog.getByRole('combobox')).toHaveValue('lex.giver');
  await dialog.locator('[data-cy="handler-assignment-confirm"]').click();

  await expect.poll(() => trace.adminPatches).toEqual(['lex.giver']);
  expect(trace.phasePatches).toEqual([]);
});

// Creating the report moves the errand's version several steps. The page follows them, so handing the errand on
// right afterwards is not refused as somebody else's change.
test('a LEX investigator hands the errand on right after creating the report', async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installInvestigatedErrand(page, {
    eventType: 'MISSFORHALLANDE',
    managerValue: { completed: 'yes' },
    lexValue: { completed: 'yes' },
    roleKeys: ['lex-utredare'],
    administrators: [
      { name: 'iaf.test', displayName: 'Testare Iaf', guid: 'guid-investigator', roleKeys: ['lex-utredare'] },
      { name: 'lex.giver', displayName: 'Örjan Östberg', guid: 'guid-giver', roleKeys: ['lex-ansvarig'] },
    ],
    assignedBy: 'lex.giver',
  });
  await visitErrand(page, dismissCookieConsent);

  await page.getByRole('tab', { name: 'Utredning', exact: true }).click();
  await page.getByRole('tab', { name: 'Utredning Lex Sarah', exact: true }).click();
  await page.locator('[data-cy="investigation-report-generate"]:visible').click();
  await expect.poll(() => trace.reports.filter((report) => !report.preview).length).toBe(1);
  await expect(page.locator('[data-cy="investigation-report-list"]:visible')).toContainText('Rapport_1.pdf');

  await nextPhaseButton(page).click();
  const dialog = page.locator('[data-cy="handler-assignment-modal"]');
  await dialog.locator('[data-cy="handler-assignment-confirm"]').click();

  await expect.poll(() => trace.adminPatches).toEqual(['lex.giver']);
  await expect(dialog.getByText('någon annan har ändrat ärendet')).toHaveCount(0);
});

test('a LEX manager sends the finished lex Sarah investigation to the decision', async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installInvestigatedErrand(page, {
    eventType: 'MISSFORHALLANDE',
    managerValue: { completed: 'yes' },
    lexValue: { completed: 'yes' },
    roleKeys: ['lex-ansvarig'],
  });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Redo för beslut');
  await nextPhaseButton(page).click();
  await confirmDecisionWithoutMeasures(page);
  await expect.poll(() => trace.phasePatches.length).toBe(1);
});

/** The follow-up is the unit's: LEX hands the decided errand back to its manager, who starts it. */
test('a LEX manager is not offered the follow-up', async ({ page, dismissCookieConsent }) => {
  const trace = await installInvestigatedErrand(page, {
    eventType: 'MISSFORHALLANDE',
    activePhaseName: 'DECISION',
    roleKeys: ['lex-ansvarig'],
  });
  await openErrand(page, dismissCookieConsent);

  // The sidebar is drawn, and has no move to the follow-up in it.
  await expect(page.locator('[data-cy="manage-sidebar"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inled uppföljning', exact: true })).toHaveCount(0);
  await expect(nextPhaseButton(page)).toHaveCount(0);
  expect(trace.phasePatches).toEqual([]);
});

test('the unit manager starts the follow-up', async ({ page, dismissCookieConsent }) => {
  const trace = await installInvestigatedErrand(page, { activePhaseName: 'DECISION', roleKeys: ['enhetschef'] });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Inled uppföljning');
  await nextPhaseButton(page).click();
  await expect.poll(() => trace.phasePatches.length).toBe(1);
});

// Ä13. The follow-up follows up what was approved: the unit decides on every proposal before the errand goes there.
test('the follow-up waits for the proposals to be decided, and the button leads to them', async ({
  page,
  dismissCookieConsent,
}) => {
  const refusal =
    'Ärendet kan inte gå vidare till uppföljning förrän alla åtgärdsförslag är bedömda: 2 förslag väntar på att godkännas, delvis godkännas eller avslås.';
  // A deviation under SoL calls for no decision, so nothing but the proposals stands before the follow-up.
  const trace = await installInvestigatedErrand(page, {
    ...solDeviationScenario(),
    activePhaseName: 'DECISION',
    roleKeys: ['enhetschef'],
    measuresFollowUpRefusal: refusal,
  });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Bedöm åtgärdsförslagen');
  // The next step says the same, and leads to where the proposals are decided.
  await expect(page.locator('[data-cy="support-next-step-text"]')).toHaveText(
    'Det finns åtgärdsförslag som inte är bedömda. Bedöm dem under Åtgärder innan ärendet går vidare till uppföljning.'
  );
  await expect(page.locator('[data-cy="support-next-step-tab"]')).toHaveText('Gå till Åtgärder');

  await nextPhaseButton(page).click();
  const dialog = page.locator('[data-cy="undecided-proposals-requirement"]');
  await expect(dialog).toContainText(refusal);
  expect(trace.phasePatches).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Gå till Åtgärder', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Åtgärder', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('the follow-up is offered as before once no proposal waits', async ({ page, dismissCookieConsent }) => {
  const trace = await installInvestigatedErrand(page, {
    activePhaseName: 'DECISION',
    roleKeys: ['enhetschef'],
  });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Inled uppföljning');
  await nextPhaseButton(page).click();
  await expect.poll(() => trace.phasePatches.length).toBe(1);
});

/** The errand is closed once every measure is reported in the follow-up, and the button says what is missing until then. */
test('closing waits for the measures and says what is missing', async ({ page, dismissCookieConsent }) => {
  const refusal = 'Ärendet kan inte avslutas förrän alla åtgärder är hanterade: 1 åtgärd är inte uppföljd.';
  await installInvestigatedErrand(page, {
    activePhaseName: 'FOLLOW_UP',
    roleKeys: ['enhetschef'],
    measuresCloseRefusal: refusal,
  });
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();

  await expect(nextPhaseButton(page)).toHaveText('Avsluta ärendet');
  await expect(page.locator('[data-cy="measures-close-refusal"]')).toHaveText(refusal);
  await expect(nextPhaseButton(page)).toBeDisabled();
});

test('closing is offered once every measure is handled', async ({ page, dismissCookieConsent }) => {
  await installInvestigatedErrand(page, { activePhaseName: 'FOLLOW_UP', roleKeys: ['enhetschef'] });
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toHaveText('Avsluta ärendet');
  await expect(page.locator('[data-cy="measures-close-refusal"]')).toHaveCount(0);
});
