import assert from 'node:assert/strict';

import { test } from 'vitest';

import { toStrongETag } from './strong-etag';

test('creates canonical strong ETags from valid versions', () => {
  assert.equal(toStrongETag(0, 'parameter'), '"0"');
  assert.equal(toStrongETag(7, 'parameter'), '"7"');
  assert.equal(toStrongETag(Number.MAX_SAFE_INTEGER, 'parameter'), `"${Number.MAX_SAFE_INTEGER}"`);
});

test('rejects absent or non-canonical versions before a write', () => {
  for (const version of [
    undefined,
    null,
    '',
    '7',
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(() => toStrongETag(version, 'parameter'), /valid parameter version/u);
  }
});
