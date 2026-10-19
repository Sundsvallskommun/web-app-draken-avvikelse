import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { describe, expect, test } from 'vitest';

import {
  getClassificationDisplayName,
  getLabelsAtDepth,
  getSelectableGroupedLabels,
  getSelectableTypesForCategory,
  sortLabelsByDisplayName,
} from './support-label-service';

const label = (id: string, classification: string, labels: Label[] = [], deprecated = false): Label => ({
  id,
  classification,
  resourceName: id,
  resourcePath: id,
  displayName: id,
  labels,
  ...(deprecated && { deprecated }),
});

const subType = (id: string, deprecated = false) => label(id, 'SUBTYPE', [], deprecated);
const type = (id: string, children: Label[] = [], deprecated = false) => label(id, 'TYPE', children, deprecated);
const category = (id: string, types: Label[] = [], deprecated = false) => label(id, 'CATEGORY', types, deprecated);
const department = (id: string, categories: Label[] = [], deprecated = false) =>
  label(id, 'DEPARTMENT', categories, deprecated);

const ids = (labels: Label[] | undefined) => (labels ?? []).map((l) => l.id);

// KS: DEPARTMENT > CATEGORY > TYPE. LOP: CATEGORY > TYPE > SUBTYPE.
const ksTree = () => [
  department('KSK', [category('SERVICE', [type('S1'), type('S2')]), category('LEAF', [])]),
  department('BOU', [category('SCHOOL', [type('B1')])]),
  department('EMPTY', []),
];
const lopTree = () => [
  category('SALARY', [type('PAYSLIP', [subType('MISSING'), subType('WRONG')]), type('OTHER')]),
  category('PENSION', [type('GENERAL')]),
];

describe('getSelectableGroupedLabels', () => {
  test('keeps parents, their children and grandchildren that can be picked', () => {
    const result = getSelectableGroupedLabels(ksTree());

    expect(ids(result)).toEqual(['KSK', 'BOU', 'EMPTY']);
    expect(ids(result[0].labels)).toEqual(['SERVICE', 'LEAF']);
    expect(ids(result[0].labels?.[0].labels)).toEqual(['S1', 'S2']);
  });

  test('drops deprecated parents and children, leaving the levels below to the next combobox', () => {
    const tree = [
      department('OLD', [category('A', [type('A1')])], true),
      department('KSK', [
        category('GONE', [type('G1')], true),
        category('SERVICE', [type('S1'), type('S2', [], true)]),
      ]),
    ];

    const result = getSelectableGroupedLabels(tree);

    expect(ids(result)).toEqual(['KSK']);
    expect(ids(result[0].labels)).toEqual(['SERVICE']);
    expect(ids(result[0].labels?.[0].labels)).toEqual(['S1', 'S2']);
    expect(ids(getSelectableTypesForCategory(result[0].labels?.[0]))).toEqual(['S1']);
  });

  test('keeps childless parents as leaves and drops parents whose children are all deprecated', () => {
    const tree = [
      department('EMPTY', []),
      department('LEAF_ONLY', [category('NO_TYPES', [])]),
      department('ALL_DEPRECATED', [category('C', [type('T')], true)]),
      department('KSK', [category('SERVICE', [type('S1')])]),
    ];

    const result = getSelectableGroupedLabels(tree);

    expect(ids(result)).toEqual(['EMPTY', 'LEAF_ONLY', 'KSK']);
    expect(ids(result[0].labels)).toEqual([]);
    expect(ids(result[1].labels)).toEqual(['NO_TYPES']);
  });

  test('keeps the labels already set on the errand even when deprecated', () => {
    const tree = [
      department('OLD', [category('A', [type('A1'), type('A2')])], true),
      department('KSK', [category('GONE', [type('G1')], true), category('SERVICE', [type('S1')])]),
    ];

    const result = getSelectableGroupedLabels(tree, ['OLD', 'A', 'A1']);

    expect(ids(result)).toEqual(['OLD', 'KSK']);
    expect(ids(result[0].labels)).toEqual(['A']);
    expect(ids(result[1].labels)).toEqual(['SERVICE']);
  });

  test('only keeps the errand labels below a deprecated level above the parents', () => {
    const tree = department('OLD', [category('A', [type('A1'), type('A2')]), category('B', [type('B1')])], true);

    expect(ids(getSelectableTypesForCategory(tree.labels?.[0], ['A1']))).toEqual(['A1', 'A2']);
    const result = getSelectableGroupedLabels(tree.labels, ['A', 'A1'], true);
    expect(ids(result)).toEqual(['A']);
    expect(ids(result[0].labels)).toEqual(['A1']);
  });

  test('is what getSelectableTypesForCategory applies one level down', () => {
    const salary = lopTree()[0];

    const types = getSelectableTypesForCategory(salary);

    expect(ids(types)).toEqual(['PAYSLIP', 'OTHER']);
    expect(ids(types[0].labels)).toEqual(['MISSING', 'WRONG']);
    expect(ids(types[1].labels)).toEqual([]);
  });

  test('does not mutate the metadata', () => {
    const tree = [department('KSK', [category('SERVICE', [type('S1', [], true)])])];
    getSelectableGroupedLabels(tree);
    expect(ids(tree[0].labels?.[0].labels)).toEqual(['S1']);
  });
});

describe('getLabelsAtDepth and getClassificationDisplayName', () => {
  test('flattens the labels at a depth across the whole structure', () => {
    const tree = ksTree();
    expect(ids(getLabelsAtDepth(tree, 1))).toEqual(['KSK', 'BOU', 'EMPTY']);
    expect(ids(getLabelsAtDepth(tree, 2))).toEqual(['SERVICE', 'LEAF', 'SCHOOL']);
    expect(ids(getLabelsAtDepth(tree, 3))).toEqual(['S1', 'S2', 'B1']);
    expect(getLabelsAtDepth(tree, 4)).toEqual([]);
    expect(getLabelsAtDepth(undefined, 1)).toEqual([]);
  });

  test('uses the first classificationDisplayName found, otherwise the fallback', () => {
    const named = [type('T1'), { ...type('T2'), classificationDisplayName: 'Ärendetyp' }];
    expect(getClassificationDisplayName(named, 'Typ')).toBe('Ärendetyp');
    expect(getClassificationDisplayName([type('T1')], 'Typ')).toBe('Typ');
    expect(getClassificationDisplayName([], 'Typ')).toBe('Typ');
  });
});

describe('sortLabelsByDisplayName', () => {
  test('sorts a copy by display name', () => {
    const labels = [label('b', 'TYPE'), label('a', 'TYPE'), { ...label('c', 'TYPE'), displayName: undefined }];
    const sorted = sortLabelsByDisplayName(labels);
    expect(sorted.map((l) => l.id)).toEqual(['c', 'a', 'b']);
    expect(labels.map((l) => l.id)).toEqual(['b', 'a', 'c']);
  });
});
