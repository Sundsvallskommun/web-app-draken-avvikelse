import { AccessAccessLevelEnum, type AccessUser } from '@/data-contracts/access-mapper/data-contracts';
import type { Label } from '@/data-contracts/supportmanagement/data-contracts';
import {
  applyPlaceChanges,
  findPlaceStructureRoot,
  MANUAL_ACCESS_ORIGIN,
  placeAccessPattern,
  readPlaceManagerAssignment,
  requirePlaceRootPath,
  resolveAdministeredPlace,
} from '@/services/place-manager-assignments';

import { mockAdUsername } from './helpers/mock-data';

const label = (id: string, classification: string, resourcePath: string, displayName: string, labels?: Label[]): Label => ({
  id,
  classification,
  resourcePath,
  resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
  displayName,
  ...(labels ? { labels } : {}),
});

// The shape Support Management has: every level down to the unit is a place, and what lies under a unit is not.
const labelStructure: Label[] = [
  label('category-root', 'category-root', 'CATEGORY', 'Kategori', [label('category-hsl', 'category', 'CATEGORY/HSL', 'HSL')]),
  label('location-root', 'location-root', 'LOCATION', 'Platsstruktur', [
    label('care', 'location', 'LOCATION/CARE', 'Vård och omsorg', [
      label('north', 'location', 'LOCATION/CARE/NORTH', 'Norr', [
        label('north-home', 'location', 'LOCATION/CARE/NORTH/HOME', 'Norra hemtjänsten', [
          label('north-home-night', 'department', 'LOCATION/CARE/NORTH/HOME/NIGHT', 'Nattpatrullen'),
        ]),
        label('north-housing', 'location', 'LOCATION/CARE/NORTH/HOUSING', 'Norra boendet'),
      ]),
      label('south', 'location', 'LOCATION/CARE/SOUTH', 'Söder', [label('south-home', 'location', 'LOCATION/CARE/SOUTH/HOME', 'Södra hemtjänsten')]),
    ]),
  ]),
];

const PLACE_ROOT = 'LOCATION';
const NORTH_HOME = 'LOCATION/CARE/NORTH/HOME';
const NORTH_HOUSING = 'LOCATION/CARE/NORTH/HOUSING';
const SOUTH_HOME = 'LOCATION/CARE/SOUTH/HOME';

const readWrite = (pattern: string) => ({ pattern, accessLevel: AccessAccessLevelEnum.RW });
const seededManager = (placePaths: string[]): AccessUser => ({
  id: 'entry-1',
  userId: mockAdUsername,
  origin: 'AUTOMATIC',
  accessByType: [{ type: 'label', access: placePaths.map(path => readWrite(`${path}/**`)) }],
});

const statusOf = (action: () => unknown): number | undefined => {
  try {
    action();
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
};

describe('placeAccessPattern', () => {
  it('is the place path with everything beneath it', () => {
    expect(placeAccessPattern(NORTH_HOME)).toBe(`${NORTH_HOME}/**`);
  });
});

describe('readPlaceManagerAssignment', () => {
  it('reads the places among a person label patterns and nothing else', () => {
    const accessUser: AccessUser = {
      userId: ` ${mockAdUsername} `,
      origin: 'AUTOMATIC',
      accessByType: [
        { type: 'role', access: [{ pattern: 'UNIT_MANAGER' }] },
        { type: 'label', access: [readWrite(`${NORTH_HOME}/**`), readWrite('CATEGORY/HSL/**'), readWrite(`${NORTH_HOME}/**`)] },
        { type: 'label', access: [readWrite(`${SOUTH_HOME}/**`), readWrite('LOCATION/**'), readWrite(NORTH_HOUSING)] },
      ],
    };

    expect(readPlaceManagerAssignment(accessUser, PLACE_ROOT)).toEqual({
      adAccount: mockAdUsername,
      origin: 'AUTOMATIC',
      placePaths: [NORTH_HOME, SOUTH_HOME],
    });
  });

  it('is no assignment for a person without a place, or without an account', () => {
    expect(
      readPlaceManagerAssignment({ userId: mockAdUsername, accessByType: [{ type: 'label', access: [readWrite('LOCATION/**')] }] }, PLACE_ROOT),
    ).toBe(undefined);
    expect(readPlaceManagerAssignment({ ...seededManager([NORTH_HOME]), userId: ' ' }, PLACE_ROOT)).toBe(undefined);
  });
});

describe('the place structure', () => {
  it('is the tree whose levels are places', () => {
    expect(findPlaceStructureRoot(labelStructure)?.id).toBe('location-root');
    expect(requirePlaceRootPath(labelStructure)).toBe(PLACE_ROOT);
  });

  it('is required', () => {
    expect(statusOf(() => requirePlaceRootPath([labelStructure[0]]))).toBe(502);
    expect(statusOf(() => requirePlaceRootPath(undefined))).toBe(502);
  });
});

describe('resolveAdministeredPlace', () => {
  it('lets a unit stand for itself, without what lies beneath it', () => {
    expect(resolveAdministeredPlace(labelStructure, 'north-home')).toEqual({
      labelId: 'north-home',
      displayName: 'Norra hemtjänsten',
      resourcePath: NORTH_HOME,
      unitPaths: [NORTH_HOME],
    });
  });

  it('lets an area stand for every unit beneath it', () => {
    expect(resolveAdministeredPlace(labelStructure, 'north').unitPaths).toEqual([NORTH_HOME, NORTH_HOUSING]);
    expect(resolveAdministeredPlace(labelStructure, 'care').unitPaths).toEqual([NORTH_HOME, NORTH_HOUSING, SOUTH_HOME]);
  });

  it('takes a level above the units for an area whatever it is classified as', () => {
    const grouped: Label[] = [
      label('location-root', 'location-root', 'LOCATION', 'Platsstruktur', [
        label('group', 'department', 'LOCATION/GROUP', 'Äldreomsorg', [
          label('group-home', 'location', 'LOCATION/GROUP/HOME', 'Hemmet'),
          label('group-housing', 'location', 'LOCATION/GROUP/HOUSING', 'Boendet'),
        ]),
      ]),
    ];

    expect(resolveAdministeredPlace(grouped, 'group')).toMatchObject({
      resourcePath: 'LOCATION/GROUP',
      unitPaths: ['LOCATION/GROUP/HOME', 'LOCATION/GROUP/HOUSING'],
    });
  });

  it('refuses what is not a place in the structure', () => {
    expect(statusOf(() => resolveAdministeredPlace(labelStructure, 'north-home-night'))).toBe(400);
    expect(statusOf(() => resolveAdministeredPlace(labelStructure, 'location-root'))).toBe(400);
    expect(statusOf(() => resolveAdministeredPlace(labelStructure, 'category-hsl'))).toBe(400);
    expect(statusOf(() => resolveAdministeredPlace(labelStructure, 'missing'))).toBe(400);
  });

  it('refuses an id the structure holds twice', () => {
    const duplicated: Label[] = [
      label('location-root', 'location-root', 'LOCATION', 'Platsstruktur', [
        label('twin', 'location', 'LOCATION/A', 'A'),
        label('twin', 'location', 'LOCATION/B', 'B'),
      ]),
    ];
    expect(statusOf(() => resolveAdministeredPlace(duplicated, 'twin'))).toBe(502);
  });
});

describe('applyPlaceChanges', () => {
  const changes = (addPaths: string[], removePaths: string[] = []) => ({ placeRootPath: PLACE_ROOT, addPaths, removePaths });

  it('creates an entry for a person who has none, marked as set by hand', () => {
    expect(applyPlaceChanges(undefined, mockAdUsername, changes([NORTH_HOME, NORTH_HOME, NORTH_HOUSING]))).toEqual({
      kind: 'create',
      accessUser: {
        userId: mockAdUsername,
        origin: MANUAL_ACCESS_ORIGIN,
        accessByType: [{ type: 'label', access: [readWrite(`${NORTH_HOME}/**`), readWrite(`${NORTH_HOUSING}/**`)] }],
      },
    });
  });

  it('changes nothing when the person already has the place, or never had the one taken away', () => {
    expect(applyPlaceChanges(seededManager([NORTH_HOME]), mockAdUsername, changes([NORTH_HOME]))).toEqual({ kind: 'none' });
    expect(applyPlaceChanges(seededManager([NORTH_HOME]), mockAdUsername, changes([], [SOUTH_HOME]))).toEqual({ kind: 'none' });
    expect(applyPlaceChanges(undefined, mockAdUsername, changes([], [SOUTH_HOME]))).toEqual({ kind: 'none' });
  });

  it('writes a new place beside the ones already there and leaves the rest of the entry alone', () => {
    const existing: AccessUser = {
      id: 'entry-1',
      userId: mockAdUsername.toUpperCase(),
      origin: 'AUTOMATIC',
      accessByType: [
        { type: 'role', access: [{ pattern: 'UNIT_MANAGER' }] },
        { type: 'label', access: [readWrite('CATEGORY/HSL/**')] },
        { type: 'label', access: [readWrite(`${NORTH_HOME}/**`)] },
        { type: 'resource', access: [{ pattern: 'errand', accessLevel: AccessAccessLevelEnum.R }] },
      ],
    };

    expect(applyPlaceChanges(existing, mockAdUsername, changes([SOUTH_HOME]))).toEqual({
      kind: 'update',
      accessUser: {
        // The account stays written the way the entry has it, and the id is the route's, not the body's.
        userId: mockAdUsername.toUpperCase(),
        origin: MANUAL_ACCESS_ORIGIN,
        accessByType: [
          { type: 'role', access: [{ pattern: 'UNIT_MANAGER' }] },
          { type: 'label', access: [readWrite('CATEGORY/HSL/**')] },
          { type: 'label', access: [readWrite(`${NORTH_HOME}/**`), readWrite(`${SOUTH_HOME}/**`)] },
          { type: 'resource', access: [{ pattern: 'errand', accessLevel: AccessAccessLevelEnum.R }] },
        ],
      },
    });
  });

  it('takes a place away, and lets a place named both ways stay away', () => {
    const change = applyPlaceChanges(seededManager([NORTH_HOME, NORTH_HOUSING]), mockAdUsername, changes([NORTH_HOME], [NORTH_HOME]));

    expect(change).toEqual({
      kind: 'update',
      accessUser: {
        userId: mockAdUsername,
        origin: MANUAL_ACCESS_ORIGIN,
        accessByType: [{ type: 'label', access: [readWrite(`${NORTH_HOUSING}/**`)] }],
      },
    });
  });

  it('removes an entry that is left granting nothing', () => {
    expect(applyPlaceChanges(seededManager([NORTH_HOME]), mockAdUsername, changes([], [NORTH_HOME]))).toEqual({ kind: 'delete' });
  });

  it('keeps an entry that still carries something other than places', () => {
    const existing: AccessUser = {
      ...seededManager([NORTH_HOME]),
      accessByType: [
        { type: 'role', access: [{ pattern: 'UNIT_MANAGER' }] },
        { type: 'label', access: [readWrite(`${NORTH_HOME}/**`)] },
      ],
    };

    expect(applyPlaceChanges(existing, mockAdUsername, changes([], [NORTH_HOME]))).toEqual({
      kind: 'update',
      accessUser: {
        userId: mockAdUsername,
        origin: MANUAL_ACCESS_ORIGIN,
        accessByType: [{ type: 'role', access: [{ pattern: 'UNIT_MANAGER' }] }],
      },
    });
  });
});
