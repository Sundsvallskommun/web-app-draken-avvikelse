import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  AVVIKELSE_CLASSIFICATION_POLICY,
  isAvvikelseReportedMisconductErrand,
  resolveAvvikelseClassificationOwnerDocumentKey,
  resolveAvvikelseDocumentApplicability,
  resolveSupportErrandClassificationPlacement,
} from './avvikelse-classification-policy';

const documents = () => [
  { key: 'manager-document', schemaName: 'utredning-enhetschef' },
  { key: 'misconduct-document', schemaName: 'utredning-sol-lss' },
];

const profile = (overrides = {}) => ({
  state: 'active' as const,
  documents: documents(),
  ...overrides,
});

test('moves classification to the investigation document for an active profile with both schema roles', () => {
  const placement = resolveSupportErrandClassificationPlacement({ profile: profile() });
  assert.equal(placement.owner, 'investigation');
  assert.equal(placement.labelTree, AVVIKELSE_CLASSIFICATION_POLICY.labelTree);
  assert.equal(placement.policy.defaultOwnerDocumentKey, 'manager-document');
  assert.equal(placement.policy.reportedMisconductOwnerDocumentKey, 'misconduct-document');
});

test('uses profile state as the classification ownership authority', () => {
  assert.equal(resolveSupportErrandClassificationPlacement({ profile: undefined }).owner, 'unavailable');
  assert.equal(
    resolveSupportErrandClassificationPlacement({ profile: profile({ state: 'unavailable' }) }).owner,
    'unavailable'
  );
  assert.equal(
    resolveSupportErrandClassificationPlacement({ profile: profile({ state: 'inactive' }) }).owner,
    'basics'
  );
});

test('falls back to basics when either fixed owner schema is missing or ambiguous', () => {
  const missing = profile({ documents: documents().slice(0, 1) });
  const ambiguous = profile({
    documents: [...documents(), { key: 'manager-copy', schemaName: 'utredning-enhetschef' }],
  });
  assert.equal(resolveSupportErrandClassificationPlacement({ profile: missing }).owner, 'basics');
  assert.equal(resolveSupportErrandClassificationPlacement({ profile: ambiguous }).owner, 'basics');
});

test('selects the configured profile keys for ordinary deviations and reported misconduct', () => {
  const placement = resolveSupportErrandClassificationPlacement({ profile: profile() });
  assert.equal(placement.owner, 'investigation');
  if (placement.owner !== 'investigation') throw new Error('Expected investigation placement');

  assert.equal(
    resolveAvvikelseClassificationOwnerDocumentKey(placement, {
      parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }],
    }),
    'manager-document'
  );
  assert.equal(
    resolveAvvikelseClassificationOwnerDocumentKey(placement, {
      parameters: [{ key: 'eventType', values: [' missforhallande '] }],
    }),
    'misconduct-document'
  );
});

test('treats resourcePath as authoritative and resourceName only as a pathless fallback', () => {
  assert.equal(
    isAvvikelseReportedMisconductErrand({ labels: [{ resourcePath: 'OTHER/ABUSE', resourceName: 'ABUSE' }] }),
    false
  );
  assert.equal(isAvvikelseReportedMisconductErrand({ labels: [{ resourceName: ' abuse ' }] }), true);
  assert.equal(isAvvikelseReportedMisconductErrand({ labels: [{ resourcePath: '/report_type/abuse/' }] }), true);
});

test('does not accept selector suffixes or another label path', () => {
  for (const errand of [
    { parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE_SUFFIX'] }] },
    { labels: [{ resourcePath: 'OTHER/REPORT_TYPE/ABUSE', resourceName: 'ABUSE' }] },
    { labels: [{ resourceName: 'OTHER_ABUSE' }] },
  ]) {
    assert.equal(isAvvikelseReportedMisconductErrand(errand), false);
  }
});

// One decision per errand: reported misconduct takes the lex Sarah decision whatever its legal
// bases, an ordinary deviation takes the HSL decision only when HSL is one of them.
test('resolves at most one decision applicability per errand, misconduct first', () => {
  const hslLabel = { classification: 'PROVISION', resourcePath: 'PROVISION/HSL', resourceName: 'HSL' };
  const solLabel = { classification: 'PROVISION', resourcePath: 'PROVISION/SOL', resourceName: 'SOL' };
  const deviation = { parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }] };
  const misconduct = { parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }] };

  assert.equal(resolveAvvikelseDocumentApplicability(undefined), undefined);
  assert.equal(resolveAvvikelseDocumentApplicability({ ...deviation, labels: [solLabel] }), undefined);
  assert.equal(resolveAvvikelseDocumentApplicability({ ...deviation, labels: [hslLabel] }), 'hsl-deviation');
  assert.equal(resolveAvvikelseDocumentApplicability({ ...deviation, labels: [solLabel, hslLabel] }), 'hsl-deviation');
  assert.equal(resolveAvvikelseDocumentApplicability({ ...misconduct, labels: [solLabel] }), 'reported-misconduct');
  assert.equal(
    resolveAvvikelseDocumentApplicability({ ...misconduct, labels: [hslLabel, solLabel] }),
    'reported-misconduct'
  );
});

test('recognises the HSL legal base by path, and by name only for a pathless legal base label', () => {
  assert.equal(
    resolveAvvikelseDocumentApplicability({ labels: [{ resourcePath: '/provision/hsl/' }] }),
    'hsl-deviation'
  );
  assert.equal(
    resolveAvvikelseDocumentApplicability({ labels: [{ classification: 'provision', resourceName: ' hsl ' }] }),
    'hsl-deviation'
  );
  for (const errand of [
    // The category branch for HSL is also named HSL; it is not a legal base.
    { labels: [{ classification: 'CATEGORY', resourcePath: 'CATEGORY/HSL', resourceName: 'HSL' }] },
    { labels: [{ classification: 'CATEGORY', resourceName: 'HSL' }] },
    { labels: [{ resourceName: 'HSL' }] },
    { labels: [{ resourcePath: 'OTHER/PROVISION/HSL' }] },
  ]) {
    assert.equal(resolveAvvikelseDocumentApplicability(errand), undefined);
  }
});

// The report rarely names a legal base: the unit manager's investigation does, and marks the errand when it assesses
// a high HSL risk. That mark is what brings MAS/MAR to the errand, so it has to offer them their decision too.
test('gives a deviation marked with a high HSL risk the HSL decision, reported under HSL or not', () => {
  const highHslRisk = { classification: 'risk', resourcePath: 'RISK/HIGH_HSL', resourceName: 'HIGH_HSL' };
  const deviation = { resourcePath: 'REPORT_TYPE/DEVIATION' };
  const solLabel = { classification: 'PROVISION', resourcePath: 'PROVISION/SOL', resourceName: 'SOL' };

  assert.equal(resolveAvvikelseDocumentApplicability({ labels: [deviation, highHslRisk] }), 'hsl-deviation');
  assert.equal(resolveAvvikelseDocumentApplicability({ labels: [deviation, solLabel, highHslRisk] }), 'hsl-deviation');
  assert.equal(
    resolveAvvikelseDocumentApplicability({ labels: [{ classification: 'Risk', resourceName: ' high_hsl ' }] }),
    'hsl-deviation'
  );
  // A misconduct takes the lex Sarah decision whatever the HSL risk: one decision per errand.
  assert.equal(
    resolveAvvikelseDocumentApplicability({ labels: [{ resourcePath: 'REPORT_TYPE/ABUSE' }, highHslRisk] }),
    'reported-misconduct'
  );
  for (const errand of [
    // Another risk, and the same name outside the risks, are not the mark.
    { labels: [deviation, { classification: 'risk', resourcePath: 'RISK/HIGH_SOL_LSS' }] },
    { labels: [{ classification: 'CATEGORY', resourceName: 'HIGH_HSL' }] },
    { labels: [deviation] },
  ]) {
    assert.equal(resolveAvvikelseDocumentApplicability(errand), undefined);
  }
});

test('lets the report type label decide, and the reported event type only stand in for an errand without one', () => {
  const reportedAsMisconduct = [{ key: 'eventType', values: ['MISSFORHALLANDE'] }];
  // LEX declined the misconduct and it went back as a deviation: the label moved, the report never does.
  assert.equal(
    isAvvikelseReportedMisconductErrand({
      parameters: reportedAsMisconduct,
      labels: [{ resourcePath: 'REPORT_TYPE/DEVIATION' }],
    }),
    false
  );
  assert.equal(
    isAvvikelseReportedMisconductErrand({
      parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }],
      labels: [{ resourcePath: 'REPORT_TYPE/ABUSE' }],
    }),
    true
  );
  assert.equal(isAvvikelseReportedMisconductErrand({ parameters: reportedAsMisconduct, labels: [] }), true);
});
