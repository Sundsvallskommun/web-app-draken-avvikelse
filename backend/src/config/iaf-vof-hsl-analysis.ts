/** The schema of MAS/MAR's HSL event analysis, Händelseanalys HSL. */
export const IAF_VOF_HSL_ANALYSIS_SCHEMA_NAME = 'utredning-hsl';

/** The schema of MAS/MAR's decision on the HSL deviation, Beslut HSL. */
export const IAF_VOF_HSL_DECISION_SCHEMA_NAME = 'beslut-hsl';

/**
 * The label an IAF/VOF errand carries once MAS/MAR's initial assessment has been that the event is analysed.
 * Support Management's subscription profile for the head of operations e-mails them from it. It is permanent: a
 * later decision against the analysis leaves it, so the head of operations is not told twice.
 */
export const IAF_VOF_HSL_ANALYSIS_STARTED_LABEL = 'ANALYSIS/HSL_STARTED';

const ANALYSIS_DECISION_FIELD = 'analysisDecision';

/**
 * Whether MAS/MAR's saved initial assessment is that the event is analysed. An undecided analysis, one decided
 * against, and one bound to a schema version before 1.5, which has no initial assessment, are not.
 */
export const startsHslAnalysis = (document: Readonly<Record<string, unknown>>): boolean => document[ANALYSIS_DECISION_FIELD] === 'analyze';

/** Whether MAS/MAR has made the initial assessment at all, whichever way it went. */
export const hasHslAnalysisDecision = (document: Readonly<Record<string, unknown>>): boolean => {
  const decision = document[ANALYSIS_DECISION_FIELD];
  return typeof decision === 'string' && decision.trim() !== '';
};
