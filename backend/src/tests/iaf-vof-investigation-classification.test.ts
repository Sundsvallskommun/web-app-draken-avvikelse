import {
  IAF_VOF_ERRAND_CLASSIFICATION_GROUP_PRIORITY,
  IAF_VOF_INVESTIGATION_CLASSIFICATION_GROUPS,
  IAF_VOF_INVESTIGATION_CLASSIFICATION_LABEL_TREE,
  IAF_VOF_INVESTIGATION_CLASSIFICATION_LEGAL_BASE_RULES,
  IAF_VOF_INVESTIGATION_LEGAL_BASES_POINTER,
  IAF_VOF_REPORTED_MISCONDUCT_LEGAL_BASES,
  preservesIafVofInvestigationClassificationOwnerParameter,
  resolveIafVofInvestigationClassificationOwner,
  resolveIafVofInvestigationClassificationPolicy,
  resolveIafVofInvestigationDocumentApplicability,
  resolveIafVofUnitManagerErrandFacts,
} from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE, createSupportInvestigationProfile } from '@/config/support-investigation-profile';

const customProfile = () =>
  createSupportInvestigationProfile({
    documents: [
      { key: 'manager-document', schemaName: 'utredning-enhetschef', tabLabel: 'Manager', ownerLabel: 'Manager' },
      { key: 'social-document', schemaName: 'utredning-sol-lss', tabLabel: 'Social', ownerLabel: 'Investigator' },
    ],
  });

describe('fixed IAF/VOF investigation classification policy', () => {
  it('resolves fixed schema roles to profile persistence keys', () => {
    expect(resolveIafVofInvestigationClassificationPolicy(customProfile())).toEqual({
      defaultOwnerDocumentKey: 'manager-document',
      reportedMisconductOwnerDocumentKey: 'social-document',
      labelTree: IAF_VOF_INVESTIGATION_CLASSIFICATION_LABEL_TREE,
      reportedMisconductLegalBases: IAF_VOF_REPORTED_MISCONDUCT_LEGAL_BASES,
      legalBasesPointer: IAF_VOF_INVESTIGATION_LEGAL_BASES_POINTER,
      legalBaseRules: IAF_VOF_INVESTIGATION_CLASSIFICATION_LEGAL_BASE_RULES,
      classificationGroups: IAF_VOF_INVESTIGATION_CLASSIFICATION_GROUPS,
      errandClassificationGroupPriority: IAF_VOF_ERRAND_CLASSIFICATION_GROUP_PRIORITY,
    });
  });

  it('fails closed when a fixed owner schema is missing or ambiguous', () => {
    const missing = createSupportInvestigationProfile({
      documents: [{ key: 'manager', schemaName: 'utredning-enhetschef', tabLabel: 'Manager', ownerLabel: 'Manager' }],
    });
    const ambiguous = createSupportInvestigationProfile({
      documents: [...customProfile().documents, { key: 'manager-copy', schemaName: 'utredning-enhetschef', tabLabel: 'Copy', ownerLabel: 'Manager' }],
    });
    expect(resolveIafVofInvestigationClassificationPolicy(missing)).toBeUndefined();
    expect(resolveIafVofInvestigationClassificationPolicy(ambiguous)).toBeUndefined();
  });

  it('selects manager for deviations and SoL/LSS for reported misconduct', () => {
    const policy = resolveIafVofInvestigationClassificationPolicy(customProfile());
    if (!policy) throw new Error('Expected IAF policy');

    expect(resolveIafVofInvestigationClassificationOwner(policy, { parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }] })).toEqual({
      mode: 'default',
      documentKey: 'manager-document',
    });
    expect(resolveIafVofInvestigationClassificationOwner(policy, { parameters: [{ key: 'eventType', values: [' missforhallande '] }] })).toEqual({
      mode: 'reported-misconduct',
      documentKey: 'social-document',
    });
  });

  it('uses resourcePath as authoritative and resourceName only as a pathless fallback', () => {
    const policy = resolveIafVofInvestigationClassificationPolicy(AVVIKELSE_INVESTIGATION_PROFILE)!;
    expect(resolveIafVofInvestigationClassificationOwner(policy, { labels: [{ resourcePath: 'OTHER/ABUSE', resourceName: 'ABUSE' }] }).mode).toBe(
      'default',
    );
    expect(resolveIafVofInvestigationClassificationOwner(policy, { labels: [{ resourceName: 'ABUSE' }] }).mode).toBe('reported-misconduct');
  });

  it('lets the report type label decide, and the reported event type only stand in for an errand without one', () => {
    const policy = resolveIafVofInvestigationClassificationPolicy(AVVIKELSE_INVESTIGATION_PROFILE)!;
    const reportedAsMisconduct = [{ key: 'eventType', values: ['MISSFORHALLANDE'] }];
    // LEX declined the misconduct, and it went back as a deviation: the label moved, the report never does.
    expect(
      resolveIafVofInvestigationClassificationOwner(policy, {
        parameters: reportedAsMisconduct,
        labels: [{ resourcePath: 'REPORT_TYPE/DEVIATION' }],
      }).mode,
    ).toBe('default');
    // The unit manager suspected a misconduct in a deviation, and assign-lex made it one.
    expect(
      resolveIafVofInvestigationClassificationOwner(policy, {
        parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }],
        labels: [{ resourcePath: 'REPORT_TYPE/ABUSE' }],
      }).mode,
    ).toBe('reported-misconduct');
    expect(resolveIafVofInvestigationClassificationOwner(policy, { parameters: reportedAsMisconduct, labels: [] }).mode).toBe('reported-misconduct');
  });

  it('tells the unit manager investigation whether its errand is a misconduct, as the errand stands now', () => {
    const reportedAsMisconduct = [{ key: 'eventType', values: ['MISSFORHALLANDE'] }];
    expect(resolveIafVofUnitManagerErrandFacts({ parameters: reportedAsMisconduct, labels: [] })).toEqual({ reportedMisconduct: true });
    expect(resolveIafVofUnitManagerErrandFacts({ labels: [{ resourcePath: 'REPORT_TYPE/DEVIATION' }] })).toEqual({ reportedMisconduct: false });
    // LEX declined it and it went back as a deviation: the unit manager risk-assesses it again.
    expect(resolveIafVofUnitManagerErrandFacts({ parameters: reportedAsMisconduct, labels: [{ resourcePath: 'REPORT_TYPE/DEVIATION' }] })).toEqual({
      reportedMisconduct: false,
    });
    expect(resolveIafVofUnitManagerErrandFacts({})).toEqual({ reportedMisconduct: false });
  });

  it('resolves at most one decision applicability per errand, reported misconduct first', () => {
    const hslLabel = { classification: 'PROVISION', resourcePath: 'PROVISION/HSL', resourceName: 'HSL' };
    const solLabel = { classification: 'PROVISION', resourcePath: 'PROVISION/SOL', resourceName: 'SOL' };
    const deviation = { parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }] };
    const misconduct = { parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }] };

    expect(resolveIafVofInvestigationDocumentApplicability({ ...deviation, labels: [solLabel] })).toBeUndefined();
    expect(resolveIafVofInvestigationDocumentApplicability({ ...deviation, labels: [hslLabel] })).toBe('hsl-deviation');
    expect(resolveIafVofInvestigationDocumentApplicability({ ...deviation, labels: [solLabel, hslLabel] })).toBe('hsl-deviation');
    expect(resolveIafVofInvestigationDocumentApplicability({ ...misconduct, labels: [solLabel] })).toBe('reported-misconduct');
    expect(resolveIafVofInvestigationDocumentApplicability({ ...misconduct, labels: [hslLabel, solLabel] })).toBe('reported-misconduct');
  });

  it('recognises the HSL legal base by path, and by name only for a pathless legal base label', () => {
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [{ classification: 'PROVISION', resourcePath: '/provision/hsl/' }] })).toBe(
      'hsl-deviation',
    );
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [{ classification: 'provision', resourceName: ' hsl ' }] })).toBe(
      'hsl-deviation',
    );
    // The category branch for HSL is also named HSL; it is not a legal base.
    expect(
      resolveIafVofInvestigationDocumentApplicability({
        labels: [{ classification: 'CATEGORY', resourcePath: 'CATEGORY/HSL', resourceName: 'HSL' }],
      }),
    ).toBeUndefined();
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [{ classification: 'CATEGORY', resourceName: 'HSL' }] })).toBeUndefined();
    expect(
      resolveIafVofInvestigationDocumentApplicability({ labels: [{ classification: 'PROVISION', resourcePath: 'OTHER/PROVISION/HSL' }] }),
    ).toBeUndefined();
  });

  it('gives a deviation marked with a high HSL risk the HSL decision, reported under HSL or not', () => {
    const highHslRisk = { classification: 'risk', resourcePath: 'RISK/HIGH_HSL', resourceName: 'HIGH_HSL' };
    const deviation = { resourcePath: 'REPORT_TYPE/DEVIATION' };
    const solLabel = { classification: 'PROVISION', resourcePath: 'PROVISION/SOL', resourceName: 'SOL' };

    // No legal base was reported: the unit manager's investigation named HSL and assessed the risk.
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [deviation, highHslRisk] })).toBe('hsl-deviation');
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [deviation, solLabel, highHslRisk] })).toBe('hsl-deviation');
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [{ classification: 'Risk', resourceName: ' high_hsl ' }] })).toBe(
      'hsl-deviation',
    );
    // A misconduct takes the lex Sarah decision whatever the HSL risk: one decision per errand.
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [{ resourcePath: 'REPORT_TYPE/ABUSE' }, highHslRisk] })).toBe(
      'reported-misconduct',
    );
    // Another risk, and the same name outside the risks, are not the mark.
    expect(
      resolveIafVofInvestigationDocumentApplicability({ labels: [deviation, { classification: 'risk', resourcePath: 'RISK/HIGH_SOL_LSS' }] }),
    ).toBeUndefined();
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [{ classification: 'CATEGORY', resourceName: 'HIGH_HSL' }] })).toBeUndefined();
    expect(resolveIafVofInvestigationDocumentApplicability({ labels: [deviation] })).toBeUndefined();
  });

  it('protects only the fixed eventType selector from generic parameter writes', () => {
    const current = [{ key: 'eventType', values: ['AVVIKELSE'] }];
    expect(preservesIafVofInvestigationClassificationOwnerParameter(current, current)).toBe(true);
    expect(preservesIafVofInvestigationClassificationOwnerParameter(current, [{ key: 'eventType', values: ['MISSFORHALLANDE'] }])).toBe(false);
    expect(
      preservesIafVofInvestigationClassificationOwnerParameter(
        [...current, { key: 'facility', values: ['OLD'] }],
        [...current, { key: 'facility', values: ['NEW'] }],
      ),
    ).toBe(true);
  });
});
