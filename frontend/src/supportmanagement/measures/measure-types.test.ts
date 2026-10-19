import type { MeasureType } from '@common/data-contracts/supportmanagement/data-contracts';
import { expect, test } from 'vitest';

import { measureTypeLabel, selectableMeasureTypes } from './measure-types';

const types: MeasureType[] = [
  { id: 'old-id', name: 'OLD', displayName: 'Tidigare typ', measureGroups: ['B', 'SHARED'], deprecated: true },
  {
    id: 'second-id',
    name: 'SECOND',
    displayName: 'Andra typen',
    measureGroups: ['A', 'SHARED'],
    sortOrder: 2,
  },
  {
    id: 'first-id',
    name: 'FIRST',
    displayName: 'Första typen',
    measureGroups: ['A', 'SHARED'],
    sortOrder: 1,
  },
];

test('sorts each active choice once by metadata without modifying the source', () => {
  const original = structuredClone(types);
  expect(selectableMeasureTypes(types, ['FIRST', 'SECOND']).map((type) => type.name)).toEqual(['FIRST', 'SECOND']);
  expect(types).toEqual(original);
});

test('keeps an existing deprecated type selectable and resolves historic or unknown labels', () => {
  expect(selectableMeasureTypes(types, ['FIRST', 'SECOND'], 'OLD').map((type) => type.name)).toEqual([
    'FIRST',
    'SECOND',
    'OLD',
  ]);
  expect(measureTypeLabel(types, { type: 'OLD' })).toBe('Tidigare typ');
  expect(measureTypeLabel(types, { type: 'REMOVED' })).toBe('REMOVED');
  expect(selectableMeasureTypes([], [])).toEqual([]);
});

test('identifies a type by its metadata name, never by its display name, and offers no nameless metadata', () => {
  expect(selectableMeasureTypes(types, ['Första typen'])).toEqual([]);
  expect(selectableMeasureTypes([{ name: '', measureGroups: ['A', 'SHARED'] }], [''])).toEqual([]);
  expect(measureTypeLabel(types, { type: 'Tidigare typ' })).toBe('Tidigare typ');
  expect(measureTypeLabel(types, {})).toBe('Typ saknas');
});

test('only offers types resolved by Draken; empty choices grant nothing', () => {
  expect(selectableMeasureTypes(types, [])).toEqual([]);
  expect(selectableMeasureTypes(types, ['UNKNOWN'])).toEqual([]);
  expect(
    selectableMeasureTypes([{ id: 'type-id', name: 'UNASSIGNED', measureGroups: ['role-1', 'SHARED'] }], [])
  ).toEqual([]);
});

test('keeps the saved type when Draken no longer offers it', () => {
  expect(selectableMeasureTypes(types, [], 'FIRST').map((type) => type.name)).toEqual(['FIRST']);
});
