import assert from 'node:assert/strict';

import { test } from 'vitest';

import { accountsWithoutPerson, toPlaceManagerRows } from './place-manager-rows';
import type { PlaceManagerPerson, PlaceManagerRole } from './place-manager-service';
import type { PlaceHolder, PlaceTreeNode } from './place-manager-tree';

const NORTH = { name: 'Norr', resourcePath: 'LOCATION/NORTH' };
const CARE = { name: 'Vård och omsorg', resourcePath: 'LOCATION' };

const unit: PlaceTreeNode = {
  labelId: 'north-home',
  name: 'Norra hemtjänsten',
  resourcePath: 'LOCATION/NORTH/HOME',
  kind: 'unit',
  children: [],
  unitPaths: ['LOCATION/NORTH/HOME'],
  ancestors: [NORTH],
};
const area: PlaceTreeNode = {
  labelId: 'north',
  ...NORTH,
  kind: 'area',
  children: [unit],
  unitPaths: ['LOCATION/NORTH/HOME', 'LOCATION/NORTH/HOUSING', 'LOCATION/NORTH/DAY'],
  ancestors: [],
};

const roles: PlaceManagerRole[] = [
  { key: 'UNIT_MANAGER', label: 'Enhetschef' },
  { key: 'HEAD_OF_OPERATIONS', label: 'Verksamhetschef' },
];
const person = (adAccount: string, displayName: string | undefined, roleKeys: string[]): PlaceManagerPerson => ({
  adAccount,
  ...(displayName ? { displayName } : {}),
  roleKeys,
});
const peopleOf = (...people: PlaceManagerPerson[]) =>
  new Map(people.map((current) => [current.adAccount.toLowerCase(), current]));
const holder = (adAccount: string, heldUnitCount: number, extra: Partial<PlaceHolder> = {}): PlaceHolder => ({
  adAccount,
  origin: 'AUTOMATIC',
  heldUnitCount,
  ...extra,
});

test('the people on a unit are named, in the order of their names, with the roles they hold', () => {
  const rows = toPlaceManagerRows(
    unit,
    [holder('ZARA01', 1), holder('adam02', 1, { origin: 'MANUAL' })],
    peopleOf(person('zara01', 'Zara Zander', ['HEAD_OF_OPERATIONS', 'UNIT_MANAGER']), person('adam02', 'Adam Ask', [])),
    roles
  );

  assert.deepEqual(rows, [
    {
      adAccount: 'adam02',
      name: 'Adam Ask',
      roleLabels: [],
      extent: 'Enheten',
      originLabel: 'Satt för hand',
      removable: true,
    },
    {
      adAccount: 'ZARA01',
      name: 'Zara Zander',
      roleLabels: ['Enhetschef', 'Verksamhetschef'],
      extent: 'Enheten',
      originLabel: 'Inläst automatiskt',
      removable: true,
    },
  ]);
});

test('a person who is not looked up yet goes by the account, with roles unknown rather than missing', () => {
  const [row] = toPlaceManagerRows(unit, [holder('nora03', 1)], new Map(), roles);

  assert.equal(row.name, 'nora03');
  assert.equal(row.roleLabels, undefined);
  assert.deepEqual(
    accountsWithoutPerson([holder('nora03', 1), holder('ADAM02', 1)], peopleOf(person('adam02', 'Adam', []))),
    ['nora03']
  );
});

test('a person the directory does not know keeps the account as the name', () => {
  const [row] = toPlaceManagerRows(unit, [holder('gone04', 1)], peopleOf(person('gone04', undefined, [])), roles);

  assert.equal(row.name, 'gone04');
  assert.deepEqual(row.roleLabels, []);
});

test('an area says how many of its units each person holds', () => {
  const rows = toPlaceManagerRows(area, [holder('all01', 3), holder('some02', 1)], new Map(), roles);

  assert.deepEqual(
    rows.map(({ extent, removable }) => ({ extent, removable })),
    [
      { extent: 'Alla 3 enheter', removable: true },
      { extent: '1 av 3 enheter', removable: true },
    ]
  );
});

test('a pattern on the area itself is said, and can be taken away there', () => {
  const [onlyPattern, both] = toPlaceManagerRows(
    area,
    [holder('area01', 0, { coveringArea: NORTH }), holder('both02', 1, { coveringArea: NORTH })],
    new Map(),
    roles
  );

  assert.equal(onlyPattern.extent, 'Hela Norr som ett mönster');
  assert.equal(onlyPattern.removable, true);
  assert.equal(both.extent, '1 av 3 enheter, och hela Norr som ett mönster');
});

test('a pattern on a level above the place is shown but is not this place to take away', () => {
  const [onUnit] = toPlaceManagerRows(unit, [holder('area01', 0, { coveringArea: NORTH })], new Map(), roles);
  const [onArea] = toPlaceManagerRows(area, [holder('top02', 0, { coveringArea: CARE })], new Map(), roles);

  assert.equal(onUnit.extent, 'Hela Norr som ett mönster');
  assert.equal(onUnit.removable, false);
  assert.equal(onArea.extent, 'Hela Vård och omsorg som ett mönster');
  assert.equal(onArea.removable, false);
});
