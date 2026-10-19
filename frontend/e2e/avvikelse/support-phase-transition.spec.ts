import type { Measure } from '../../src/common/data-contracts/supportmanagement/data-contracts';
import type { MeasuresSnapshot } from '../../src/supportmanagement/measures/support-measure-service';
import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import {
  errandNumber,
  existingManagerDocument,
  installIafApiMock,
  workflowPhaseId,
  workflowTransitionId,
  type WorkflowPhaseName,
} from './fixtures/investigation-flow.mock';

const existingMeasure: Measure = {
  id: 'existing',
  type: 'TRAINING',
  version: 1,
  goal: 'Säkrare arbetssätt',
  description: 'Gemensam utbildning',
  addedByRole: 'MANAGER',
  addedByUser: 'iaf.test',
  created: '2026-09-09T13:39:54+02:00',
};

/**
 * The errand sits in `activePhase` and the measures endpoint answers with `measures`, or refuses
 * when `denyRead` is set. The unit manager's investigation is finished, so nothing but the measures
 * stands between the errand and the decision.
 *
 * Each read is logged with the number of phase changes requested when it was made, which tells the
 * phase button's own lookup - made before the change - from the read of the tab the errand lands on
 * after it.
 */
async function installPhases(
  page: Page,
  {
    activePhase = 'INVESTIGATION',
    measures = [],
    denyRead = false,
  }: { activePhase?: WorkflowPhaseName; measures?: Measure[]; denyRead?: boolean } = {}
) {
  const finishedInvestigation = existingManagerDocument();
  finishedInvestigation.value = { ...finishedInvestigation.value, completed: 'yes' };
  const trace = await installIafApiMock(page, {
    activePhaseName: activePhase,
    documents: { 'utredning-enhetschef': finishedInvestigation },
  });
  const phaseChangesAtRead: number[] = [];
  let counted = 0;
  const snapshot: MeasuresSnapshot = {
    measures,
    errandVersion: 7,
    metadata: { measureTypes: [], roles: [] },
    creationRoles: [],
    registration: { status: 'unconfigured', roleTypes: [] },
    canWrite: true,
    mayFollowUp: false,
  };
  await page.route(/\/supporterrands\/[^/]+\/[^/]+\/measures$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    phaseChangesAtRead.push(trace.phasePatches.length);
    await route.fulfill(denyRead ? { status: 403, json: { message: 'Denied' } } : { json: snapshot });
  });
  const countedReads = () => phaseChangesAtRead.slice(counted);
  return {
    trace,
    reads: () => countedReads().length,
    readsBeforePhaseChange: () => countedReads().filter((phaseChanges) => phaseChanges === 0).length,
    readsAfterPhaseChange: () => countedReads().filter((phaseChanges) => phaseChanges > 0).length,
    markReads: () => {
      counted = phaseChangesAtRead.length;
    },
  };
}

// The phase button lives in the sidebar and is labelled by the workflow's own transition name, so it
// is found by its test id rather than by a label the metadata decides.
const nextPhaseButton = (page: Page) => page.locator('[data-cy="next-phase-button"]');
const confirmation = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Gå till beslutsfasen?' });
/** The strip names three phases around the active one, so the names on show say where the errand is. */
const phaseStrip = (page: Page) => page.locator('[data-cy="phase-strip"]');

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await expect(nextPhaseButton(page)).toBeEnabled();
}

/**
 * An errand being investigated opens on Utredning, the tab of its phase, where the finished unit manager's
 * investigation reads the measures once to say whether the errand has any - the read is what proves the
 * errand landed there. Counting restarts once it has, so the tests count the reads the phase button makes.
 */
async function landOnInvestigation(state: { reads: () => number; markReads: () => void }) {
  await expect.poll(() => state.reads()).toBe(1);
  state.markReads();
}

test('asks before entering the decision phase without measures, and Nej leaves the phase alone', async ({
  page,
  dismissCookieConsent,
}) => {
  const state = await installPhases(page);
  await visitErrand(page, dismissCookieConsent);
  await landOnInvestigation(state);
  await expect(phaseStrip(page)).toContainText('Utredning');
  await expect(phaseStrip(page)).not.toContainText('Uppföljning');

  await nextPhaseButton(page).click();
  await expect(confirmation(page)).toBeVisible();
  await expect(confirmation(page)).toContainText(
    'Vill du verkligen gå till beslutsfasen utan att ha skapat några åtgärder?'
  );
  await confirmation(page).getByRole('button', { name: 'Nej', exact: true }).click();

  await expect(confirmation(page)).toHaveCount(0);
  expect(state.trace.phasePatches).toEqual([]);
  expect(state.reads()).toBe(1);
  await expect(phaseStrip(page)).not.toContainText('Uppföljning');
  await expect(nextPhaseButton(page)).toBeEnabled();
});

test('Ja moves the errand into the decision phase through the named transition', async ({
  page,
  dismissCookieConsent,
}) => {
  const state = await installPhases(page);
  await visitErrand(page, dismissCookieConsent);
  await landOnInvestigation(state);

  await nextPhaseButton(page).click();
  await confirmation(page).getByRole('button', { name: 'Ja, byt fas', exact: true }).click();

  await expect(confirmation(page)).toHaveCount(0);
  await expect(phaseStrip(page)).toContainText('Uppföljning');
  expect(state.trace.phasePatches).toEqual([
    { transitionId: workflowTransitionId('DECISION'), expectedActivePhaseId: workflowPhaseId('INVESTIGATION') },
  ]);
});

test('moves straight into the decision phase when a measure is registered', async ({ page, dismissCookieConsent }) => {
  const state = await installPhases(page, { measures: [existingMeasure] });
  await visitErrand(page, dismissCookieConsent);
  await landOnInvestigation(state);

  await nextPhaseButton(page).click();

  await expect(phaseStrip(page)).toContainText('Uppföljning');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.readsBeforePhaseChange()).toBe(1);
  expect(state.trace.phasePatches).toEqual([
    { transitionId: workflowTransitionId('DECISION'), expectedActivePhaseId: workflowPhaseId('INVESTIGATION') },
  ]);
});

// Granskning has no tab of its own, so the errand opens where it always did. The move itself reads no
// measures; the Utredning tab the errand lands on in the investigation phase does, afterwards.
test('does not read measures for a transition into any other phase', async ({ page, dismissCookieConsent }) => {
  const state = await installPhases(page, { activePhase: 'REVIEW' });
  await visitErrand(page, dismissCookieConsent);

  await nextPhaseButton(page).click();

  await expect(phaseStrip(page)).toContainText('Beslut');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.readsBeforePhaseChange()).toBe(0);
  expect(state.trace.phasePatches).toEqual([
    { transitionId: workflowTransitionId('INVESTIGATION'), expectedActivePhaseId: workflowPhaseId('REVIEW') },
  ]);
  await expect.poll(() => state.readsAfterPhaseChange()).toBe(1);
});

test('keeps the phase and says so when the measures cannot be read', async ({ page, dismissCookieConsent }) => {
  const state = await installPhases(page, { denyRead: true });
  await visitErrand(page, dismissCookieConsent);
  await landOnInvestigation(state);

  await nextPhaseButton(page).click();

  await expect(page.getByText('Ärendets åtgärder kunde inte kontrolleras. Fasen ändrades inte.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.trace.phasePatches).toEqual([]);
  await expect(phaseStrip(page)).not.toContainText('Uppföljning');
  await expect(nextPhaseButton(page)).toBeEnabled();
});
