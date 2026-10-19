import type { Page, Route } from '@playwright/test';

import { mockAdmins } from '../fixtures/mockAdmins';
import { mockMe } from '../fixtures/mockMe';
import { expect, test } from '../fixtures/base.fixture';
import { mockStatusGroupCounts } from '../utils/status-group-counts';
import { errandNumberPrefix } from './fixtures/investigation-flow.mock';

/**
 * While an errand carries `ACCESS/LEX` the LEX roles hold it, whichever of them it is assigned to - and the
 * unit sees that much of it even where its read is limited. The overview says LEX is responsible.
 */
const LIST_URL = /\/supporterrands\?/;

const accessLex = { id: 'access-lex-id', classification: 'access', resourceName: 'LEX', resourcePath: 'ACCESS/LEX' };
const labelStructure = [
  {
    id: 'access-root-id',
    classification: 'access-root',
    resourceName: 'ACCESS',
    resourcePath: 'ACCESS',
    displayName: 'Åtkomst',
    labels: [{ ...accessLex, displayName: 'LEX' }],
  },
];

const errand = (index: number, labels: unknown[]) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  errandNumber: `${errandNumberPrefix}-2026-000${index}`,
  title: 'Avvikelse',
  priority: 'MEDIUM',
  status: 'INQUIRY',
  channel: 'ESERVICE',
  classification: { category: 'NONE', type: 'NONE' },
  stakeholders: [],
  externalTags: [],
  labels,
  assignedUserId: 'kctest',
  created: '2026-02-22T13:06:02.567+01:00',
  modified: '2026-02-22T13:06:02.567+01:00',
  touched: '2026-02-22T13:06:02.567+01:00',
});

const errandPage = {
  content: [errand(1, [accessLex]), errand(2, [])],
  pageable: { pageNumber: 0, pageSize: 12, offset: 0, paged: true, unpaged: false },
  totalPages: 1,
  totalElements: 2,
  size: 12,
  number: 0,
  first: true,
  last: true,
  numberOfElements: 2,
  empty: false,
};

const jsonRoute = (page: Page, pattern: string | RegExp, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

test('namnger LEX som ansvarig för ärenden som bär ACCESS/LEX', async ({ page, dismissCookieConsent }) => {
  await page.context().addCookies([{ name: 'connect.sid', value: 'test-session', domain: 'localhost', path: '/' }]);
  await jsonRoute(page, '**/administrators', mockAdmins);
  await jsonRoute(page, '**/me', mockMe);
  // The overview names a handler from the assignable handlers.
  await jsonRoute(page, '**/users/admins', mockAdmins);
  await jsonRoute(page, '**/supportnotifications', []);
  await mockStatusGroupCounts(page, 2);
  await jsonRoute(page, '**/supportmetadata', {
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
  await jsonRoute(page, LIST_URL, errandPage);

  await page.goto('oversikt/');
  await dismissCookieConsent();
  await page.locator('[aria-label="status-button-INQUIRY"]').click();

  const rows = page.locator('[data-cy="main-table"] .sk-table-tbody-tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: `${errandNumberPrefix}-2026-0001` })).toContainText('LEX');
  await expect(rows.filter({ hasText: `${errandNumberPrefix}-2026-0001` })).not.toContainText('kctest');
  await expect(rows.filter({ hasText: `${errandNumberPrefix}-2026-0002` })).toContainText('(kctest)');
  await expect(rows.filter({ hasText: `${errandNumberPrefix}-2026-0002` })).not.toContainText('LEX');
});
