import { expect, test, vi } from 'vitest';

import {
  investigationClassificationWriteBlock,
  prepareInvestigationClassification,
} from './support-investigation-save-workflow';

// The classification is what a finished investigation is filed under, so its rules are asserted on
// the completed document; the draft cases have their own tests at the end.
const input = () => ({
  required: true,
  completed: true,
  canEditClassification: false,
  dirty: false,
  labelTree: {
    root: { resource: 'CATEGORY', classification: 'CATEGORY_ROOT' },
    ownerClassification: 'PROVISION_CATEGORY',
    categoryClassification: 'CATEGORY',
    typeClassification: 'TYPE',
  },
  labelStructure: [
    {
      classification: 'CATEGORY_ROOT',
      resourceName: 'CATEGORY',
      resourcePath: 'CATEGORY',
      labels: [
        {
          classification: 'PROVISION_CATEGORY',
          resourceName: 'SOL_LSS',
          resourcePath: 'CATEGORY/SOL_LSS',
          labels: [
            {
              classification: 'CATEGORY',
              resourceName: 'CURRENT',
              resourcePath: 'CATEGORY/SOL_LSS/CURRENT',
              labels: [],
            },
          ],
        },
      ],
    },
  ],
  legalBases: ['SOL'],
  legalBaseRules: [
    { legalBase: 'SOL', allowedClassificationCategories: ['CATEGORY/SOL_LSS'] },
    { legalBase: 'HSL', allowedClassificationCategories: ['CATEGORY/HSL'] },
  ],
  classificationGroups: [
    { key: 'HSL', legalBases: [{ legalBase: 'HSL', label: 'HSL' }] },
    {
      key: 'SOL_LSS',
      legalBases: [
        { legalBase: 'SOL', label: 'SoL' },
        { legalBase: 'LSS', label: 'LSS' },
      ],
    },
  ],
  errandClassificationGroupPriority: ['SOL_LSS', 'HSL'],
  persistedClassification: {
    labels: [],
    category: 'CATEGORY/SOL_LSS',
    type: 'CATEGORY/SOL_LSS/CURRENT',
    subType: '',
    classificationHasSubTypes: false,
  },
  triggerValidation: vi.fn(async () => true),
  getDraft: vi.fn(() => ({
    labels: [],
    category: 'CATEGORY/SOL_LSS',
    type: 'CATEGORY/SOL_LSS/CURRENT',
    subType: '',
    classificationHasSubTypes: false,
  })),
});

test('a document editor can save without changing a valid existing classification', async () => {
  const request = input();
  expect(investigationClassificationWriteBlock(request)).toBeUndefined();
  expect(await prepareInvestigationClassification(request)).toBeUndefined();
  expect(request.getDraft).not.toHaveBeenCalled();
});

test('a legal-base change requiring a forbidden reclassification is blocked before editing and at save', async () => {
  const request = { ...input(), legalBases: ['HSL'] };
  expect(investigationClassificationWriteBlock(request)).toContain('saknar behörighet');
  await expect(prepareInvestigationClassification(request)).rejects.toThrow('saknar behörighet');
});

test('missing classification is explained without asking the editor to fix a disabled control', async () => {
  const request = input();
  request.persistedClassification.type = '';
  await expect(prepareInvestigationClassification(request)).rejects.toThrow('behörig handläggare');
  expect(request.triggerValidation).not.toHaveBeenCalled();
});

test('classification drafts cannot be saved after the classification permission is revoked', async () => {
  const request = { ...input(), dirty: true };
  await expect(prepareInvestigationClassification(request)).rejects.toThrow('ändrad kategorisering');
});

// A deviation under both HSL and SoL is classified in each group, so the SoL/LSS classification alone
// no longer covers it once HSL is chosen as well.
test('choosing a second legal base group asks for its classification before saving', async () => {
  const request = { ...input(), canEditClassification: true, legalBases: ['SOL', 'HSL'] };
  await expect(prepareInvestigationClassification(request)).rejects.toThrow('för varje valt lagrum');
  expect(request.triggerValidation).toHaveBeenCalled();
});

test('documents which do not own classification do not require classification permission', async () => {
  expect(await prepareInvestigationClassification({ ...input(), required: false, dirty: true })).toBeUndefined();
});

// A draft is saved as it stands. Demanding the errand's classification on every save is what made a
// half-written investigation impossible to put down, which is the same reason the schema asks
// nothing of one.
test('a draft saves although the errand has no classification yet', async () => {
  const request = { ...input(), completed: false };
  request.persistedClassification.category = '';
  request.persistedClassification.type = '';

  expect(investigationClassificationWriteBlock(request)).toBeUndefined();
  expect(await prepareInvestigationClassification(request)).toBeUndefined();
  expect(request.triggerValidation).not.toHaveBeenCalled();
});

test('a draft saves although the existing classification does not match the chosen legal bases', async () => {
  const request = { ...input(), completed: false, legalBases: ['HSL'] };

  expect(investigationClassificationWriteBlock(request)).toBeUndefined();
  expect(await prepareInvestigationClassification(request)).toBeUndefined();
});

// What the handler changed is written, so it still has to be valid - a draft is not a licence to
// store a classification nobody could have chosen.
test('a classification the handler edited is validated even in a draft', async () => {
  const request = {
    ...input(),
    completed: false,
    canEditClassification: true,
    dirty: true,
    legalBases: ['SOL', 'HSL'],
    triggerValidation: vi.fn(async () => false),
  };

  await expect(prepareInvestigationClassification(request)).rejects.toThrow('för varje valt lagrum');
  expect(request.triggerValidation).toHaveBeenCalled();
});
