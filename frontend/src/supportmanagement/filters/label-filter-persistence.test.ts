import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  labelFilterSelectionsEqual,
  parsePersistedLabelFilterSelections,
  serializeLabelFilterSelections,
} from './label-filter-persistence';

const selections = [
  { groupKey: 'classification', fieldKey: 'category', resourcePath: 'CATEGORY/HSL/FIRST' },
  { groupKey: 'classification', fieldKey: 'type', resourcePath: 'CATEGORY/HSL/FIRST/GENERAL' },
];

test('round-trips complete typed selection identities through persistence', () => {
  const serialized = serializeLabelFilterSelections(selections);

  assert.deepEqual(parsePersistedLabelFilterSelections(serialized), selections);
  assert.equal(labelFilterSelectionsEqual(parsePersistedLabelFilterSelections(serialized), selections), true);
});

test('also accepts an already parsed persisted array', () => {
  assert.deepEqual(parsePersistedLabelFilterSelections(selections), selections);
});

test('fails closed for malformed JSON or incomplete selections', () => {
  assert.deepEqual(parsePersistedLabelFilterSelections('{'), []);
  assert.deepEqual(
    parsePersistedLabelFilterSelections(
      JSON.stringify([...selections, { groupKey: 'classification', resourcePath: 'CATEGORY/UNKNOWN' }])
    ),
    []
  );
  assert.deepEqual(
    parsePersistedLabelFilterSelections(
      JSON.stringify([...selections, { groupKey: ' classification', fieldKey: 'type', resourcePath: 'CATEGORY/X' }])
    ),
    []
  );
});
