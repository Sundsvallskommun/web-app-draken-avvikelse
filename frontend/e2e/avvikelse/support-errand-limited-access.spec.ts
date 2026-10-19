import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { errandNumber, existingManagerDocument, installIafApiMock } from './fixtures/investigation-flow.mock';

/**
 * While LEX has an errand, `ACCESS/LEX` leaves the unit manager and head of operations with limited read
 * (LR): Support Management answers a summary of the errand and nothing they may change. The errand page
 * says so and locks every field rather than offering what would be refused.
 */
async function installErrand(page: Page, errandAccessLevel: 'LR' | 'RW') {
  return installIafApiMock(page, {
    activePhaseName: 'INVESTIGATION',
    assignedUserId: 'iaf.test',
    errandAccessLevel,
    documents: { 'utredning-enhetschef': existingManagerDocument() },
  });
}

const limitedAccessAlert = (page: Page) => page.locator('[data-cy="limited-access-errand"]');
const nextPhaseButton = (page: Page) => page.locator('[data-cy="next-phase-button"]');

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandAccess = page.waitForResponse((response) => response.url().includes('/errand-access'));
  await page.goto(`arende/${errandNumber}`);
  await errandAccess;
  await dismissCookieConsent();
  await expect(page.locator('[data-cy="save-button"]')).toBeVisible();
}

test('säger att behörigheten är begränsad och låser ärendet när Support Management bara ger LR', async ({
  page,
  dismissCookieConsent,
}) => {
  await installErrand(page, 'LR');
  await visitErrand(page, dismissCookieConsent);

  await expect(limitedAccessAlert(page)).toHaveText('Du har begränsad behörighet till detta ärende.');
  // The errand is assigned to this very user, which on its own would let them act on it.
  for (const control of ['admin-input', 'priority-input', 'save-button', 'solved-button']) {
    await expect(page.locator(`[data-cy="${control}"]`)).toBeDisabled();
  }
  // What only the handler is offered - moving the phase, parking the errand - is not offered at all.
  await expect(nextPhaseButton(page)).toHaveCount(0);
  await expect(page.locator('[data-cy="suspend-button"]')).toHaveCount(0);
});

test('visar ärendet som vanligt när användaren får läsa och ändra det', async ({ page, dismissCookieConsent }) => {
  await installErrand(page, 'RW');
  await visitErrand(page, dismissCookieConsent);

  await expect(nextPhaseButton(page)).toBeEnabled();
  await expect(limitedAccessAlert(page)).toHaveCount(0);
  // The status follows the workflow's own actions, so there is none to choose by hand.
  await expect(page.locator('[data-cy="status-input"]')).toHaveCount(0);
  await expect(page.locator('[data-cy="priority-input"]')).toBeEnabled();
});
