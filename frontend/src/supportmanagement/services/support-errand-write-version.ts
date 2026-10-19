declare const strongSupportErrandETagBrand: unique symbol;

/** A canonical, strong Support Management errand ETag, for example `"7"`. */
export type StrongSupportErrandETag = string & { readonly [strongSupportErrandETagBrand]: true };

/**
 * Converts a version from a loaded errand into the exact optimistic-locking
 * precondition expected by the BFF. Invalid or absent concurrency state must
 * stop a write before any request is sent.
 */
export const toStrongSupportErrandETag = (version: unknown): StrongSupportErrandETag => {
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new Error('A valid support errand version is required before writing');
  }

  return `"${version}"` as StrongSupportErrandETag;
};

/**
 * The BFF refuses a write whose loaded errand no longer matches upstream: 412 when the
 * If-Match version has moved on, 409 when the errand's status changed under the open view
 * (a transition applied elsewhere, or an errand closed in the meantime). Both mean the same
 * thing to the user and are recovered the same way, so they share one message.
 */
const SUPPORT_ERRAND_WRITE_CONFLICT_STATUSES: ReadonlySet<number> = new Set([409, 412]);

export const SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE =
  'Ärendet har uppdaterats av någon annan. Ladda om ärendet och gör om ändringen.';

/** Reads the response status from an Axios rejection without depending on its error class. */
const getResponseStatus = (error: unknown): number | undefined => {
  const response = (error as { response?: { status?: unknown } } | null | undefined)?.response;

  return typeof response?.status === 'number' ? response.status : undefined;
};

export const isSupportErrandWriteConflict = (error: unknown): boolean => {
  const status = getResponseStatus(error);

  return status !== undefined && SUPPORT_ERRAND_WRITE_CONFLICT_STATUSES.has(status);
};

export const SUPPORT_ERRAND_STATUS_AFTER_ASSIGNMENT_MESSAGE =
  'Handläggaren tilldelades, men ärendet kunde inte sättas till Pågående. Välj status manuellt och spara ärendet.';

/**
 * Taking an errand is two writes: the assignment, and the status change that follows it. The second
 * one can fail on its own, and then "något gick fel" is not true - the errand is the handler's now,
 * it is only still lying in Ny, where the message tab and the sidebar keep their actions shut. Say
 * that instead, and point at the one control that finishes the job.
 */
export class SupportErrandStatusAfterAssignmentError extends Error {
  constructor(readonly reason: unknown) {
    super(SUPPORT_ERRAND_STATUS_AFTER_ASSIGNMENT_MESSAGE);
    this.name = 'SupportErrandStatusAfterAssignmentError';
  }
}

/**
 * A conflict found by reading rather than by a refused write: the errand has moved on from the version
 * this page last saw. It means what a 409 or 412 means, and is recovered the same way.
 */
export class SupportErrandChangedElsewhereError extends Error {
  constructor() {
    super(SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE);
    this.name = 'SupportErrandChangedElsewhereError';
  }
}

/**
 * Confirms by a read that the errand is still the version this page last saw. An action that writes
 * nothing of the errand's own fields still acts on the errand the handler was shown, so a change made
 * elsewhere since then stops it, as a refused write would - without a write that changes nothing.
 */
export const assertSupportErrandUnchangedSinceSeen = (seenVersion: unknown, currentVersion: unknown): void => {
  if (typeof seenVersion !== 'number' || seenVersion !== currentVersion) {
    throw new SupportErrandChangedElsewhereError();
  }
};

/**
 * Picks the user-facing message for a failed errand write: conflicts get the reload advice, and a
 * half-finished assignment says which half is missing. Reloading is the wrong advice there - the
 * assignment already landed, so there is nothing to redo.
 */
/**
 * The BFF answers 422 when the write is refused for a reason it can name - the errand is as the
 * handler left it, but its state forbids what they asked for. That message is the whole point of the
 * refusal, so it is shown instead of a generic one.
 */
const refusalMessage = (error: unknown): string | undefined => {
  if (getResponseStatus(error) !== 422) return undefined;
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : undefined;
};

export const supportErrandWriteErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof SupportErrandStatusAfterAssignmentError) return error.message;
  if (error instanceof SupportErrandChangedElsewhereError) return error.message;

  return (
    refusalMessage(error) ?? (isSupportErrandWriteConflict(error) ? SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE : fallback)
  );
};

/** A child write may advance a partially loaded parent only when it explains the entire change.
 * A later readback can include someone else's edit; its version must never authorize stale fields.
 * `ownWrites` is how many errand writes the request itself made - one, unless the BFF says otherwise.
 */
export const isSoleSupportErrandVersionChange = (expected: unknown, received: unknown, ownWrites = 1): boolean =>
  typeof expected === 'number' &&
  Number.isSafeInteger(expected) &&
  expected >= 0 &&
  typeof received === 'number' &&
  Number.isSafeInteger(received) &&
  received === expected + ownWrites;

/** Where the errand's known versions stand after the caller's own child write. */
export interface OwnErrandWriteAdvance {
  /** The version the next errand-level write is conditioned on. */
  readonly errandVersion: number | undefined;
  /** Whether the errand's known version moves to it. */
  readonly advancesErrand: boolean;
  /** Whether the errand form's own version moves with it. */
  readonly advancesForm: boolean;
}

/**
 * Moves the errand's known version on after the caller's own child write - a document, a measure - which moves the
 * errand's version upstream too. Only a move by exactly the caller's own writes is the caller's: anything more means
 * somebody else wrote as well, and the errand has to find that out on its own next write.
 *
 * The errand's version moves whenever the write started from it, or every later write - the classification that
 * follows a document, the next save - would be refused as somebody else's change. The form's version only moves
 * when the form was showing that version too: a form left behind by a refresh it never took in keeps the older one.
 */
export const resolveOwnErrandWriteAdvance = (
  known: { readonly errandVersion: number | undefined; readonly formVersion: unknown },
  expected: number | undefined,
  received: number,
  ownWrites = 1
): OwnErrandWriteAdvance =>
  known.errandVersion === expected && isSoleSupportErrandVersionChange(expected, received, ownWrites)
    ? { errandVersion: received, advancesErrand: true, advancesForm: known.formVersion === expected }
    : { errandVersion: expected, advancesErrand: false, advancesForm: false };

/**
 * The latest version this client knows the errand has reached. Versions only grow, so the higher of the
 * store's - refreshed by every load - and one read right after the caller's own writes is the current one
 * as far as this client can tell; either alone may lag behind the other.
 */
export const latestKnownSupportErrandVersion = (
  storeVersion: unknown,
  ownWriteVersion: unknown
): number | undefined => {
  const known = [storeVersion, ownWriteVersion].filter(
    (version): version is number => typeof version === 'number' && Number.isSafeInteger(version) && version >= 0
  );
  return known.length > 0 ? Math.max(...known) : undefined;
};
