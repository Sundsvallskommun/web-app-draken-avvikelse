import {
  IAF_VOF_ERRAND_CLASSIFICATION_GROUP_PRIORITY,
  IAF_VOF_INVESTIGATION_CLASSIFICATION_GROUPS,
  IAF_VOF_INVESTIGATION_CLASSIFICATION_LABEL_TREE,
  IAF_VOF_INVESTIGATION_CLASSIFICATION_LEGAL_BASE_RULES,
  IAF_VOF_INVESTIGATION_LEGAL_BASES_POINTER,
  IAF_VOF_REPORTED_MISCONDUCT_LEGAL_BASES,
  type IafVofInvestigationClassificationPolicy,
} from '@/config/iaf-vof-investigation-classification';
import {
  assertSupportInvestigationClassificationContext,
  selectErrandClassificationIndex,
} from '@/services/support-investigation-classification-context.service';

const policy: IafVofInvestigationClassificationPolicy = {
  defaultOwnerDocumentKey: 'manager-document',
  reportedMisconductOwnerDocumentKey: 'social-document',
  labelTree: IAF_VOF_INVESTIGATION_CLASSIFICATION_LABEL_TREE,
  reportedMisconductLegalBases: IAF_VOF_REPORTED_MISCONDUCT_LEGAL_BASES,
  legalBasesPointer: IAF_VOF_INVESTIGATION_LEGAL_BASES_POINTER,
  legalBaseRules: IAF_VOF_INVESTIGATION_CLASSIFICATION_LEGAL_BASE_RULES,
  classificationGroups: IAF_VOF_INVESTIGATION_CLASSIFICATION_GROUPS,
  errandClassificationGroupPriority: IAF_VOF_ERRAND_CLASSIFICATION_GROUP_PRIORITY,
};

const classification = (category: string) => ({ category, type: `${category}/CATEGORY` });
const document = (...legalBases: string[]) => ({ legalBases });
const owner = (mode: 'default' | 'reported-misconduct', documentKey = 'manager-document') => ({
  mode,
  documentKey,
});

describe('assertSupportInvestigationClassificationContext', () => {
  it.each([
    [['HSL'], ['CATEGORY/HSL'], ['HSL']],
    [['SOL'], ['CATEGORY/SOL_LSS'], ['SOL_LSS']],
    [['LSS'], ['CATEGORY/SOL_LSS'], ['SOL_LSS']],
    [['SOL', 'LSS'], ['CATEGORY/SOL_LSS'], ['SOL_LSS']],
    [
      ['HSL', 'SOL'],
      ['CATEGORY/HSL', 'CATEGORY/SOL_LSS'],
      ['HSL', 'SOL_LSS'],
    ],
    [
      ['SOL', 'HSL'],
      ['CATEGORY/SOL_LSS', 'CATEGORY/HSL'],
      ['SOL_LSS', 'HSL'],
    ],
  ] as const)('accepts legal bases %j classified once in each of their groups', (legalBases, categories, groups) => {
    expect(
      assertSupportInvestigationClassificationContext(
        policy,
        owner('default'),
        'manager-document',
        document(...legalBases),
        categories.map(classification),
      ),
    ).toEqual(groups);
  });

  it('requires a classification in every group the legal bases reach', () => {
    for (const categories of [['CATEGORY/HSL'], ['CATEGORY/SOL_LSS']]) {
      expect(() =>
        assertSupportInvestigationClassificationContext(
          policy,
          owner('default'),
          'manager-document',
          document('HSL', 'SOL'),
          categories.map(classification),
        ),
      ).toThrow('require a classification in every legal base group');
    }
  });

  it('takes only one classification per group, also when SOL and LSS are both chosen', () => {
    expect(() =>
      assertSupportInvestigationClassificationContext(policy, owner('default'), 'manager-document', document('SOL', 'LSS'), [
        classification('CATEGORY/SOL_LSS'),
        classification('CATEGORY/SOL_LSS'),
      ]),
    ).toThrow('only one classification per legal base group');
  });

  it('reads legal bases only from the fixed root path', () => {
    expect(() =>
      assertSupportInvestigationClassificationContext(policy, owner('default'), 'manager-document', { assessment: { legalBases: ['HSL'] } }, [
        classification('CATEGORY/HSL'),
      ]),
    ).toThrow('must contain at least one supported legal base');
  });

  it('rejects a category owned by another legal-base branch', () => {
    expect(() =>
      assertSupportInvestigationClassificationContext(policy, owner('default'), 'manager-document', document('SOL'), [
        classification('CATEGORY/HSL'),
      ]),
    ).toThrow('incompatible with the investigation legal bases');
    expect(() =>
      assertSupportInvestigationClassificationContext(policy, owner('default'), 'manager-document', document('SOL'), [
        classification('CATEGORY/SOL_LSS'),
        classification('CATEGORY/HSL'),
      ]),
    ).toThrow('incompatible with the investigation legal bases');
  });

  it.each([document(), document('UNKNOWN'), { legalBases: [1] }])('fails closed for missing, unknown or malformed legal bases', value => {
    expect(() =>
      assertSupportInvestigationClassificationContext(policy, owner('default'), 'manager-document', value, [classification('CATEGORY/HSL')]),
    ).toThrow();
  });

  it('rejects a document that is not the resolved owner for the current errand', () => {
    expect(() =>
      assertSupportInvestigationClassificationContext(policy, owner('reported-misconduct', 'social-document'), 'manager-document', document('HSL'), [
        classification('CATEGORY/HSL'),
      ]),
    ).toThrow('does not own classification for this errand');
  });

  it('lets LEX choose SoL, LSS or both for a reported misconduct, never HSL, even when owner keys are shared', () => {
    const reportedOwner = owner('reported-misconduct');

    for (const legalBases of [['SOL'], ['LSS'], ['SOL', 'LSS']]) {
      expect(() =>
        assertSupportInvestigationClassificationContext(policy, reportedOwner, 'manager-document', document(...legalBases), [
          classification('CATEGORY/SOL_LSS'),
        ]),
      ).not.toThrow();
    }
    for (const legalBases of [['HSL'], ['SOL', 'LSS', 'HSL'], ['SOL', 'SOL', 'LSS'], []]) {
      expect(() =>
        assertSupportInvestigationClassificationContext(policy, reportedOwner, 'manager-document', document(...legalBases), [
          classification('CATEGORY/SOL_LSS'),
        ]),
      ).toThrow();
    }
  });
});

describe('selectErrandClassificationIndex', () => {
  it('gives the errand classification field to the SoL/LSS classification when there are two', () => {
    expect(selectErrandClassificationIndex(policy, ['HSL', 'SOL_LSS'])).toBe(1);
    expect(selectErrandClassificationIndex(policy, ['SOL_LSS', 'HSL'])).toBe(0);
  });

  it('gives it to the only classification there is', () => {
    expect(selectErrandClassificationIndex(policy, ['HSL'])).toBe(0);
    expect(selectErrandClassificationIndex(policy, ['SOL_LSS'])).toBe(0);
  });
});
