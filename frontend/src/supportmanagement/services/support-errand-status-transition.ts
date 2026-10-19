export interface SupportErrandStatusSnapshot {
  status?: string;
  version?: number;
}

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
  expectedVersion: number;
  expectedStatus: string;
  status: string;
}

/** Builds the exact command from a fresh errand snapshot; stale state is rejected by the backend. */
export const buildSupportErrandStatusTransitionRequest = (
  snapshot: SupportErrandStatusSnapshot,
  status: string,
  changes: SupportErrandStatusTransitionChanges = {}
): SupportErrandStatusTransitionRequest => {
  if (!Number.isSafeInteger(snapshot.version) || snapshot.version! < 0) {
    throw new Error('Support errand is missing a valid version');
  }
  if (!snapshot.status) {
    throw new Error('Support errand is missing its current status');
  }
  if (!status) {
    throw new Error('Target status is required');
  }

  return {
    expectedVersion: snapshot.version!,
    expectedStatus: snapshot.status,
    status,
    ...changes,
  };
};
