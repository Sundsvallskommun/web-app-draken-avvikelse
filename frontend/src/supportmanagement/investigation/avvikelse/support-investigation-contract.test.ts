import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  parseOwnErrandWrites,
  parseParentErrandVersion,
  parseReportErrandWrites,
  parseSupportInvestigationDocument,
} from './support-investigation-contract';

const document = { key: 'custom-document', schemaId: '2281_shared-schema_1.0', value: { answer: 42 }, version: 3 };

test('accepts an exact key, JSON value and matching strong ETag', () => {
  assert.deepEqual(parseSupportInvestigationDocument(document, 'custom-document', '"3"'), {
    document,
    etag: '"3"',
  });
});

test('rejects cross-key responses, malformed ETags and inconsistent versions', () => {
  assert.throws(() => parseSupportInvestigationDocument(document, 'another-document', '"3"'), /svar är ogiltigt/u);
  assert.throws(() => parseSupportInvestigationDocument(document, 'custom-document', '*'), /ETag är ogiltig/u);
  assert.throws(
    () => parseSupportInvestigationDocument(document, 'custom-document', '"4"'),
    /version är inkonsekvent/u
  );
});

test('rejects non-JSON response values', () => {
  assert.throws(
    () => parseSupportInvestigationDocument({ ...document, value: { answer: Number.NaN } }, document.key, '"3"'),
    /svar är ogiltigt/u
  );
});

test('reads how many errand writes the save made, one when the BFF does not say', () => {
  assert.equal(parseOwnErrandWrites('2'), 2);
  for (const value of [undefined, '', '0', '-1', '1.5', 'två']) {
    assert.equal(parseOwnErrandWrites(value), 1);
  }
});

test('reads how many errand writes a report made, none included, and nothing when the BFF does not say', () => {
  assert.equal(parseReportErrandWrites('3'), 3);
  // A retry of a publication that was already confirmed writes nothing.
  assert.equal(parseReportErrandWrites('0'), 0);
  for (const value of [undefined, '', '-1', '1.5', '03', 'tre']) {
    assert.equal(parseReportErrandWrites(value), undefined);
  }
});

test('requires a canonical fresh parent-errand version', () => {
  assert.equal(parseParentErrandVersion('12'), 12);
  for (const value of [undefined, '', '-1', '01', '1.5']) {
    assert.throws(() => parseParentErrandVersion(value), /nya version saknas/u);
  }
});
