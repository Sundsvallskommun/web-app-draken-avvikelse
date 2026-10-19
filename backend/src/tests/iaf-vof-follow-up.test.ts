import { toUnitFollowUpErrand } from '@/config/iaf-vof-follow-up';
import { AVVIKELSE_INVESTIGATION_PROFILE } from '@/config/support-investigation-profile';
import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';

import { mockSupportErrandId, mockSupportErrandNumber } from './helpers/mock-data';

const errand = (overrides: Partial<Errand> = {}): Errand =>
  ({
    id: mockSupportErrandId,
    errandNumber: mockSupportErrandNumber,
    title: 'Rehab',
    status: 'ONGOING',
    created: '2026-05-24T10:00:00.000+02:00',
    labels: [{ id: 'unit', classification: 'LOCATION', displayName: 'Granlunda 2', resourcePath: 'LOCATION/VOF/GRANLUNDA_2', version: 3 }],
    ...overrides,
  }) as Errand;

type JsonParameter = NonNullable<Errand['jsonParameters']>[number];

const parameter = (key: string, value: Record<string, unknown>): JsonParameter => ({ key, schemaId: `2281_${key}_1.0`, value }) as JsonParameter;

describe('the unit follow-up of one errand', () => {
  it('reads the risk values and cause areas from the investigations, and the decision facts from the decision', () => {
    const followUp = toUnitFollowUpErrand(
      AVVIKELSE_INVESTIGATION_PROFILE,
      errand({
        jsonParameters: [
          parameter('utredning-enhetschef', {
            legalBases: ['HSL', 'SOL'],
            riskAssessmentHsl: { calculatedRiskValue: 6 },
            riskAssessmentSolLss: { calculatedRiskValue: 9 },
            causeAreas: ['procedures_routines_guidelines'],
            requiresPoliceReport: 'yes',
          }),
          parameter('utredning-sol-lss', {
            causeAreas: ['procedures_routines_guidelines', 'environment_organization'],
            requiresPoliceReport: 'not_applicable',
          }),
          parameter('beslut-sol-lss', { ivoNotification: 'yes', decidedMisconductDegree: 'serious_misconduct' }),
        ],
      }),
    );

    expect(followUp?.investigation).toEqual({
      legalBases: ['HSL', 'SOL'],
      riskValueHsl: 6,
      riskValueSolLss: 9,
      causeAreas: ['procedures_routines_guidelines', 'environment_organization'],
      // Each investigation answers the police report question for its own legal bases: the unit manager's for HSL.
      policeReportHsl: 'yes',
      policeReportSolLss: 'not_applicable',
      ivoNotification: 'yes',
      decidedMisconductDegree: 'serious_misconduct',
    });
  });

  // The investigation that classifies the errand names its legal bases: LEX's once the errand is a misconduct.
  it("reads the legal bases of a misconduct from LEX's investigation, whatever the unit manager's says", () => {
    const followUp = toUnitFollowUpErrand(
      AVVIKELSE_INVESTIGATION_PROFILE,
      errand({
        labels: [{ id: 'abuse', classification: 'REPORT_TYPE', displayName: 'Missförhållande', resourcePath: 'REPORT_TYPE/ABUSE' }],
        jsonParameters: [parameter('utredning-enhetschef', { legalBases: ['SOL', 'LSS'] }), parameter('utredning-sol-lss', { legalBases: ['LSS'] })],
      }),
    );

    expect(followUp?.investigation.legalBases).toEqual(['LSS']);
  });

  it('counts the legal bases the errand was reported under until the investigation names any', () => {
    const reportedUnderHsl = { labels: [{ id: 'hsl', classification: 'PROVISION', displayName: 'HSL', resourcePath: 'PROVISION/HSL' }] };

    expect(toUnitFollowUpErrand(AVVIKELSE_INVESTIGATION_PROFILE, errand(reportedUnderHsl))?.investigation.legalBases).toEqual(['HSL']);
    expect(
      toUnitFollowUpErrand(
        AVVIKELSE_INVESTIGATION_PROFILE,
        errand({ ...reportedUnderHsl, jsonParameters: [parameter('utredning-enhetschef', { legalBases: [] })] }),
      )?.investigation.legalBases,
    ).toEqual(['HSL']);
    expect(
      toUnitFollowUpErrand(
        AVVIKELSE_INVESTIGATION_PROFILE,
        errand({ ...reportedUnderHsl, jsonParameters: [parameter('utredning-enhetschef', { legalBases: ['SOL'] })] }),
      )?.investigation.legalBases,
    ).toEqual(['SOL']);
  });

  it('takes the IVO answer from the HSL decision when the errand has no lex Sarah decision', () => {
    const followUp = toUnitFollowUpErrand(
      AVVIKELSE_INVESTIGATION_PROFILE,
      errand({ jsonParameters: [parameter('beslut-hsl', { ivoNotification: 'no' })] }),
    );

    expect(followUp?.investigation.ivoNotification).toBe('no');
    expect(followUp?.investigation.decidedMisconductDegree).toBeUndefined();
  });

  // Support Management leaves out the documents the user may not read, so their facts are just absent.
  it('leaves every investigation fact empty when no document is readable', () => {
    expect(toUnitFollowUpErrand(AVVIKELSE_INVESTIGATION_PROFILE, errand())?.investigation).toEqual({ legalBases: [], causeAreas: [] });
  });

  it('keeps the labels and measures slim, without versions or attachments', () => {
    const followUp = toUnitFollowUpErrand(
      AVVIKELSE_INVESTIGATION_PROFILE,
      errand({
        measures: [{ id: 'm1', type: 'TRAINING', addedByUser: 'abc01abc', executed: '2026-04-22', result: 'COMPLETED', version: 2, attachments: [] }],
      }),
    );

    expect(followUp?.labels).toEqual([
      { id: 'unit', classification: 'LOCATION', displayName: 'Granlunda 2', resourcePath: 'LOCATION/VOF/GRANLUNDA_2' },
    ]);
    expect(followUp?.measures).toEqual([
      expect.objectContaining({ id: 'm1', type: 'TRAINING', addedByUser: 'abc01abc', executed: '2026-04-22', result: 'COMPLETED' }),
    ]);
    expect(followUp?.measures[0]).not.toHaveProperty('version');
    expect(followUp?.measures[0]).not.toHaveProperty('attachments');
  });

  it('skips an errand without the id and number it is linked by', () => {
    expect(toUnitFollowUpErrand(AVVIKELSE_INVESTIGATION_PROFILE, errand({ errandNumber: undefined }))).toBeUndefined();
  });
});
