import type { Measure } from '@common/data-contracts/supportmanagement/data-contracts';

import { measureIsApproved } from './measure-decision';

export interface MeasureFollowUpInput {
  desiredEffectAchieved: boolean;
  followUpDescription: string;
}

/**
 * The result a follow-up saves on a measure that had the desired effect; the BFF saves `NOT_COMPLETED` otherwise.
 * What happened is saved in `resultText`.
 */
const MEASURE_RESULT_ACHIEVED = 'COMPLETED';

/** The answers saved on a followed-up measure, or undefined while it has not been followed up. */
export const measureFollowUp = (measure: Pick<Measure, 'result' | 'resultText'>): MeasureFollowUpInput | undefined =>
  measure.result
    ? {
        desiredEffectAchieved: measure.result === MEASURE_RESULT_ACHIEVED,
        followUpDescription: measure.resultText ?? '',
      }
    : undefined;

/** Whether the measure holds exactly these answers - a follow-up that was saved even if its response was lost. */
export const measureHoldsFollowUp = (
  measure: Pick<Measure, 'result' | 'resultText'>,
  answers: MeasureFollowUpInput
): boolean => {
  const saved = measureFollowUp(measure);
  return (
    saved?.desiredEffectAchieved === answers.desiredEffectAchieved &&
    saved.followUpDescription === answers.followUpDescription
  );
};

/** Completed planned measures remain visible with their result. Directly executed measures do not enter this flow. */
export const measureBelongsInFollowUp = (measure: Measure): boolean =>
  measureIsApproved(measure) && Boolean(measure.plannedStart || measure.plannedComplete);

export const measureHasFollowUp = (measure: Measure): boolean => Boolean(measure.result);

export const measureCanBeFollowedUp = (measure: Measure): boolean =>
  Boolean(measure.id) && measureBelongsInFollowUp(measure) && !measureHasFollowUp(measure);
