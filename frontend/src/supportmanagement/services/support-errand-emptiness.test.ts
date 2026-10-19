import assert from 'node:assert/strict';

import { test } from 'vitest';

import { isSupportErrandEmpty } from './support-errand-emptiness';

test('an errand without an id is empty', () => {
  assert.equal(isSupportErrandEmpty(undefined), true);
  assert.equal(isSupportErrandEmpty({ id: undefined }), true);
});

// Without this an errand stays a draft forever: its classification is written by the investigation
// document, so nothing on Grundinformation can give the errand one.
test('an errand is not a draft for lacking a classification', () => {
  assert.equal(isSupportErrandEmpty({ id: 'errand-id' }), false);
});
