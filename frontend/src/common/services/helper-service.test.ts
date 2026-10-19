import assert from 'node:assert/strict';

import { hasDirtyFields } from '@common/services/helper-service';
import { test } from 'vitest';

test('hasDirtyFields is false for an untouched form', () => {
  assert.equal(hasDirtyFields({}), false);
  assert.equal(hasDirtyFields(undefined), false);
});

test('hasDirtyFields is false when every tracked field has been reverted', () => {
  assert.equal(hasDirtyFields({ title: false, suspension: { suspendedFrom: false } }), false);
});

test('hasDirtyFields finds a changed field at any depth', () => {
  assert.equal(hasDirtyFields({ title: true }), true);
  assert.equal(hasDirtyFields({ title: false, suspension: { suspendedTo: true } }), true);
});

test('hasDirtyFields handles the array shape react-hook-form uses for field arrays', () => {
  assert.equal(hasDirtyFields({ contacts: [{ firstName: false }, { firstName: true }] }), true);
  assert.equal(hasDirtyFields({ contacts: [{ firstName: false }] }), false);
});
