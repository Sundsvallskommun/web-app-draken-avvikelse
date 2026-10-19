import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { errandNumber, installIafApiMock, type WorkflowPhaseName } from './fixtures/investigation-flow.mock';

/**
 * A closed errand is done with, so the tab it was opened in closes - in a workflow too, whether the errand is
 * closed from its last phase with the phase button or earlier with Avsluta ärendet. The browser would refuse a
 * script closing a tab it did not open, so `window.close` is recorded rather than run.
 */
async function installErrandIn(page: Page, phase: WorkflowPhaseName, status: string) {
  await page.addInitScript(() => {
    (window as unknown as { closeCalls: number }).closeCalls = 0;
    window.close = () => {
      (window as unknown as { closeCalls: number }).closeCalls += 1;
    };
  });
  await installIafApiMock(page, {
    activePhaseName: phase,
    errandStatus: status,
    assignedUserId: 'iaf.test',
  });
}

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
}

const closeCalls = (page: Page) => page.evaluate(() => (window as unknown as { closeCalls: number }).closeCalls);

const statusWrite = (page: Page) =>
  page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/status'));

test('closing the errand from its last phase closes the tab', async ({ page, dismissCookieConsent }) => {
  await installErrandIn(page, 'FOLLOW_UP', 'FOLLOW_UP');
  await visitErrand(page, dismissCookieConsent);

  // In the last phase the phase button closes the errand, and Avsluta ärendet is not offered beside it.
  const phaseButton = page.locator('[data-cy="next-phase-button"]');
  await expect(phaseButton).toHaveText('Avsluta ärendet');
  await expect(page.locator('[data-cy="solved-button"]')).toHaveCount(0);
  const written = statusWrite(page);
  await phaseButton.click();

  expect((await written).postDataJSON()).toMatchObject({ status: 'SOLVED' });
  await expect(page.getByText('Ärendet avslutades')).toBeVisible();
  await expect.poll(() => closeCalls(page), { timeout: 5000 }).toBe(1);
});

// Ä5: the manager who closes the errand from the follow-up is reminded to tell the reporter what came of the report.
test('reminds the handler beneath the button that closes the errand to tell the reporter', async ({
  page,
  dismissCookieConsent,
}) => {
  await installIafApiMock(page, {
    activePhaseName: 'FOLLOW_UP',
    errandStatus: 'FOLLOW_UP',
    assignedUserId: 'iaf.test',
  });
  await visitErrand(page, dismissCookieConsent);

  const phaseButton = page.locator('[data-cy="next-phase-button"]');
  await expect(phaseButton).toHaveText('Avsluta ärendet');
  await expect(page.locator('[data-cy="closing-reminder"]')).toHaveText(
    'Återkoppla till rapportören hur det har gått med rapporten.'
  );
  await expect(phaseButton).toHaveAccessibleDescription('Återkoppla till rapportören hur det har gått med rapporten.');
});

test('closing the errand before its last phase closes the tab', async ({ page, dismissCookieConsent }) => {
  await installErrandIn(page, 'INVESTIGATION', 'INQUIRY');
  await visitErrand(page, dismissCookieConsent);

  // A close before the process is complete asks why first.
  await page.locator('[data-cy="solved-button"]').click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('[data-cy="early-close-motivation"]').fill('Dubblettanmälan.');
  const written = statusWrite(page);
  await dialog.locator('[data-cy="early-close-confirm"]').click();

  expect((await written).postDataJSON()).toMatchObject({ status: 'SOLVED' });
  await expect.poll(() => closeCalls(page), { timeout: 5000 }).toBe(1);
});

/**
 * A reported misconduct goes to LEX, is decided and is followed up before it closes. The close offered before the
 * last phase is not there for it - the close from the follow-up is - while a deviation keeps it as before.
 */
for (const [eventType, offered] of [
  ['MISSFORHALLANDE', false],
  ['AVVIKELSE', true],
] as const) {
  test(`${offered ? 'offers' : 'offers no'} early close on a ${eventType.toLowerCase()} in the investigation`, async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, { eventType, activePhaseName: 'INVESTIGATION', assignedUserId: 'iaf.test' });
    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="manage-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-cy="solved-button"]')).toHaveCount(offered ? 1 : 0);
  });
}

// A deviation's handling starts in the review: before it nothing is closed early, from it the close is offered.
for (const [phase, offered] of [
  ['ACTUALIZATION', false],
  ['REVIEW', true],
] as const) {
  test(`${offered ? 'offers' : 'offers no'} early close on a deviation in ${phase.toLowerCase()}`, async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, { eventType: 'AVVIKELSE', activePhaseName: phase, assignedUserId: 'iaf.test' });
    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="manage-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-cy="solved-button"]')).toHaveCount(offered ? 1 : 0);
  });
}

// As in MEX, a close before the process is complete asks why, and the reason goes with the close as a service note.
test('asks why a deviation is closed early and sends the reason with the close', async ({
  page,
  dismissCookieConsent,
}) => {
  await installIafApiMock(page, {
    eventType: 'AVVIKELSE',
    activePhaseName: 'INVESTIGATION',
    assignedUserId: 'iaf.test',
  });
  await visitErrand(page, dismissCookieConsent);

  await page.locator('[data-cy="solved-button"]').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Avsluta ärendet?');
  await expect(dialog).toContainText('Texten sparas som en tjänsteanteckning på ärendet.');
  await dialog.locator('[data-cy="early-close-confirm"]').click();
  await expect(dialog).toContainText('Orsak till avslut måste anges.');

  await dialog.locator('[data-cy="early-close-motivation"]').fill('Dubblettanmälan.');
  const written = statusWrite(page);
  await dialog.locator('[data-cy="early-close-confirm"]').click();

  expect((await written).postDataJSON()).toMatchObject({ status: 'SOLVED', closingMotivation: 'Dubblettanmälan.' });
});
