import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { errandNumber, installIafApiMock } from './fixtures/investigation-flow.mock';

const nextStep = (page: Page) => page.locator('[data-cy="support-next-step"]');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await expect(tab(page, 'Grundinformation')).toBeVisible();
}

/**
 * The handler is told what to do next, above the handling controls, and the errand opens where that is done. The
 * page's own header is left as it is.
 */
test.describe('Nästa steg i Handläggning', () => {
  test('ett registrerat ärende öppnar på rapporten och säger vad som görs först', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, { documents: {}, activePhaseName: 'ACTUALIZATION', errandStatus: 'NEW' });
    await visitErrand(page, dismissCookieConsent);

    await expect(nextStep(page)).toContainText('Läs rapporten under Ärendeuppgifter');
    await expect(tab(page, 'Ärendeuppgifter')).toHaveAttribute('aria-selected', 'true');
  });

  test('ett ärende i utredning öppnar på Utredning, och kortet leder dit från en annan flik', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, { documents: {}, activePhaseName: 'INVESTIGATION', errandStatus: 'INQUIRY' });
    await visitErrand(page, dismissCookieConsent);

    await expect(nextStep(page)).toContainText('Skriv Utredning enhetschef och markera den som klar.');
    await expect(tab(page, 'Utredning')).toHaveAttribute('aria-selected', 'true');

    await tab(page, 'Grundinformation').click();
    await expect(tab(page, 'Grundinformation')).toHaveAttribute('aria-selected', 'true');
    await nextStep(page).getByRole('button', { name: 'Gå till Utredning' }).click();
    await expect(tab(page, 'Utredning')).toHaveAttribute('aria-selected', 'true');
  });

  test('den som läser en annan handläggares ärende får inget nästa steg', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, {
      documents: {},
      activePhaseName: 'INVESTIGATION',
      errandStatus: 'INQUIRY',
      assignedUserId: 'annan.handlaggare',
    });
    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="admin-input"]')).toBeVisible();
    await expect(nextStep(page)).toHaveCount(0);
  });
});
