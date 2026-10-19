/** Whether a classification category is set; `NONE` is how an errand without one is registered. */
export const hasClassificationCategory = (category: string | undefined): boolean => !!category && category !== 'NONE';

/** The parts of an errand that decide whether it is still an unfinished registration. */
export interface SupportErrandEmptinessInput {
  readonly id?: string;
}

/**
 * Whether the errand is still a registration draft rather than one that can be handled. Everything
 * on the errand page reads this: the tabs, the attachments, "Ta ärende" and the sidebar's handling
 * actions.
 *
 * A missing classification never makes an errand a draft: the investigation document writes it, and
 * Grundinformation has no control that could give the errand one. Requiring it would leave the errand
 * a draft with no way out, and every handling action disabled with it.
 */
export const isSupportErrandEmpty = (errand: SupportErrandEmptinessInput | undefined | null): boolean => !errand?.id;
