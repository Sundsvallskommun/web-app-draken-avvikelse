import { type SeenSupportErrand, seenSupportErrandFacts, type SupportErrandFacts } from './support-errand-facts';

export interface SupportErrandStatusTransitionChanges {
  resolution?: string;
  /** Why the errand is closed before its workflow ends, where that has to be said; kept as a service note. */
  closingMotivation?: string;
  suspension?: {
    suspendedFrom?: string;
    suspendedTo?: string;
  };
}

export interface SupportErrandStatusTransitionRequest extends SupportErrandStatusTransitionChanges {
  /** What the handler saw of the errand; the BFF checks the status and the phase the transition starts from. */
  seenFacts: SupportErrandFacts;
  status: string;
}

/** Builds the command from the errand the handler saw; one that has moved on since is refused by the BFF. */
export const buildSupportErrandStatusTransitionRequest = (
  seen: SeenSupportErrand | undefined,
  status: string,
  changes: SupportErrandStatusTransitionChanges = {}
): SupportErrandStatusTransitionRequest => {
  if (!status) {
    throw new Error('Target status is required');
  }

  return {
    seenFacts: seenSupportErrandFacts(seen),
    status,
    ...changes,
  };
};
