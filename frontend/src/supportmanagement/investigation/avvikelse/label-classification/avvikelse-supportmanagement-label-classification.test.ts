import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import {
  applyAvvikelseLabelClassificationSelection,
  createAvvikelseLabelClassificationModel,
  getPersistedAvvikelseLabelClassificationState,
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

const category = (owner: string, code: string): Label => ({
  id: `${code}-id`,
  classification: 'CATEGORY',
  displayName: code,
  resourceName: code,
  resourcePath: `CATEGORY/${owner}/${code}`,
  labels: [],
});

const owner = (code: string, categories: Label[]): Label => ({
  id: `${code}-owner-id`,
  classification: 'PROVISION_CATEGORY',
  displayName: code,
  resourceName: code,
  resourcePath: `CATEGORY/${code}`,
  labels: categories,
});

const labelStructure = [
  {
    id: 'category-root-id',
    classification: 'CATEGORY_ROOT',
    displayName: 'Category',
    resourceName: 'CATEGORY',
    resourcePath: 'CATEGORY',
    labels: [owner('HSL', [category('HSL', 'CURRENT_HSL')]), owner('SOL_LSS', [category('SOL_LSS', 'CURRENT_SOL')])],
  },
];

const legacyHslClassification = {
  category: 'CATEGORY/HSL',
  type: 'CATEGORY/HSL/REMOVED_CATEGORY',
  subType: '',
};

test('blocks a legacy unknown category when current legal bases exclude its known owner', () => {
  assert.equal(
    getPersistedAvvikelseLabelClassificationState(
      labelStructure,
      labelTree,
      ['SOL'],
      legacyHslClassification,
      legalBaseRules
    ),
    'known-disallowed-legal-base'
  );

  assert.equal(
    getPersistedAvvikelseLabelClassificationState(
      labelStructure,
      labelTree,
      ['SOL'],
      {
        ...legacyHslClassification,
        category: 'HSL',
      },
      legalBaseRules
    ),
    'known-disallowed-legal-base'
  );
});

test('preserves a legacy unknown category while its known owner remains allowed', () => {
  assert.equal(
    getPersistedAvvikelseLabelClassificationState(
      labelStructure,
      labelTree,
      ['HSL'],
      legacyHslClassification,
      legalBaseRules
    ),
    'legacy-unknown'
  );
});

test('blocks changing the persisted owner while an unknown type still identifies its original owner', () => {
  assert.equal(
    getPersistedAvvikelseLabelClassificationState(
      labelStructure,
      labelTree,
      ['SOL'],
      {
        ...legacyHslClassification,
        category: 'CATEGORY/SOL_LSS',
      },
      legalBaseRules
    ),
    'known-inconsistent'
  );
});

test('keeps the metadata-unavailable compatibility path for legacy classifications', () => {
  assert.equal(
    getPersistedAvvikelseLabelClassificationState(
      undefined,
      labelTree,
      ['SOL'],
      legacyHslClassification,
      legalBaseRules
    ),
    'legacy-unknown'
  );
});

test('derives allowed metadata owners from policy rules rather than known legal-base names', () => {
  const futureRules = [{ legalBase: 'FUTURE-ACT', allowedClassificationCategories: ['CATEGORY/HSL'] }];
  const model = createAvvikelseLabelClassificationModel(labelStructure, labelTree, ['future-act'], futureRules);

  assert.deepEqual(
    model.bindings.map(({ owner: bindingOwner }) => bindingOwner?.resourcePath),
    ['CATEGORY/HSL']
  );
});

test('projects a future application custom root and vocabulary with the strategy persistence invariant', () => {
  const futureTree = {
    root: { resource: 'INCIDENTS', classification: 'INCIDENT_ROOT' },
    ownerClassification: 'ACT_BRANCH',
    categoryClassification: 'INCIDENT_CLASS',
    typeClassification: 'INCIDENT_DETAIL',
  };
  const futureStructure = [
    {
      id: 'future-root',
      classification: 'INCIDENT_ROOT',
      resourcePath: 'INCIDENTS',
      resourceName: 'INCIDENTS',
      labels: [
        {
          id: 'future-owner',
          classification: 'ACT_BRANCH',
          resourcePath: 'INCIDENTS/FUTURE_ACT',
          resourceName: 'FUTURE_ACT',
          labels: [
            {
              id: 'future-category',
              classification: 'INCIDENT_CLASS',
              resourcePath: 'INCIDENTS/FUTURE_ACT/SAFETY',
              resourceName: 'SAFETY',
              labels: [
                {
                  id: 'future-type',
                  classification: 'INCIDENT_DETAIL',
                  resourcePath: 'INCIDENTS/FUTURE_ACT/SAFETY/FALL',
                  resourceName: 'FALL',
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  const model = createAvvikelseLabelClassificationModel(futureStructure, futureTree);
  const update = applyAvvikelseLabelClassificationSelection(model, [], {
    typeCode: 'INCIDENTS/FUTURE_ACT/SAFETY',
    subtypeCode: 'INCIDENTS/FUTURE_ACT/SAFETY/FALL',
  });

  assert.deepEqual(
    model.bindings.map(({ owner: bindingOwner, category: bindingCategory, types }) => ({
      owner: bindingOwner?.resourcePath,
      category: bindingCategory.resourcePath,
      types: types.map(({ resourcePath }) => resourcePath),
    })),
    [
      {
        owner: 'INCIDENTS/FUTURE_ACT',
        category: 'INCIDENTS/FUTURE_ACT/SAFETY',
        types: ['INCIDENTS/FUTURE_ACT/SAFETY/FALL'],
      },
    ]
  );
  assert.deepEqual(
    { category: update.category, type: update.type, subType: update.subType },
    {
      category: 'INCIDENTS/FUTURE_ACT',
      type: 'INCIDENTS/FUTURE_ACT/SAFETY',
      subType: 'INCIDENTS/FUTURE_ACT/SAFETY/FALL',
    }
  );
});

test('fails closed when the configured classification root is missing or duplicated', () => {
  assert.throws(
    () => createAvvikelseLabelClassificationModel([], labelTree),
    /expected one configured root CATEGORY\/CATEGORY_ROOT, found 0/u
  );
  assert.throws(
    () =>
      createAvvikelseLabelClassificationModel(
        [
          labelStructure[0],
          {
            id: 'second-root',
            classification: 'CATEGORY_ROOT',
            resourceName: 'CATEGORY',
            resourcePath: 'CATEGORY',
            labels: [],
          },
        ],
        labelTree
      ),
    /expected one configured root CATEGORY\/CATEGORY_ROOT, found 2/u
  );
  for (const nearMiss of [
    [
      {
        id: 'wrong-resource',
        classification: 'CATEGORY_ROOT',
        resourcePath: 'OTHER',
        resourceName: 'CATEGORY',
        labels: [],
      },
    ],
    [
      {
        id: 'wrong-classification',
        classification: 'OTHER_ROOT',
        resourceName: 'CATEGORY',
        resourcePath: 'CATEGORY',
        labels: [],
      },
    ],
  ]) {
    assert.throws(
      () => createAvvikelseLabelClassificationModel(nearMiss, labelTree),
      /expected one configured root CATEGORY\/CATEGORY_ROOT, found 0/u
    );
  }
});
