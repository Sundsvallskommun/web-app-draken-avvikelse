import type { Page, Route } from '@playwright/test';

import { mockAdmins } from '../fixtures/mockAdmins';
import { mockMe } from '../fixtures/mockMe';
import { expect, test } from '../fixtures/base.fixture';
import { mockStatusGroupCounts } from '../utils/status-group-counts';
import { errandNumber } from './fixtures/investigation-flow.mock';

/**
 * Ä1 and Ä2. The overview names the report type in a column of its own, with the errand number beneath it, and
 * calls the two categorization columns what they hold: Avvikelsetyp and Underkategori. IAF and VoF are the same
 * product and show the same table.
 */
const reportType = {
  id: 'report-type-misconduct-id',
  classification: 'REPORT_TYPE',
  resourceName: 'ABUSE',
  resourcePath: 'REPORT_TYPE/ABUSE',
  displayName: 'Missförhållande',
};
const labelStructure = [
  {
    id: 'report-type-root-id',
    classification: 'REPORT_TYPE_ROOT',
    resourceName: 'REPORT_TYPE',
    resourcePath: 'REPORT_TYPE',
    displayName: 'Rapporttyp',
    labels: [reportType],
  },
];

const errandPage = {
  content: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      errandNumber,
      title: 'Missförhållande',
      priority: 'MEDIUM',
      status: 'INQUIRY',
      channel: 'ESERVICE',
      classification: { category: 'NONE', type: 'NONE' },
      stakeholders: [],
      externalTags: [],
      labels: [reportType],
      assignedUserId: 'kctest',
      created: '2026-02-22T13:06:02.567+01:00',
      modified: '2026-02-22T13:06:02.567+01:00',
      touched: '2026-02-22T13:06:02.567+01:00',
    },
  ],
  pageable: { pageNumber: 0, pageSize: 12, offset: 0, paged: true, unpaged: false },
  totalPages: 1,
  totalElements: 1,
  size: 12,
  number: 0,
  first: true,
  last: true,
  numberOfElements: 1,
  empty: false,
};

const jsonRoute = (page: Page, pattern: string | RegExp, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

test('visar rapporttyp och ärendenummer i en egen kolumn, lika i IAF och VoF', async ({
  page,
  dismissCookieConsent,
}) => {
  await page.context().addCookies([{ name: 'connect.sid', value: 'test-session', domain: 'localhost', path: '/' }]);
  await jsonRoute(page, '**/administrators', mockAdmins);
  await jsonRoute(page, '**/me', mockMe);
  await jsonRoute(page, '**/users/admins', mockAdmins);
  await jsonRoute(page, '**/supportnotifications/2281', []);
  await mockStatusGroupCounts(page, 1);
  await jsonRoute(page, '**/supportmetadata/2281', {
    categories: [],
    types: [],
    statuses: [
      { name: 'NEW', displayName: 'Ny' },
      { name: 'INQUIRY', displayName: 'Pågående' },
    ],
    labels: { labelStructure },
  });
  await jsonRoute(page, '**/supportmanagement/investigation-profile', {
    state: 'active',
    registration: { mode: 'disabled' },
    documents: [],
  });
  await jsonRoute(page, /\/supporterrands\/2281\?/, errandPage);

  await page.goto('oversikt/');
  await dismissCookieConsent();
  await page.locator('[aria-label="status-button-INQUIRY"]').click();

  const table = page.locator('[data-cy="main-table"]');
  const headers = table.locator('thead th');
  const row = table.locator('.sk-table-tbody-tr');
  await expect(row).toHaveCount(1);

  await expect(headers.nth(2)).toHaveText('Rapporttyp');
  await expect(headers.nth(3)).toHaveText('Avvikelsetyp');
  await expect(headers.nth(4)).toHaveText('Underkategori');
  // The report type and the errand number share the one cell, and each is shown once in the row.
  const reportTypeCell = row.locator('[data-cy="overview-report-type"]');
  await expect(reportTypeCell).toContainText('Missförhållande');
  await expect(reportTypeCell).toContainText(errandNumber);
  await expect(row.getByText(errandNumber, { exact: true })).toHaveCount(1);
  await expect(row.locator('td').nth(4)).not.toContainText('Missförhållande');
  // Ä3. The report came in through Katla, Draken's own e-service, which is named apart from OpenE's.
  await expect(row.locator('td').nth(5)).toContainText('Draken e-tjänst');

  // The row still opens the errand, whichever columns it has.
  await expect(row).toHaveAttribute('aria-label', `Ärende ${errandNumber}, öppna ärende i ny flik`);

  // Ä14. The organisation does not park errands, so the menu offers no list of parked ones.
  await expect(page.locator('[aria-label="status-button-NEW"]')).toBeVisible();
  await expect(page.locator('[aria-label="status-button-SUSPENDED"]')).toHaveCount(0);
});
