import assert from 'node:assert/strict';

import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { test } from 'vitest';

import type { InvestigationProfile } from '../investigation-profile';
import { hasLexDeclinedInvestigation, prefillInvestigationDocument } from './lex-initial-assessment';

const profile = {
  documents: [{ key: 'assessment', schemaName: 'bedomning-sol-lss' }],
} as unknown as InvestigationProfile;

const errandWithAssessment = (assessment: Record<string, unknown> | undefined) =>
  ({ jsonParameters: assessment ? [{ key: 'assessment', value: assessment }] : [] } as unknown as SupportErrand);

test('a saved assessment that does not lex-investigate declines the errand, and nothing else does', () => {
  assert.equal(
    hasLexDeclinedInvestigation(errandWithAssessment({ lexInvestigationDecision: 'not_investigate' }), profile),
    true
  );
  assert.equal(
    hasLexDeclinedInvestigation(errandWithAssessment({ lexInvestigationDecision: 'investigate' }), profile),
    false
  );
  assert.equal(hasLexDeclinedInvestigation(errandWithAssessment(undefined), profile), false);
  // A profile without the assessment has nothing that could decline.
  assert.equal(
    hasLexDeclinedInvestigation(errandWithAssessment({ lexInvestigationDecision: 'not_investigate' }), {
      documents: [],
    } as unknown as InvestigationProfile),
    false
  );
});

test("the lex Sarah decision starts from the assessment's IVO answer", () => {
  const errand = errandWithAssessment({
    ivoNotification: 'yes',
    ivoCaseNumber: 'IVO 3.5.1-12345/2026',
    public360CaseNumber: '',
    lexInvestigationDecision: 'investigate',
  });

  assert.deepEqual(prefillInvestigationDocument('beslut-sol-lss', errand, profile), {
    ivoNotification: 'yes',
    ivoCaseNumber: 'IVO 3.5.1-12345/2026',
  });
});

test('every other document, and a decision with no saved assessment, starts empty', () => {
  const errand = errandWithAssessment({ ivoNotification: 'no' });

  assert.deepEqual(prefillInvestigationDocument('utredning-sol-lss', errand, profile), {});
  assert.deepEqual(prefillInvestigationDocument('beslut-hsl', errand, profile), {});
  assert.deepEqual(prefillInvestigationDocument('beslut-sol-lss', errandWithAssessment(undefined), profile), {});
});
