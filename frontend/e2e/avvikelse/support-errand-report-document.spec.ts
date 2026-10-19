import type { Page } from '@playwright/test';
import { toast } from '../utils/toast';

import { expect, test } from '../fixtures/base.fixture';
import {
  defaultInvestigationProfile,
  errandNumber,
  type IafApiScenario,
  installIafApiMock,
  reportDocumentProfile,
  withPlaceStructure,
} from './fixtures/investigation-flow.mock';

/**
 * An errand registered in Draken has no report from Katla, so its unit manager writes one in
 * Ärendeuppgifter until the errand reaches Utredning. Katla's report is never written in Draken.
 */
const reportProfile = () => ({ ...defaultInvestigationProfile(), reportDocument: reportDocumentProfile });

const installReportErrand = (page: Page, scenario: IafApiScenario) =>
  installIafApiMock(page, { investigationProfile: reportProfile(), assignedUserId: 'iaf.test', ...scenario });

async function openDetails(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true }).click();
}

test.describe('Rapporten för ett ärende registrerat i Draken', () => {
  test('fylls i av enhetschefen och skapas vid första sparningen, på den registrerade platsen', async ({
    page,
    dismissCookieConsent,
  }) => {
    // Registered at Blå, the deepest place on the errand's labels.
    const trace = await installReportErrand(page, { activePhaseName: 'ACTUALIZATION', ...withPlaceStructure() });

    await openDetails(page, dismissCookieConsent);

    const report = page.locator('[data-cy="avvikelse-report-document"]');
    await expect(report).toBeVisible();
    await report.getByRole('textbox', { name: /Beskriv händelsen/u }).fill('Brukaren föll i korridoren.');
    await report.getByRole('button', { name: 'Spara rapport', exact: true }).click();

    await expect(toast(page, 'Rapporten har sparats.')).toBeVisible();
    await expect(report.locator('[data-cy="avvikelse-report-notice"]')).toHaveCount(0);
    const put = trace.puts.find(({ key }) => key === reportDocumentProfile.key);
    expect(put?.headers['if-none-match']).toBe('*');
    expect(put?.body).toMatchObject({
      schemaId: '2281_avvikelse-plats-handelse_1.5',
      value: { eventDescription: 'Brukaren föll i korridoren.', facilityInfo: { orgName: 'Blå' } },
    });
  });

  test('låses när ärendet har gått vidare till utredning', async ({ page, dismissCookieConsent }) => {
    await installReportErrand(page, { activePhaseName: 'INVESTIGATION' });

    await openDetails(page, dismissCookieConsent);

    await expect(page.getByRole('heading', { name: 'Ärendeuppgifter', exact: true })).toBeVisible();
    await expect(page.locator('[data-cy="avvikelse-report-document"]')).toHaveCount(0);
  });

  test('går aldrig att fylla i på ett ärende som kom in från Katla', async ({ page, dismissCookieConsent }) => {
    await installReportErrand(page, { activePhaseName: 'ACTUALIZATION', errandChannel: 'ESERVICE' });

    await openDetails(page, dismissCookieConsent);

    await expect(page.getByRole('heading', { name: 'Ärendeuppgifter', exact: true })).toBeVisible();
    await expect(page.locator('[data-cy="avvikelse-report-document"]')).toHaveCount(0);
    // Ä3. Katla is Draken's own e-service, and is named so that it is not taken for an OpenE e-service.
    await expect(page.locator('[data-cy="errandRegisteredLabel"]')).toHaveText('Inkom via Draken e-tjänst');
  });
});
