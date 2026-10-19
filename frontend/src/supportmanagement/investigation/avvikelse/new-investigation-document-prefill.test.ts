import assert from 'node:assert/strict';

import type { RJSFSchema } from '@rjsf/utils';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { beforeEach, test, vi } from 'vitest';

import type { InvestigationProfile } from '../investigation-profile';
import { prefillNewInvestigationDocument } from './new-investigation-document-prefill';

const mocks = vi.hoisted(() => ({ resumedAt: vi.fn() }));
vi.mock('@supportmanagement/services/support-history-service', () => ({
  getSupportErrandAssigneeResumedAt: mocks.resumedAt,
}));

const profile = { documents: [], reportDocument: { key: 'report' } } as unknown as InvestigationProfile;
const errand = {
  id: 'one',
  assignedUserId: 'lisa.utredare',
  jsonParameters: [{ key: 'report', value: { eventDescription: 'Kvällsbesöket uteblev.' } }],
} as unknown as SupportErrand;
const source = (schema: RJSFSchema, schemaName = 'utredning-sol-lss') => ({
  municipalityId: '2281',
  schemaName,
  schema,
  errand,
  profile,
  administrators: [{ adAccount: 'lisa.utredare', displayName: 'Lisa Utredare' }],
});
const background = {
  properties: { investigator: {}, reportedEventDescription: {}, reportReceivedDate: {} },
} as RJSFSchema;

beforeEach(() => {
  mocks.resumedAt.mockReset().mockResolvedValue('2026-10-08T09:00:00+02:00');
});

test('starts a new lex Sarah investigation from the errand background', async () => {
  assert.deepEqual(await prefillNewInvestigationDocument(source(background)), {
    investigator: 'Lisa Utredare',
    reportedEventDescription: '<p>Kvällsbesöket uteblev.</p>',
    reportReceivedDate: '2026-10-08',
  });
  assert.deepEqual(mocks.resumedAt.mock.calls, [['one', '2281']]);
});

test('fills in only what the schema version declares', async () => {
  assert.deepEqual(await prefillNewInvestigationDocument(source({ properties: { investigator: {} } } as RJSFSchema)), {
    investigator: 'Lisa Utredare',
  });
});

test('leaves the day out when the history cannot be read, rather than the investigation not opening', async () => {
  mocks.resumedAt.mockRejectedValueOnce(new Error('down'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  const prefilled = await prefillNewInvestigationDocument(source(background));
  assert.equal(prefilled.reportReceivedDate, undefined);
  assert.equal(prefilled.investigator, 'Lisa Utredare');
});

test('reads no history for any other document', async () => {
  assert.deepEqual(await prefillNewInvestigationDocument(source(background, 'utredning-hsl')), {});
  assert.equal(mocks.resumedAt.mock.calls.length, 0);
});
