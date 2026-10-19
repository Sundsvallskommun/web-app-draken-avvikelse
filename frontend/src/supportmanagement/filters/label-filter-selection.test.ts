import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import { projectLabelFilterGroups } from './label-filter-projector';
import {
  getVisibleLabelFilterChoices,
  normalizeLabelFilterSelections,
  reduceLabelFilterSelection,
} from './label-filter-selection';

const label = (classification: string, resourcePath: string, displayName: string, labels: Label[] = []): Label => ({
  classification,
  displayName,
  resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
  resourcePath,
  labels,
});

const metadata = [
  label('CATEGORY_ROOT', 'CATEGORY', 'Kategori', [
    label('PROVISION_CATEGORY', 'CATEGORY/HSL', 'HSL', [
      label('CATEGORY', 'CATEGORY/HSL/FIRST', 'Första grenen', [
        label('TYPE', 'CATEGORY/HSL/FIRST/GENERAL', 'Samma namn', [
          label('SUBTYPE', 'CATEGORY/HSL/FIRST/GENERAL/DETAIL', 'Detalj A'),
        ]),
      ]),
    ]),
    label('PROVISION_CATEGORY', 'CATEGORY/SOL', 'SoL', [
      label('CATEGORY', 'CATEGORY/SOL/SECOND', 'Andra grenen', [
        label('TYPE', 'CATEGORY/SOL/SECOND/GENERAL', 'Samma namn', [
          label('SUBTYPE', 'CATEGORY/SOL/SECOND/GENERAL/DETAIL', 'Detalj B'),
        ]),
      ]),
    ]),
  ]),
  label('REPORT_TYPE_ROOT', 'REPORT_TYPE', 'Rapporttyp', [label('REPORT_TYPE', 'REPORT_TYPE/DEVIATION', 'Avvikelse')]),
];

const projections = projectLabelFilterGroups(
  [
    {
      key: 'classification',
      label: 'Klassificering',
      rootResourcePath: 'CATEGORY',
      fields: [
        { key: 'category', label: 'Kategori', classification: 'CATEGORY' },
        { key: 'type', label: 'Typ', classification: 'TYPE' },
        { key: 'subtype', label: 'Undertyp', classification: 'SUBTYPE' },
      ],
    },
    {
      key: 'report',
      label: 'Rapport',
      rootResourcePath: 'REPORT_TYPE',
      fields: [{ key: 'reportType', label: 'Rapporttyp', classification: 'REPORT-TYPE' }],
    },
  ],
  metadata
);

const selection = (groupKey: string, fieldKey: string, resourcePath: string) => ({ groupKey, fieldKey, resourcePath });

const categoryA = selection('classification', 'category', 'CATEGORY/HSL/FIRST');
const categoryB = selection('classification', 'category', 'CATEGORY/SOL/SECOND');
const typeA = selection('classification', 'type', 'CATEGORY/HSL/FIRST/GENERAL');
const typeB = selection('classification', 'type', 'CATEGORY/SOL/SECOND/GENERAL');
const subtypeA = selection('classification', 'subtype', 'CATEGORY/HSL/FIRST/GENERAL/DETAIL');
const report = selection('report', 'reportType', 'REPORT_TYPE/DEVIATION');

test('limits descendant choices only by selected ancestors in the same group', () => {
  assert.deepEqual(
    getVisibleLabelFilterChoices(projections, 'classification', 'type', []).map(({ resourcePath }) => resourcePath),
    [typeA.resourcePath, typeB.resourcePath]
  );
  assert.deepEqual(
    getVisibleLabelFilterChoices(projections, 'classification', 'type', [categoryA, report]).map(
      ({ resourcePath }) => resourcePath
    ),
    [typeA.resourcePath]
  );
  assert.deepEqual(
    getVisibleLabelFilterChoices(projections, 'classification', 'type', [categoryA, categoryB]).map(
      ({ resourcePath }) => resourcePath
    ),
    [typeA.resourcePath, typeB.resourcePath]
  );
});

test('removing a parent cascades through its selected descendants but preserves sibling branches and groups', () => {
  const next = reduceLabelFilterSelection(
    projections,
    [categoryA, categoryB, typeA, typeB, subtypeA, report],
    categoryA,
    false
  );

  assert.deepEqual(next, [categoryB, typeB, report]);
});

test('removing an intermediate choice also removes its descendants', () => {
  assert.deepEqual(reduceLabelFilterSelection(projections, [categoryA, typeA, subtypeA], typeA, false), [categoryA]);
});

test('adding a parent prunes previously selected descendants from an incompatible branch', () => {
  assert.deepEqual(reduceLabelFilterSelection(projections, [typeB], categoryA, true), [categoryA]);
});

test('keeps equal display names as distinct selections and returns canonical projection order', () => {
  const selectedB = reduceLabelFilterSelection(projections, [], typeB, true);
  const selectedBoth = reduceLabelFilterSelection(projections, selectedB, typeA, true);

  assert.deepEqual(selectedBoth, [typeA, typeB]);
});

test('normalization removes stale and duplicate identities without using display names', () => {
  assert.deepEqual(
    normalizeLabelFilterSelections(projections, [
      typeB,
      typeA,
      typeB,
      selection('classification', 'type', 'CATEGORY/REMOVED'),
    ]),
    [typeA, typeB]
  );
});
