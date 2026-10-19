import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import type { PlaceManagerAssignment } from './place-manager-service';
import {
  areaIdsOf,
  buildPlaceTree,
  countPlaceHolders,
  countUnitsWithoutHolder,
  filterPlaceTree,
  findPlaceTreeNode,
  holdersOfPlace,
  isPlaceTreeFiltered,
  withChangedAssignment,
} from './place-manager-tree';

const label = (
  id: string,
  classification: string,
  resourcePath: string,
  displayName: string,
  labels?: Label[]
): Label =>
  ({
    id,
    classification,
    resourcePath,
    resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
    displayName,
    ...(labels ? { labels } : {}),
  } as Label);

// Every level down to the unit is a place, and what lies under a unit is not - the shape Support Management has.
const labelStructure: Label[] = [
  label('category-root', 'CATEGORY_ROOT', 'CATEGORY', 'Kategori', [label('hsl', 'CATEGORY', 'CATEGORY/HSL', 'HSL')]),
  label('place-root', 'location-root', 'LOCATION', 'Platsstruktur', [
    label('care', 'location', 'LOCATION/CARE', 'Vård och omsorg', [
      label('north', 'location', 'LOCATION/CARE/NORTH', 'Norr', [
        label('north-home', 'location', 'LOCATION/CARE/NORTH/HOME', 'Norra hemtjänsten', [
          label('night', 'department', 'LOCATION/CARE/NORTH/HOME/NIGHT', 'Nattpatrullen'),
        ]),
        label('north-housing', 'location', 'LOCATION/CARE/NORTH/HOUSING', 'Norra boendet'),
      ]),
      label('south', 'location', 'LOCATION/CARE/SOUTH', 'Söder', [
        label('south-home', 'location', 'LOCATION/CARE/SOUTH/HOME', 'Södra hemtjänsten'),
      ]),
    ]),
  ]),
];

const NORTH_HOME = 'LOCATION/CARE/NORTH/HOME';
const NORTH_HOUSING = 'LOCATION/CARE/NORTH/HOUSING';
const SOUTH_HOME = 'LOCATION/CARE/SOUTH/HOME';
const NORTH = { name: 'Norr', resourcePath: 'LOCATION/CARE/NORTH' };

const assignment = (adAccount: string, placePaths: string[], origin = 'AUTOMATIC'): PlaceManagerAssignment => ({
  adAccount,
  origin,
  placePaths,
});

const assignments: PlaceManagerAssignment[] = [
  assignment('nora01', [NORTH_HOME]),
  assignment('ANNA02', [NORTH_HOME, NORTH_HOUSING, SOUTH_HOME]),
  assignment('area03', [NORTH.resourcePath], 'MANUAL'),
];

const tree = buildPlaceTree(labelStructure);
const node = (labelId: string) => {
  const found = findPlaceTreeNode(tree, labelId);
  assert.ok(found, `no place ${labelId}`);
  return found;
};
const namesOf = (nodes: readonly { name: string; children: readonly { name: string }[] }[]): string[] =>
  nodes.flatMap((current) => [current.name, ...namesOf(current.children as never)]);

test('the tree runs from beneath the top of the place structure down to the units', () => {
  assert.deepEqual(namesOf(tree), [
    'Vård och omsorg',
    'Norr',
    'Norra hemtjänsten',
    'Norra boendet',
    'Söder',
    'Södra hemtjänsten',
  ]);
  assert.equal(node('north-home').kind, 'unit');
  assert.equal(node('north').kind, 'area');
  // A department beneath a unit follows the unit and is no place of its own.
  assert.equal(findPlaceTreeNode(tree, 'night'), undefined);
  assert.equal(findPlaceTreeNode(tree, 'hsl'), undefined);
  assert.equal(findPlaceTreeNode(tree, undefined), undefined);
});

test('an area stands for every unit beneath it, and a place knows the levels above it', () => {
  assert.deepEqual(node('care').unitPaths, [NORTH_HOME, NORTH_HOUSING, SOUTH_HOME]);
  assert.deepEqual(node('north').unitPaths, [NORTH_HOME, NORTH_HOUSING]);
  assert.deepEqual(node('north-home').unitPaths, [NORTH_HOME]);
  assert.deepEqual(
    node('north-home').ancestors.map((level) => level.name),
    ['Vård och omsorg', 'Norr']
  );
});

test('a level above the units is an area whatever it is classified as', () => {
  const grouped = buildPlaceTree([
    label('place-root', 'LOCATION_ROOT', 'LOCATION', 'Platsstruktur', [
      label('group', 'DEPARTMENT', 'LOCATION/GROUP', 'Äldreomsorg', [
        label('home', 'LOCATION', 'LOCATION/GROUP/HOME', 'Hemmet'),
      ]),
    ]),
  ]);

  assert.equal(grouped[0].kind, 'area');
  assert.deepEqual(grouped[0].unitPaths, ['LOCATION/GROUP/HOME']);
});

test('no place structure is no tree', () => {
  assert.deepEqual(buildPlaceTree(undefined), []);
  assert.deepEqual(buildPlaceTree([labelStructure[0]]), []);
});

test('the units nobody holds are counted per place', () => {
  const holderCounts = countPlaceHolders(assignments);

  assert.equal(holderCounts.get(NORTH_HOME), 2);
  assert.equal(countUnitsWithoutHolder(node('care'), holderCounts), 0);
  assert.equal(countUnitsWithoutHolder(node('care'), countPlaceHolders([assignments[0]])), 2);
  assert.equal(countUnitsWithoutHolder(node('south-home'), countPlaceHolders([assignments[0]])), 1);
});

test('the search finds words on any level and keeps the areas that lead to what it found', () => {
  const holderCounts = countPlaceHolders(assignments);
  const search = (query: string, onlyWithoutHolder = false) =>
    namesOf(filterPlaceTree(tree, { query, onlyWithoutHolder }, holderCounts));

  assert.deepEqual(search('boendet'), ['Vård och omsorg', 'Norr', 'Norra boendet']);
  assert.deepEqual(search('  SÖDER  '), ['Vård och omsorg', 'Söder', 'Södra hemtjänsten']);
  assert.deepEqual(search('norr hemtjänst'), ['Vård och omsorg', 'Norr', 'Norra hemtjänsten']);
  assert.deepEqual(search('finns inte'), []);
  assert.equal(search('').length, 6);
});

test('the filter keeps only the units nobody holds, and an area it keeps still stands for all its units', () => {
  const filtered = filterPlaceTree(tree, { query: '', onlyWithoutHolder: true }, countPlaceHolders([assignments[0]]));

  assert.deepEqual(namesOf(filtered), ['Vård och omsorg', 'Norr', 'Norra boendet', 'Söder', 'Södra hemtjänsten']);
  assert.deepEqual(filtered[0].unitPaths, [NORTH_HOME, NORTH_HOUSING, SOUTH_HOME]);
  assert.deepEqual(areaIdsOf(filtered), ['care', 'north', 'south']);
});

test('a filter is one that narrows', () => {
  assert.equal(isPlaceTreeFiltered({ query: '  ', onlyWithoutHolder: false }), false);
  assert.equal(isPlaceTreeFiltered({ query: 'norr', onlyWithoutHolder: false }), true);
  assert.equal(isPlaceTreeFiltered({ query: '', onlyWithoutHolder: true }), true);
});

test('a unit is held by the people with its own pattern, and reached by those with an area above it', () => {
  assert.deepEqual(holdersOfPlace(node('north-home'), assignments), [
    { adAccount: 'ANNA02', origin: 'AUTOMATIC', heldUnitCount: 1 },
    { adAccount: 'area03', origin: 'MANUAL', heldUnitCount: 0, coveringArea: NORTH },
    { adAccount: 'nora01', origin: 'AUTOMATIC', heldUnitCount: 1 },
  ]);
  assert.deepEqual(holdersOfPlace(node('south-home'), assignments), [
    { adAccount: 'ANNA02', origin: 'AUTOMATIC', heldUnitCount: 1 },
  ]);
});

test('an area lists who holds how many of its units, and who holds it as one pattern', () => {
  assert.deepEqual(holdersOfPlace(node('north'), assignments), [
    { adAccount: 'ANNA02', origin: 'AUTOMATIC', heldUnitCount: 2 },
    { adAccount: 'area03', origin: 'MANUAL', heldUnitCount: 0, coveringArea: NORTH },
    { adAccount: 'nora01', origin: 'AUTOMATIC', heldUnitCount: 1 },
  ]);
  // The pattern on Norr does not cover Söder, so its holder has nothing to do with it.
  assert.deepEqual(
    holdersOfPlace(node('south'), assignments).map((holder) => holder.adAccount),
    ['ANNA02']
  );
});

test('paths are compared as Support Management compares them', () => {
  const lowerCased = [assignment('nora01', [` /${NORTH_HOME.toLowerCase()}/ `])];

  assert.equal(holdersOfPlace(node('north-home'), lowerCased).length, 1);
  assert.equal(countPlaceHolders(lowerCased).get(NORTH_HOME), 1);
});

test('a change replaces the person it concerns, however the account is written', () => {
  const changed = withChangedAssignment(assignments, assignment('anna02', [SOUTH_HOME], 'MANUAL'));

  assert.deepEqual(
    changed.map((current) => current.adAccount),
    ['nora01', 'area03', 'anna02']
  );
  assert.deepEqual(changed.at(-1)?.placePaths, [SOUTH_HOME]);
});

test('a person left without places is no longer listed, and a new one is added', () => {
  assert.deepEqual(
    withChangedAssignment(assignments, assignment('nora01', [])).map((current) => current.adAccount),
    ['ANNA02', 'area03']
  );
  assert.equal(withChangedAssignment(assignments, assignment('new04', [SOUTH_HOME])).length, 4);
});
