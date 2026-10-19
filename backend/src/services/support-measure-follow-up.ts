import type { Measure } from '@/data-contracts/supportmanagement/data-contracts';

/**
 * A follow-up is saved on the measure itself: `result` says whether the measure had the desired effect,
 * `resultText` what happened and `completedAt` when it was followed up. Support Management accepts only
 * `COMPLETED`, `PARTIALLY_COMPLETED`, `NOT_COMPLETED` and `NOT_APPLICABLE` in `result` (an enum in its code,
 * not in its OpenAPI spec). Draken's yes/no answer uses the two outer values.
 */
const MEASURE_RESULT_ACHIEVED = 'COMPLETED';
const MEASURE_RESULT_NOT_ACHIEVED = 'NOT_COMPLETED';

export interface MeasureFollowUpAnswers {
  readonly result: string;
  readonly resultText: string;
}

export const measureFollowUpAnswers = (desiredEffectAchieved: boolean, followUpDescription: string): MeasureFollowUpAnswers => ({
  result: desiredEffectAchieved ? MEASURE_RESULT_ACHIEVED : MEASURE_RESULT_NOT_ACHIEVED,
  resultText: followUpDescription,
});

/** Whether these very answers are what the measure holds - a lost response to an accepted follow-up, not a new one. */
export const measureHoldsFollowUp = (measure: Pick<Measure, 'result' | 'resultText'>, answers: MeasureFollowUpAnswers): boolean =>
  measure.result === answers.result && measure.resultText === answers.resultText;

/** Approved whole or in part: the measure is to be carried out. */
export const isApprovedMeasure = (measure: Pick<Measure, 'accept'>): boolean => measure.accept === 'TRUE' || measure.accept === 'REWORK';

export const isPlannedApprovedMeasure = (measure: Measure): boolean =>
  isApprovedMeasure(measure) && Boolean(measure.plannedStart || measure.plannedComplete);

/** The same day and time, however it is written. */
const sameInstant = (left: string | undefined, right: string | undefined): boolean =>
  left !== undefined && right !== undefined && Date.parse(left) === Date.parse(right);

/** A measure starts when it was planned to: once set, its start date never changes. */
export const changesStartDate = (existing: Pick<Measure, 'plannedStart'>, plannedStart: string | undefined): boolean =>
  Boolean(existing.plannedStart) && plannedStart !== undefined && !sameInstant(plannedStart, existing.plannedStart);

/** An approved measure's end date is moved by whoever follows the measure up, with its own command - not by editing. */
export const changesApprovedEndDate = (existing: Pick<Measure, 'accept' | 'plannedComplete'>, plannedComplete: string | undefined): boolean =>
  isApprovedMeasure(existing) && plannedComplete !== undefined && !sameInstant(plannedComplete, existing.plannedComplete);
