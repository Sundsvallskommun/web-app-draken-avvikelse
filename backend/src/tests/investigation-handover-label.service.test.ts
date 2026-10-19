import { Label } from '@/data-contracts/supportmanagement/data-contracts';
import {
  buildInvestigationHandoverLabelUpdate,
  buildInvestigationLocationLabelUpdate,
  resolveErrandLocation,
  resolveInvestigationLocationTarget,
  withoutEmptyLabelRoots,
} from '@/services/investigation-handover-label.service';

const label = (id: string, classification: string, resourcePath: string, displayName: string, labels?: Label[]): Label => ({
  id,
  classification,
  resourcePath,
  resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
  displayName,
  ...(labels ? { labels } : {}),
});

// A place structure the way Support Management describes one: the top node is the structure, the
// levels beneath it are departments, and the units at the bottom are the places AccessMapper's
// patterns are written against. "Blå" exists under two units on purpose - names are not identities.
const northUnit = label('north-unit', 'LOCATION', 'LOCATION/NORTH/NORTH_UNIT', 'Norra enheten', [
  label('north-blue', 'LOCATION', 'LOCATION/NORTH/NORTH_UNIT/BLUE', 'Blå'),
  label('north-red', 'LOCATION', 'LOCATION/NORTH/NORTH_UNIT/RED', 'Röd'),
]);
const southUnit = label('south-unit', 'LOCATION', 'LOCATION/SOUTH/SOUTH_UNIT', 'Södra enheten', [
  label('south-blue', 'LOCATION', 'LOCATION/SOUTH/SOUTH_UNIT/BLUE', 'Blå'),
]);
const structure: Label[] = [
  label('location-root', 'LOCATION_ROOT', 'LOCATION', 'Platsstruktur', [
    label('north', 'DEPARTMENT', 'LOCATION/NORTH', 'Norr', [northUnit]),
    label('south', 'DEPARTMENT', 'LOCATION/SOUTH', 'Söder', [southUnit]),
  ]),
  label('category-root', 'CATEGORY_ROOT', 'CATEGORY', 'Kategori', [label('category-hsl', 'CATEGORY', 'CATEGORY/HSL', 'HSL')]),
  label('access-root', 'ACCESS_ROOT', 'ACCESS', 'Åtkomst', [label('access-lex', 'ACCESS', 'ACCESS/LEX', 'LEX')]),
];

describe('resolveInvestigationLocationTarget', () => {
  it('resolves a leaf place to its whole chain below the structure root and its AccessMapper location', () => {
    const target = resolveInvestigationLocationTarget(structure, 'south-blue');

    expect(target).toEqual({
      labelId: 'south-blue',
      displayName: 'Blå',
      chainIds: ['south', 'south-unit', 'south-blue'],
      rootId: 'location-root',
      location: { resourcePath: 'LOCATION/SOUTH/SOUTH_UNIT/BLUE', displayName: 'Blå' },
    });
  });

  it('refuses a level with sub-places, an unknown id and the structure root itself', () => {
    expect(() => resolveInvestigationLocationTarget(structure, 'south-unit')).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => resolveInvestigationLocationTarget(structure, 'nowhere')).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => resolveInvestigationLocationTarget(structure, 'location-root')).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('refuses a leaf whose path has no location level, so an errand is never moved outside the place structure', () => {
    expect(() => resolveInvestigationLocationTarget(structure, 'category-hsl')).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining('not a place') }),
    );
  });
});

describe('buildInvestigationLocationLabelUpdate', () => {
  const target = resolveInvestigationLocationTarget(structure, 'south-blue');

  it('replaces the whole location chain and keeps every other label, including the LEX access label', () => {
    const labels = buildInvestigationLocationLabelUpdate({
      currentLabels: [{ id: 'category-hsl' }, { id: 'north' }, { id: 'north-unit' }, { id: 'north-blue' }, { id: 'access-lex' }],
      labelStructure: structure,
      target,
    });

    expect(labels).toEqual([{ id: 'category-hsl' }, { id: 'access-lex' }, { id: 'south' }, { id: 'south-unit' }, { id: 'south-blue' }]);
  });

  it('keeps the structure root as it was carried, since it is the structure rather than a place', () => {
    const labels = buildInvestigationLocationLabelUpdate({
      currentLabels: [{ id: 'location-root' }, { id: 'north' }, { id: 'north-unit' }, { id: 'north-blue' }],
      labelStructure: structure,
      target,
    });

    expect(labels).toEqual([{ id: 'location-root' }, { id: 'south' }, { id: 'south-unit' }, { id: 'south-blue' }]);
  });

  it('adds the chain to an errand that arrived without any place', () => {
    const labels = buildInvestigationLocationLabelUpdate({ currentLabels: [{ id: 'category-hsl' }], labelStructure: structure, target });

    expect(labels).toEqual([{ id: 'category-hsl' }, { id: 'south' }, { id: 'south-unit' }, { id: 'south-blue' }]);
  });

  it('answers undefined when the errand already is at the target, so no version is spent', () => {
    expect(
      buildInvestigationLocationLabelUpdate({
        currentLabels: [{ id: 'south' }, { id: 'category-hsl' }, { id: 'south-unit' }, { id: 'south-blue' }],
        labelStructure: structure,
        target,
      }),
    ).toBeUndefined();
  });

  it('names an errand label without id through the metadata rather than dropping it', () => {
    const labels = buildInvestigationLocationLabelUpdate({
      currentLabels: [{ resourcePath: 'category/hsl' } as Label, { id: 'north-blue' }],
      labelStructure: structure,
      target,
    });

    expect(labels).toEqual([{ id: 'category-hsl' }, { id: 'south' }, { id: 'south-unit' }, { id: 'south-blue' }]);
    expect(() =>
      buildInvestigationLocationLabelUpdate({ currentLabels: [{ resourcePath: 'UNKNOWN/PATH' } as Label], labelStructure: structure, target }),
    ).toThrow(expect.objectContaining({ status: 502 }));
  });

  it('leaves the errand where return-to-manager will find it', () => {
    const labels = buildInvestigationLocationLabelUpdate({
      currentLabels: [{ id: 'north' }, { id: 'north-unit' }, { id: 'north-blue' }],
      labelStructure: structure,
      target,
    });

    expect(resolveErrandLocation(labels, structure)).toEqual({ resourcePath: 'LOCATION/SOUTH/SOUTH_UNIT/BLUE', displayName: 'Blå' });
  });
});

describe('empty label roots', () => {
  it('takes the access root off together with the last access label beneath it', () => {
    const labels = buildInvestigationHandoverLabelUpdate({
      currentLabels: [{ id: 'access-root' }, { id: 'access-lex' }, { id: 'category-root' }, { id: 'category-hsl' }],
      labelStructure: structure,
      addResourcePaths: [],
      removeResourcePaths: ['ACCESS/LEX'],
    });

    expect(labels).toEqual([{ id: 'category-root' }, { id: 'category-hsl' }]);
  });

  it('keeps a root while anything beneath it is carried, and a top-level label without children', () => {
    const standalone = label('standalone', 'STANDALONE', 'STANDALONE', 'Fristående');

    expect(withoutEmptyLabelRoots(['category-root', 'category-hsl', 'standalone'], [...structure, standalone])).toEqual([
      'category-root',
      'category-hsl',
      'standalone',
    ]);
  });

  it('drops every root with nothing beneath it, not only the one a step touched', () => {
    expect(withoutEmptyLabelRoots(['location-root', 'access-root', 'category-root', 'category-hsl'], structure)).toEqual([
      'category-root',
      'category-hsl',
    ]);
  });

  it('keeps the structure root through a move, since the new place sits beneath it', () => {
    const labels = buildInvestigationLocationLabelUpdate({
      currentLabels: [{ id: 'location-root' }, { id: 'north' }, { id: 'north-unit' }, { id: 'north-blue' }, { id: 'access-root' }],
      labelStructure: structure,
      target: resolveInvestigationLocationTarget(structure, 'south-blue'),
    });

    expect(labels).toEqual([{ id: 'location-root' }, { id: 'south' }, { id: 'south-unit' }, { id: 'south-blue' }]);
  });
});
