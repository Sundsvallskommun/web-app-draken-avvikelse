import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { toast } from '../utils/toast';
import { errandNumber, installIafApiMock } from './fixtures/investigation-flow.mock';

/**
 * Nobody takes an errand in IAF/VOF: the handler is chosen in Ansvarig and saved. A LEX manager takes over an errand
 * another LEX manager holds the same way - also one still Tilldelad, waiting for the other to resume it.
 */
const lexManagers = [
  { name: 'iaf.test', displayName: 'Testare Iaf', guid: 'guid-self', roleKeys: ['lex-ansvarig'] },
  { name: 'lex.other', displayName: 'Annika Annan', guid: 'guid-other', roleKeys: ['lex-ansvarig'] },
];

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
}

const saveButton = (page: Page) =>
  page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').filter({ hasText: 'Spara ärende' });

for (const errandStatus of ['ASSIGNED', 'ONGOING']) {
  test(`a LEX manager takes over a ${errandStatus.toLowerCase()} errand another LEX manager holds`, async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      eventType: 'MISSFORHALLANDE',
      roleKeys: ['lex-ansvarig'],
      administrators: lexManagers,
      assignedUserId: 'lex.other',
      errandStatus,
    });
    await visitErrand(page, dismissCookieConsent);

    await page.locator('[data-cy="admin-input"]').selectOption({ label: 'Testare Iaf' });
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).click();

    await expect.poll(() => trace.adminPatches).toEqual(['iaf.test']);
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    if (errandStatus === 'ASSIGNED') {
      // A waiting errand accepts nothing but its new handler, who then works on it without resuming it first.
      expect(trace.errandPatches).toEqual([]);
      await expect(page.locator('[data-cy="resume-button"]')).toHaveCount(0);
    }
  });
}
