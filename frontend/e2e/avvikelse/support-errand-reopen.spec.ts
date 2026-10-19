import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { errandNumber, installIafApiMock } from './fixtures/investigation-flow.mock';

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
}

// A closed errand is never reopened: the sidebar offers no way to.
test('erbjuder inte att återöppna ett avslutat ärende', async ({ page, dismissCookieConsent }) => {
  await installIafApiMock(page, {
    errandStatus: 'SOLVED',
  });

  await visitErrand(page, dismissCookieConsent);

  // The closed summary is where the button would sit, so it shows the sidebar rendered the closed errand.
  const sidebar = page.locator('[data-cy="manage-sidebar"]');
  await expect(sidebar).toContainText('avslutade ärendet.');
  await expect(page.getByRole('button', { name: 'Återöppna ärende' })).toHaveCount(0);
});
