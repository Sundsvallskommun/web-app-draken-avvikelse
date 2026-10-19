import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import {
  LEGACY_LABEL_SUBTYPE_DEPTH,
  LEGACY_LABEL_TYPE_DEPTH,
  legacyLabelFilterResourcePaths,
} from './legacy-label-filter';

const label = (displayName: string, resourcePath: string, labels?: Label[]): Label =>
  ({ displayName, resourcePath, ...(labels ? { labels } : {}) } as Label);

const labelStructure = [
  label('Ekonomi', 'ECONOMY', [
    label('Faktura', 'ECONOMY/INVOICE', [label('Påminnelse', 'ECONOMY/INVOICE/REMINDER')]),
    label('Övrigt', 'ECONOMY/OTHER'),
  ]),
  label('Bygg', 'BUILD', [label('Övrigt', 'BUILD/OTHER', [label('Påminnelse', 'BUILD/OTHER/REMINDER')])]),
  label('Tom', 'EMPTY'),
];

test('asks for every type with a chosen display name, under every category', () => {
  assert.deepEqual(legacyLabelFilterResourcePaths(labelStructure, ['Övrigt'], LEGACY_LABEL_TYPE_DEPTH), [
    'ECONOMY/OTHER',
    'BUILD/OTHER',
  ]);
  assert.deepEqual(legacyLabelFilterResourcePaths(labelStructure, ['Faktura'], LEGACY_LABEL_TYPE_DEPTH), [
    'ECONOMY/INVOICE',
  ]);
});

test('asks for subtypes one level further down, and for nothing a category or type is named', () => {
  assert.deepEqual(legacyLabelFilterResourcePaths(labelStructure, ['Påminnelse'], LEGACY_LABEL_SUBTYPE_DEPTH), [
    'ECONOMY/INVOICE/REMINDER',
    'BUILD/OTHER/REMINDER',
  ]);
  assert.deepEqual(legacyLabelFilterResourcePaths(labelStructure, ['Faktura', 'Bygg'], LEGACY_LABEL_SUBTYPE_DEPTH), []);
  assert.deepEqual(legacyLabelFilterResourcePaths(undefined, ['Faktura'], LEGACY_LABEL_TYPE_DEPTH), []);
});
