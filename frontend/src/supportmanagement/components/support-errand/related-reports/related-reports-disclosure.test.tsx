// @vitest-environment jsdom
import type { CaseStatusResponse } from '@common/services/casestatus-service';
import { appConfig } from '@config/appconfig';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { RelatedReportsDisclosure } from './related-reports-disclosure.component';

const mocks = vi.hoisted(() => ({
  statusesByParty: vi.fn<(municipalityId: string, partyId: string) => Promise<CaseStatusResponse[]>>(),
  searchErrands: vi.fn(),
  createRelation: vi.fn(),
  deleteRelation: vi.fn(),
  resolvedRelations: vi.fn(),
}));
vi.mock('@common/services/casestatus-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@common/services/casestatus-service')>()),
  getStatusesUsingPartyId: mocks.statusesByParty,
  getErrandStatus: mocks.searchErrands,
}));
// The brukare is the errand's PRIMARY stakeholder, as the stakeholder service finds it.
vi.mock('@supportmanagement/services/support-stakeholder-service', () => ({
  getSupportOwnerStakeholder: (errand: SupportErrand) => errand.customer?.find((s) => s.role === 'PRIMARY'),
}));
vi.mock('@common/services/relations-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@common/services/relations-service')>()),
  createRelation: mocks.createRelation,
  deleteRelation: mocks.deleteRelation,
  getResolvedRelations: mocks.resolvedRelations,
}));

const errand = {
  id: 'this-report',
  customer: [{ role: 'PRIMARY', externalId: 'brukare-party', stakeholderType: 'PERSON' }],
} as unknown as SupportErrand;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.statusesByParty.mockResolvedValue([
    { caseId: 'this-report', errandNumber: 'VOF-2026-0001', namespace: 'HEALTHCAREDEVIATIONVOF' },
    { caseId: 'earlier-report', errandNumber: 'VOF-2026-0002', namespace: 'HEALTHCAREDEVIATIONVOF' },
  ]);
});
afterEach(() => {
  cleanup();
  appConfig.useRelatedReportsMock = false;
});

// The module's toggle is its only button: a read-only list offers nothing else to press.
const openModule = () => fireEvent.click(screen.getByRole('button'));

test("lists the brukare's other reports under one heading, and nothing else", async () => {
  render(<RelatedReportsDisclosure errand={errand} disabled={false} />);
  openModule();

  expect(await screen.findByText('VOF-2026-0002')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 2, name: 'Relaterade rapporter till brukaren' })).toBeTruthy();
  // The report being read is not related to itself.
  expect(screen.queryByText('VOF-2026-0001')).toBeNull();
  expect(mocks.statusesByParty).toHaveBeenCalledWith(expect.anything(), 'brukare-party');

  // Read-only: no search, no linking, and none of the sections Kopplade ärenden has.
  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(screen.queryByText('Sök ärende')).toBeNull();
  expect(screen.queryByRole('button', { name: /Koppla|Bryt koppling/u })).toBeNull();
  expect(screen.queryByText('Kopplingar till annan ärendeägare')).toBeNull();
  expect(screen.queryByText('Kopplingar skapade till detta ärende')).toBeNull();
  expect(within(screen.getByRole('table')).queryByText('Verksamhet')).toBeNull();
  expect(mocks.searchErrands).not.toHaveBeenCalled();
  expect(mocks.createRelation).not.toHaveBeenCalled();
  expect(mocks.deleteRelation).not.toHaveBeenCalled();
  expect(mocks.resolvedRelations).not.toHaveBeenCalled();
});

// A real report says nothing of its subcategory: the column stays empty for it.
test('lists each report under Status, Ärendetyp, Underkategori and Ärendenummer', async () => {
  render(<RelatedReportsDisclosure errand={errand} disabled={false} />);
  openModule();

  await screen.findByText('VOF-2026-0002');
  expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
    'Status',
    'Ärendetyp',
    'Underkategori',
    'Ärendenummer',
  ]);
});

// Where the test environment's CaseStatus cannot see the drake's reports, the list shows examples instead.
test('shows the example reports, and reads nothing, where the deployment mocks them', async () => {
  appConfig.useRelatedReportsMock = true;
  render(<RelatedReportsDisclosure errand={errand} disabled={false} />);
  openModule();

  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  expect(rows.map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent))).toEqual([
    ['Handläggning pågår', 'Fall', 'Fall vid patientens egna aktiviteter', 'VOF-26100006'],
    ['Avslutat', 'Fall utan skada', '', 'VOF-26100023'],
    ['Inskickat', 'Fall', 'Fall med personal - Hjälpmedel', 'VOF-26100038'],
  ]);
  expect(mocks.statusesByParty).not.toHaveBeenCalled();
});

// The examples are real errand numbers in test: the one being read is not listed as related to itself.
test('leaves the errand being read out of the example reports', () => {
  appConfig.useRelatedReportsMock = true;
  render(
    <RelatedReportsDisclosure errand={{ ...errand, errandNumber: 'VOF-26100023' } as SupportErrand} disabled={false} />
  );
  openModule();

  const table = screen.getByRole('table');
  expect(within(table).queryByText('VOF-26100023')).toBeNull();
  expect(within(table).getByText('VOF-26100006')).toBeTruthy();
  expect(within(table).getByText('VOF-26100038')).toBeTruthy();
});

test('looks nothing up for an errand that names no brukare', async () => {
  render(
    <RelatedReportsDisclosure
      errand={{ id: 'this-report', customer: [] } as unknown as SupportErrand}
      disabled={false}
    />
  );
  openModule();

  expect(await screen.findByText('Det finns inga ärenden')).toBeTruthy();
  expect(mocks.statusesByParty).not.toHaveBeenCalled();
});
