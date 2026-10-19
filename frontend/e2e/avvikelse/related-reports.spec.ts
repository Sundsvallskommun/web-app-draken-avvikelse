import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { errandId, errandNumber, installIafApiMock } from './fixtures/investigation-flow.mock';

/** The relations module in avvikelse is Relaterade rapporter: the other reports on the errand's brukare. */

async function openBasics(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await page.getByRole('tab', { name: 'Grundinformation', exact: true }).click();
}

const relationsModule = (page: Page) => page.locator('[data-cy="connected-errands-disclosure"]');

const brukare = { partyId: 'brukare-party-id', firstName: 'Britt', lastName: 'Brukare' };

/** The brukare's errands as the BFF answers them: this report among them, the BFF having kept the drake's own. */
const brukareStatuses = (currentErrandNumber: string) => [
  { caseId: 'other-report-id', errandNumber: 'VOF-2026-0042', namespace: 'HEALTHCAREDEVIATIONVOF', status: 'Pågående' },
  {
    caseId: errandId,
    errandNumber: currentErrandNumber,
    namespace: 'HEALTHCAREDEVIATIONVOF',
    status: 'Pågående',
  },
];

test('names the relations module Relaterade rapporter', async ({ page, dismissCookieConsent }) => {
  await installIafApiMock(page);
  await openBasics(page, dismissCookieConsent);

  await expect(relationsModule(page)).toContainText('Relaterade rapporter');
  await expect(relationsModule(page)).not.toContainText('Kopplade ärenden');
});

// D2: the module only shows that there are other reports on the same brukare. Nothing is searched, linked or unlinked.
test("lists the brukare's other reports, read-only, under one heading", async ({ page, dismissCookieConsent }) => {
  await installIafApiMock(page, { brukare });
  const requests: string[] = [];
  page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`));
  await page.route(`**/party/${brukare.partyId}/statuses`, (route) =>
    route.fulfill({ json: { data: brukareStatuses(errandNumber), message: 'success' } })
  );
  await openBasics(page, dismissCookieConsent);

  await relationsModule(page).getByRole('button').first().click();
  await expect(
    relationsModule(page).getByRole('heading', { level: 2, name: 'Relaterade rapporter till brukaren' })
  ).toBeVisible();
  const table = relationsModule(page).locator('[data-cy="related-reports-table"]');
  await expect(table).toContainText('VOF-2026-0042');
  // The report being read is not one of its own related reports.
  await expect(table).not.toContainText(errandNumber);

  await expect(relationsModule(page).getByRole('searchbox')).toHaveCount(0);
  await expect(relationsModule(page).getByRole('button', { name: /Koppla|Bryt koppling/u })).toHaveCount(0);
  await expect(relationsModule(page)).not.toContainText('Kopplingar skapade till detta ärende');
  expect(
    requests.filter((request) =>
      /\/errands\/statuses\/|\/resolvedrelations\/|^(POST|DELETE) .*\/relations/u.test(request)
    )
  ).toEqual([]);
});
