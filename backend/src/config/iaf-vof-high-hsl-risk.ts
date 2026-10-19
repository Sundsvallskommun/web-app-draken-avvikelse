/** The label an IAF/VOF errand carries once its saved investigation has assessed a high HSL risk. */
export const IAF_VOF_HIGH_HSL_RISK_LABEL = 'RISK/HIGH_HSL';

/** The same label as an errand carries it: by its path, or by classification and name where the path is left out. */
export const IAF_VOF_HIGH_HSL_RISK_LABEL_SELECTOR = Object.freeze({
  resourcePath: IAF_VOF_HIGH_HSL_RISK_LABEL,
  classification: 'RISK',
  resourceName: 'HIGH_HSL',
});

/** The HSL risk value from which the risk is high - the investigation's own analysis threshold. */
const IAF_VOF_HIGH_HSL_RISK_THRESHOLD = 4;

const HSL_RISK_ASSESSMENT = 'riskAssessmentHsl';

/**
 * Whether the unit manager's investigation assesses a high HSL risk: a calculated HSL risk value from the
 * threshold up, completed or not.
 *
 * The label is what lets MAS/MAR reach the errand, so it is set as soon as a save assesses a high risk, and it
 * stays once set: a later save that assesses a lower risk does not take the errand away from MAS/MAR again.
 */
export const assessesHighHslRisk = (document: Readonly<Record<string, unknown>>): boolean => {
  const assessment = document[HSL_RISK_ASSESSMENT];
  const riskValue =
    typeof assessment === 'object' && assessment !== null && !Array.isArray(assessment)
      ? (assessment as Record<string, unknown>).calculatedRiskValue
      : undefined;
  return typeof riskValue === 'number' && riskValue >= IAF_VOF_HIGH_HSL_RISK_THRESHOLD;
};
