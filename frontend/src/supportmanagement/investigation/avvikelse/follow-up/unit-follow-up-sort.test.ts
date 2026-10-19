import assert from 'node:assert/strict';

import { test } from 'vitest';

import { nextFollowUpSort, sortFollowUpRows } from './unit-follow-up-sort';

const rows = [{ value: 6 }, { value: undefined }, { value: 3 }, { value: 9 }];
const valueOf = (row: { value?: number }) => row.value;

test('sorts either way and keeps missing values last', () => {
  assert.deepEqual(sortFollowUpRows(rows, { key: 'value', direction: 'ascending' }, valueOf).map(valueOf), [
    3,
    6,
    9,
    undefined,
  ]);
  assert.deepEqual(sortFollowUpRows(rows, { key: 'value', direction: 'descending' }, valueOf).map(valueOf), [
    9,
    6,
    3,
    undefined,
  ]);
});

test('compares text the Swedish way', () => {
  const units = [{ unit: 'Östermalm' }, { unit: 'Ankarsvik' }, { unit: 'Ängom' }];
  assert.deepEqual(
    sortFollowUpRows(units, { key: 'unit', direction: 'ascending' }, (row) => row.unit).map((row) => row.unit),
    ['Ankarsvik', 'Ängom', 'Östermalm']
  );
});

test('turns the active column and starts a new one in its own direction', () => {
  assert.deepEqual(nextFollowUpSort({ key: 'created', direction: 'descending' }, 'created'), {
    key: 'created',
    direction: 'ascending',
  });
  assert.deepEqual(nextFollowUpSort({ key: 'created', direction: 'descending' }, 'unit'), {
    key: 'unit',
    direction: 'ascending',
  });
});
