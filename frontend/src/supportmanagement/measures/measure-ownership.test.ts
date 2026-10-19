import { expect, test } from 'vitest';

import { isOwnMeasure } from './measure-ownership';

test('a measure is own only for the same user, compared case-insensitively', () => {
  expect(isOwnMeasure({ addedByUser: 'ab12cd' }, 'ab12cd')).toBe(true);
  expect(isOwnMeasure({ addedByUser: 'AB12CD' }, 'ab12cd')).toBe(true);
  expect(isOwnMeasure({ addedByUser: 'ab12cd' }, 'xy99zz')).toBe(false);
  expect(isOwnMeasure({ addedByUser: undefined }, 'ab12cd')).toBe(false);
  expect(isOwnMeasure({ addedByUser: 'ab12cd' }, undefined)).toBe(false);
});
