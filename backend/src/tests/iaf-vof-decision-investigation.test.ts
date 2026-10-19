import { resolveIafVofDecisionInvestigationDocumentKey } from '@/config/iaf-vof-decision-investigation';
import { resolveIafVofInvestigationClassificationPolicy } from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE } from '@/config/support-investigation-profile';
import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';

const policy = resolveIafVofInvestigationClassificationPolicy(AVVIKELSE_INVESTIGATION_PROFILE)!;

const managerInvestigation = (value: Record<string, unknown>) => ({
  key: 'utredning-enhetschef',
  schemaId: '2281_utredning-enhetschef_1.6',
  value,
});

const decide = (errand: Pick<Errand, 'parameters' | 'labels' | 'jsonParameters'>) => resolveIafVofDecisionInvestigationDocumentKey(policy, errand);

describe('the investigation an IAF/VOF errand is decided on', () => {
  it("is the unit manager's for an ordinary deviation", () => {
    expect(decide({ parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }], labels: [] })).toBe('utredning-enhetschef');
  });

  it('is the lex Sarah investigation for a reported misconduct, by its parameter or its report type', () => {
    expect(decide({ parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }] })).toBe('utredning-sol-lss');
    expect(decide({ labels: [{ resourcePath: 'REPORT_TYPE/ABUSE' }] as Errand['labels'] })).toBe('utredning-sol-lss');
  });

  it("is the lex Sarah investigation once the unit manager's saved investigation suspects a misconduct", () => {
    expect(decide({ jsonParameters: [managerInvestigation({ suspectedMisconduct: 'yes' })] })).toBe('utredning-sol-lss');
  });

  it("goes back to the unit manager's once LEX-ansvarig's initial assessment declines the suspected misconduct", () => {
    const assessment = (lexInvestigationDecision: string) => ({
      key: 'bedomning-sol-lss',
      schemaId: '2281_bedomning-sol-lss_1.0',
      value: { lexInvestigationDecision } as Record<string, unknown>,
    });
    const suspected = managerInvestigation({ suspectedMisconduct: 'yes' });

    expect(decide({ jsonParameters: [suspected, assessment('not_investigate')] })).toBe('utredning-enhetschef');
    expect(decide({ jsonParameters: [suspected, assessment('investigate')] })).toBe('utredning-sol-lss');
  });

  it("stays the unit manager's when the saved investigation does not suspect a misconduct", () => {
    expect(decide({ jsonParameters: [managerInvestigation({ suspectedMisconduct: 'no' })] })).toBe('utredning-enhetschef');
    expect(decide({ jsonParameters: [managerInvestigation({})] })).toBe('utredning-enhetschef');
  });

  it('is never the HSL investigation, whatever the legal bases', () => {
    expect(decide({ labels: [{ classification: 'PROVISION', resourcePath: 'PROVISION/HSL' }] as Errand['labels'] })).toBe('utredning-enhetschef');
  });
});
