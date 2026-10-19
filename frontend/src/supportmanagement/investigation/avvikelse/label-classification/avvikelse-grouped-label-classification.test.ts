import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import {
  applyAvvikelseGroupedClassificationSelection,
  createAvvikelseGroupedClassificationModel,
  getAvvikelseGroupedClassificationSelection,
  getChosenAvvikelseClassificationGroups,
  getMissingAvvikelseGroupedClassificationChoices,
  getPersistedAvvikelseGroupedClassificationState,
} from './avvikelse-supportmanagement-label-classification';

const labelTree = {
  root: { resource: 'CATEGORY', classification: 'CATEGORY_ROOT' },
  ownerClassification: 'PROVISION_CATEGORY',
  categoryClassification: 'CATEGORY',
  typeClassification: 'TYPE',
};

const legalBaseRules = [
  { legalBase: 'HSL', allowedClassificationCategories: ['CATEGORY/HSL'] },
  { legalBase: 'SOL', allowedClassificationCategories: ['CATEGORY/SOL_LSS'] },
  { legalBase: 'LSS', allowedClassificationCategories: ['CATEGORY/SOL_LSS'] },
];

const groups = [
  { key: 'HSL', legalBases: [{ legalBase: 'HSL', label: 'HSL' }] },
  {
    key: 'SOL_LSS',
    legalBases: [
      { legalBase: 'SOL', label: 'SoL' },
      { legalBase: 'LSS', label: 'LSS' },
    ],
  },
];
const priority = ['SOL_LSS', 'HSL'];

const label = (classification: string, resourcePath: string, labels: Label[] = []): Label => {
  const resourceName = resourcePath.split('/').at(-1) ?? resourcePath;
  return { id: `${resourcePath}-id`, classification, displayName: resourceName, resourceName, resourcePath, labels };
};

const rehabType = label('TYPE', 'CATEGORY/HSL/REHAB/MISSED');
const rehab = label('CATEGORY', 'CATEGORY/HSL/REHAB', [rehabType]);
const hslOwner = label('PROVISION_CATEGORY', 'CATEGORY/HSL', [rehab]);
const legalCertaintyType = label('TYPE', 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY/DOCUMENTATION_MISSING');
const legalCertainty = label('CATEGORY', 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY', [legalCertaintyType]);
const socialOwner = label('PROVISION_CATEGORY', 'CATEGORY/SOL_LSS', [legalCertainty]);
const labelStructure: Label[] = [label('CATEGORY_ROOT', 'CATEGORY', [hslOwner, socialOwner])];

const reportType: Label = {
  id: 'report-type-id',
  classification: 'REPORT_TYPE',
  resourceName: 'DEVIATION',
  resourcePath: 'REPORT_TYPE/DEVIATION',
};
const withoutChildren = ({ labels: _labels, ...rest }: Label): Label => rest;

const model = (legalBases: string[]) =>
  createAvvikelseGroupedClassificationModel(labelStructure, labelTree, legalBases, legalBaseRules, groups, priority);

test('offers one selector per group the chosen legal bases reach, SoL and LSS sharing one', () => {
  assert.deepEqual(
    model(['HSL', 'SOL']).groups.map(({ group }) => group.key),
    ['HSL', 'SOL_LSS']
  );
  assert.deepEqual(
    model(['LSS', 'SOL']).groups.map(({ group }) => group.key),
    ['SOL_LSS']
  );
  assert.deepEqual(model([]).groups, []);
});

test('the chosen groups keep the configured order and name only the legal bases chosen in them', () => {
  assert.deepEqual(
    getChosenAvvikelseClassificationGroups([' lss ', 'HSL', 'UNKNOWN'], groups).map(({ group, label, legalBases }) => ({
      key: group.key,
      label,
      legalBases,
    })),
    [
      { key: 'HSL', label: 'HSL', legalBases: ['HSL'] },
      { key: 'SOL_LSS', label: 'LSS', legalBases: ['LSS'] },
    ]
  );
  assert.deepEqual(getChosenAvvikelseClassificationGroups(['UNKNOWN'], groups), []);
});

test('heads the SoL/LSS selector by the legal bases chosen in it', () => {
  const socialLabel = (legalBases: string[]) =>
    model(legalBases).groups.find(({ group }) => group.key === 'SOL_LSS')?.label;
  assert.equal(socialLabel(['SOL']), 'SoL');
  assert.equal(socialLabel(['LSS']), 'LSS');
  assert.equal(socialLabel(['LSS', 'SOL']), 'SoL/LSS');
  assert.equal(model(['HSL', 'SOL']).groups[0].label, 'HSL');
});

test('each selector offers only the categories of its own group', () => {
  const [hsl, social] = model(['HSL', 'SOL']).groups;
  assert.deepEqual(
    hsl.model.catalog.types.map(({ code }) => code),
    ['CATEGORY/HSL/REHAB']
  );
  assert.deepEqual(
    social.model.catalog.types.map(({ code }) => code),
    ['CATEGORY/SOL_LSS/LEGAL_CERTAINTY']
  );
});

test('keeps both chosen paths as labels and gives the errand classification to the SoL/LSS one', () => {
  const update = applyAvvikelseGroupedClassificationSelection(model(['HSL', 'SOL']), [reportType], {
    HSL: { typeCode: rehab.resourcePath, subtypeCode: rehabType.resourcePath },
    SOL_LSS: { typeCode: legalCertainty.resourcePath, subtypeCode: legalCertaintyType.resourcePath },
  });

  assert.deepEqual(
    update.labels.map(({ resourcePath }) => resourcePath),
    [
      'REPORT_TYPE/DEVIATION',
      'CATEGORY/HSL',
      'CATEGORY/HSL/REHAB',
      'CATEGORY/HSL/REHAB/MISSED',
      'CATEGORY/SOL_LSS',
      'CATEGORY/SOL_LSS/LEGAL_CERTAINTY',
      'CATEGORY/SOL_LSS/LEGAL_CERTAINTY/DOCUMENTATION_MISSING',
    ]
  );
  assert.deepEqual(
    update.classifications.map(({ groupKey, category, type }) => [groupKey, category, type]),
    [
      ['HSL', 'CATEGORY/HSL', 'CATEGORY/HSL/REHAB'],
      ['SOL_LSS', 'CATEGORY/SOL_LSS', 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY'],
    ]
  );
  assert.equal(update.errandClassification?.groupKey, 'SOL_LSS');
});

test('reads each group back from the labels, and a group the legal bases no longer reach loses its path', () => {
  const labels = [hslOwner, rehab, rehabType, socialOwner, legalCertainty, legalCertaintyType].map(withoutChildren);
  assert.deepEqual(getAvvikelseGroupedClassificationSelection(model(['HSL', 'SOL']), labels), {
    HSL: { typeCode: rehab.resourcePath, subtypeCode: rehabType.resourcePath },
    SOL_LSS: { typeCode: legalCertainty.resourcePath, subtypeCode: legalCertaintyType.resourcePath },
  });

  const onlySocial = model(['SOL']);
  const update = applyAvvikelseGroupedClassificationSelection(
    onlySocial,
    labels,
    getAvvikelseGroupedClassificationSelection(onlySocial, labels)
  );
  assert.equal(update.labelsChanged, true);
  assert.deepEqual(
    update.labels.map(({ resourcePath }) => resourcePath),
    ['CATEGORY/SOL_LSS', 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY', 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY/DOCUMENTATION_MISSING']
  );
  assert.equal(update.errandClassification?.groupKey, 'SOL_LSS');
});

test('names the first choice each incomplete group still needs', () => {
  assert.deepEqual(
    getMissingAvvikelseGroupedClassificationChoices(model(['HSL', 'SOL']), {
      HSL: { typeCode: rehab.resourcePath },
    }),
    [
      { groupKey: 'HSL', missing: 'subtype' },
      { groupKey: 'SOL_LSS', missing: 'type' },
    ]
  );
});

test('a saved classification is valid only when every group the legal bases reach is complete', () => {
  const persisted = (labels: Label[]) => ({
    labels: labels.map(withoutChildren),
    category: 'CATEGORY/SOL_LSS',
    type: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY',
    subType: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY/DOCUMENTATION_MISSING',
  });
  const state = (legalBases: string[], labels: Label[]) =>
    getPersistedAvvikelseGroupedClassificationState(
      labelStructure,
      labelTree,
      legalBases,
      persisted(labels),
      legalBaseRules,
      groups,
      priority
    );
  const both = [hslOwner, rehab, rehabType, socialOwner, legalCertainty, legalCertaintyType];
  const social = [socialOwner, legalCertainty, legalCertaintyType];

  assert.equal(state(['HSL', 'SOL'], both), 'known-valid');
  assert.equal(state(['SOL'], social), 'known-valid');
  assert.equal(state(['HSL', 'SOL'], social), 'missing-classification');
  assert.equal(state(['SOL'], both), 'known-disallowed-legal-base');
  assert.equal(state(['HSL', 'SOL'], [hslOwner, rehab, ...social]), 'known-missing-required-type');
});

// Metadata can retire an undercategory an errand was classified under. The group keeps it, as a single
// classification always has, rather than blocking every save until someone reclassifies the errand.
test('a group classified under a retired undercategory is kept rather than blocked', () => {
  const retiredType: Label = {
    id: 'retired-type-id',
    classification: 'TYPE',
    resourceName: 'RETIRED',
    resourcePath: 'CATEGORY/HSL/REHAB/RETIRED',
  };
  assert.equal(
    getPersistedAvvikelseGroupedClassificationState(
      labelStructure,
      labelTree,
      ['HSL', 'SOL'],
      {
        labels: [hslOwner, rehab, retiredType, socialOwner, legalCertainty, legalCertaintyType].map(withoutChildren),
        category: 'CATEGORY/SOL_LSS',
        type: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY',
        subType: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY/DOCUMENTATION_MISSING',
      },
      legalBaseRules,
      groups,
      priority
    ),
    'known-valid'
  );
});
