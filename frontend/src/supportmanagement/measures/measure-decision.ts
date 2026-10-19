import type { Measure } from '@common/data-contracts/supportmanagement/data-contracts';

export type MeasureDecision = 'proposal' | 'accepted' | 'rejected' | 'rework';

/** When an approved measure is to start and be finished. A proposal leaves them open; the approval sets them. */
interface MeasureApprovalDates {
  plannedStart: string;
  plannedComplete: string;
}

export type MeasureDecisionInput =
  | ({ accept: 'TRUE'; acceptMotivation?: string } & MeasureApprovalDates)
  | ({ accept: 'REWORK'; acceptMotivation: string } & MeasureApprovalDates)
  | { accept: 'FALSE'; acceptMotivation: string };

/** Approving a proposal, whole or in part, plans it, so the decision has to say when it runs. */
export const measureDecisionSetsDates = (accept: MeasureDecisionInput['accept'] | ''): boolean =>
  accept === 'TRUE' || accept === 'REWORK';

export const measureDecision = (measure: Pick<Measure, 'accept'>): MeasureDecision | undefined => {
  switch (measure.accept) {
    case 'TRUE':
      return 'accepted';
    case 'FALSE':
      return 'rejected';
    case 'REWORK':
      return 'rework';
    default:
      return measure.accept ? undefined : 'proposal';
  }
};

interface DecisionPresentation {
  label: string;
  color: string;
  iconClassName: string;
  /** Heading for the decision motivation; names the decision instead of repeating "Beslutskommentar". */
  motivationLabel: string;
  /** Tint and left rule tying the motivation to the decision badge. */
  motivationClassName: string;
}

const presentation: Record<MeasureDecision, DecisionPresentation> = {
  // A proposal nobody has decided on yet. "Förslag" alone read as a kind of measure beside the decided ones.
  proposal: {
    label: 'Ej bedömd',
    color: 'bjornstigen',
    iconClassName: 'bg-vattjom-background-200 text-vattjom-text-primary',
    motivationLabel: 'Beslutskommentar',
    motivationClassName: 'bg-background-200 border-divider',
  },
  accepted: {
    label: 'Godkänd',
    color: 'gronsta',
    iconClassName: 'bg-gronsta-background-200 text-gronsta-text-primary',
    motivationLabel: 'Motivering till godkännande',
    motivationClassName: 'bg-gronsta-background-100 border-gronsta-surface-primary',
  },
  rejected: {
    label: 'Avslagen',
    color: 'error',
    iconClassName: 'bg-error-background-200 text-error-text-primary',
    motivationLabel: 'Motivering till avslag',
    motivationClassName: 'bg-error-background-100 border-error-surface-primary',
  },
  rework: {
    label: 'Delvis godkänd',
    color: 'warning',
    iconClassName: 'bg-vattjom-background-200 text-vattjom-text-primary',
    motivationLabel: 'Detta ska justeras',
    motivationClassName: 'bg-warning-background-100 border-warning-surface-primary',
  },
};

/** What a decision state is called, on the card and wherever the list is filtered by it. */
export const measureDecisionLabel = (decision: MeasureDecision): string => presentation[decision].label;

export function measureDecisionPresentation(measure: Pick<Measure, 'accept'>): DecisionPresentation {
  const decision = measureDecision(measure);
  return decision ? presentation[decision] : { ...presentation.proposal, label: measure.accept || 'Okänt beslut' };
}

export const measureIsApproved = (measure: Pick<Measure, 'accept'>): boolean =>
  measure.accept === 'TRUE' || measure.accept === 'REWORK';

/**
 * A decision locks the measure's type, description and goal once the errand has left Utredning; while it is
 * investigated they may still be put right. Unknown decisions also protect the content; they never become editable
 * proposals.
 */
export const measureContentIsLocked = (measure: Pick<Measure, 'accept'>, errandIsInvestigated: boolean): boolean =>
  Boolean(measure.accept) && !errandIsInvestigated;

/** Whether its registrar may remove the measure: while the errand is investigated, and until it is carried out. */
export const measureCanBeRemoved = (
  measure: Pick<Measure, 'id' | 'executed'>,
  errandIsInvestigated: boolean
): boolean => Boolean(measure.id) && !measure.executed && errandIsInvestigated;

export const measureCanBeDecided = (measure: Measure): boolean =>
  Boolean(measure.id && !measure.executed && measureDecision(measure) === 'proposal');
