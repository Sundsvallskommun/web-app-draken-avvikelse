import assert from 'node:assert/strict';

import { test } from 'vitest';

import { normalizeSupportManagementResourcePath, trimSupportManagementPath } from './supportmanagement-path';

test('trims only Support Management path boundaries', () => {
  assert.equal(trimSupportManagementPath('  ///Category/HSL///  '), 'Category/HSL');
  assert.equal(trimSupportManagementPath('CATEGORY//HSL'), 'CATEGORY//HSL');
});

test('normalizes Support Management label resources case-insensitively', () => {
  assert.equal(normalizeSupportManagementResourcePath(' /Category/Hsl/ '), 'CATEGORY/HSL');
  assert.equal(normalizeSupportManagementResourcePath(undefined), '');
});
