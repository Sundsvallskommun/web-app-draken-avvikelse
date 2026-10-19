import { assessesHighHslRisk } from '@/config/iaf-vof-high-hsl-risk';

const withHslRisk = (calculatedRiskValue: number) => ({ riskAssessmentHsl: { calculatedRiskValue } });

describe('assessesHighHslRisk', () => {
  it('is a high risk from an HSL risk value of 4 up, whether or not the investigation is completed', () => {
    expect(assessesHighHslRisk(withHslRisk(4))).toBe(true);
    expect(assessesHighHslRisk(withHslRisk(16))).toBe(true);
    expect(assessesHighHslRisk({ ...withHslRisk(6), completed: 'no' })).toBe(true);
  });

  it('is no high risk below 4, or without an HSL assessment', () => {
    expect(assessesHighHslRisk(withHslRisk(3))).toBe(false);
    expect(assessesHighHslRisk({ riskAssessmentSolLss: { calculatedRiskValue: 9 } })).toBe(false);
    expect(assessesHighHslRisk({})).toBe(false);
  });
});
