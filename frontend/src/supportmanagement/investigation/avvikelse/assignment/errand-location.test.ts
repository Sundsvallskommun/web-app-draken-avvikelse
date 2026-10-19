import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import { describePlace, resolveErrandPlace, selectablePlaceNodes } from './errand-location';

/** An errand label as Support Management returns it: the id is the identity, the rest is optional. */
const carried = (id: string): Label => ({ id } as Label);

const label = (id: string, displayName: string, labels?: Label[]): Label => ({
  id,
  classification: 'LOCATION',
  displayName,
  resourceName: id.toUpperCase(),
  resourcePath: `LOCATION/${id.toUpperCase()}`,
  ...(labels ? { labels } : {}),
});

// Katla's levels: the structure root, an area, an operation, a unit, the place shown (level 6) and
// an optional department beneath it (level 7).
const north = label('north-blue', 'Blå');
const northHome = label('north-home', 'Norra hemmet', [north, label('north-red', 'Röd')]);
const southHome = label('south-home', 'Södra hemmet');
const labelStructure: Label[] = [
  {
    id: 'place-root',
    classification: 'LOCATION_ROOT',
    displayName: 'Platsstruktur',
    resourceName: 'platsstruktur',
    resourcePath: 'LOCATION',
    labels: [
      label('area', 'Norra området', [
        label('operation', 'Äldreomsorg', [label('unit', 'Enhet 1', [northHome, southHome])]),
      ]),
    ],
  },
  { id: 'category-root', classification: 'CATEGORY_ROOT', displayName: 'Kategori', resourceName: 'CATEGORY' },
];

test('resolves the deepest place-structure label the errand carries, presented like Katla does', () => {
  const place = resolveErrandPlace(
    ['category-root', 'area', 'operation', 'unit', 'north-home', 'north-blue'].map(carried),
    labelStructure
  );

  assert.equal(place?.node.label.id, 'north-blue');
  assert.deepEqual(place?.presentation, { place: 'Norra hemmet', department: 'Blå' });
  assert.equal(describePlace(place!.presentation), 'Norra hemmet — Avdelning: Blå');
});

test('matches a label by resource path when the errand label has no id', () => {
  const place = resolveErrandPlace([{ resourcePath: 'LOCATION/SOUTH-HOME' } as Label], labelStructure);

  assert.equal(place?.node.label.id, 'south-home');
  assert.deepEqual(place?.presentation, { place: 'Södra hemmet' });
});

test('reports no place for an errand without one, or with two at the same depth', () => {
  assert.equal(resolveErrandPlace([carried('category-root')], labelStructure), undefined);
  assert.equal(resolveErrandPlace([carried('north-home'), carried('south-home')], labelStructure), undefined);
  assert.equal(resolveErrandPlace([carried('north-home')], undefined), undefined);
});

test('offers only the units at the bottom of the structure as targets', () => {
  assert.deepEqual(
    selectablePlaceNodes(labelStructure).map((node) => node.label.id),
    ['north-blue', 'north-red', 'south-home']
  );
});
