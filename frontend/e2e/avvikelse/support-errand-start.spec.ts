import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { toast } from '../utils/toast';
import { errandNumber, installIafApiMock } from './fixtures/investigation-flow.mock';

const signedInHandler = { name: 'iaf.test', displayName: 'Testare Iaf', guid: 'admin-guid', roleKeys: ['enhetschef'] };

async function visitNewErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await expect(startButton(page)).toBeEnabled();
}

const startButton = (page: Page) => page.getByRole('button', { name: 'Starta handläggning' });

/**
 * Starta handläggning is offered to the handler of a newly registered errand, and moves it out of the phase
 * it was registered in. It saves the sidebar's own fields first only when they hold a draft; an untouched
 * form writes nothing, and a read confirms the errand is the one the handler was shown.
 */
test.describe('Starta handläggning', () => {
  test('skriver inget av ärendets egna fält när formuläret är orört', async ({ page, dismissCookieConsent }) => {
    const trace = await installIafApiMock(page, {
      errandStatus: 'NEW',
      activePhaseName: 'ACTUALIZATION',
      administrators: [signedInHandler],
    });
    await visitNewErrand(page, dismissCookieConsent);

    await startButton(page).click();

    await expect(toast(page, 'Handläggning startad')).toBeVisible();
    expect(trace.errandPatches).toEqual([]);
    expect(trace.adminPatches).toEqual([]);
    expect(trace.phasePatches).toHaveLength(1);
  });

  test('sparar ett utkast i sidopanelen först, och startar sedan ärendet som det sparades', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      errandStatus: 'NEW',
      activePhaseName: 'ACTUALIZATION',
      administrators: [signedInHandler],
    });
    await visitNewErrand(page, dismissCookieConsent);

    await page.locator('[data-cy="priority-input"]').selectOption('HIGH');
    await startButton(page).click();

    await expect(toast(page, 'Handläggning startad')).toBeVisible();
    expect(trace.errandPatches).toEqual([expect.objectContaining({ priority: 'HIGH' })]);
    expect(trace.phasePatches).toHaveLength(1);
  });
});
