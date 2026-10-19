import assert from 'node:assert/strict';

import type { CaseStatusResponse } from '@common/services/casestatus-service';
import { test } from 'vitest';

import { brukarePartyId, otherReports } from './related-reports';

test('the brukare is looked up by their party id when they are a person', () => {
  assert.equal(brukarePartyId({ externalId: 'brukare-party', stakeholderType: 'PERSON' }), 'brukare-party');
  assert.equal(brukarePartyId({ externalId: 'company', stakeholderType: 'ORGANIZATION' }), undefined);
  assert.equal(brukarePartyId({ stakeholderType: 'PERSON' }), undefined);
  assert.equal(brukarePartyId(undefined), undefined);
});

test('the related reports are the brukare reports besides the one being read', () => {
  const statuses: CaseStatusResponse[] = [
    { caseId: 'this-report', errandNumber: 'VOF-2026-0001' },
    { caseId: 'earlier-report', errandNumber: 'VOF-2026-0002' },
  ];

  assert.deepEqual(
    otherReports(statuses, 'this-report').map(({ errandNumber }) => errandNumber),
    ['VOF-2026-0002']
  );
});
