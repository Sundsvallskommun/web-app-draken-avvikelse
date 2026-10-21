/**
 * The BFF refuses a write over a change the handler has not seen: 409 when something the write depends on - a field
 * it writes, the errand's handler, status or phase, a document or a measure - changed since the page loaded it, 412
 * when somebody else's write came between the BFF's read and its own. Both mean the same thing to the user and are
 * recovered the same way, so they share one message.
 */
const SUPPORT_ERRAND_WRITE_CONFLICT_STATUSES: ReadonlySet<number> = new Set([409, 412]);

/**
 * A conflict is never resolved by writing again on the errand as it now stands: that would write over the other
 * change unseen. So the message says what was not saved, and that the change is made anew on the errand reloaded.
 */
export const SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE =
  'Ändringen sparades inte: någon annan har ändrat ärendet sedan du öppnade det. Ladda om ärendet och gör om ändringen.';

/** The same, where the user typed what was not saved: reloading the errand throws it away. */
export const SUPPORT_ERRAND_DRAFT_CONFLICT_MESSAGE =
  'Ändringarna sparades inte: någon annan har ändrat ärendet sedan du öppnade det. Kopiera det du vill behålla, ladda om ärendet och gör om ändringarna.';

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

/** `conflictMessage` says what a conflict left unsaved where the errand-wide wording does not fit. */
export const supportErrandWriteErrorMessage = (
  error: unknown,
  fallback: string,
  conflictMessage: string = SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE
): string => {
  if (error instanceof SupportErrandStatusAfterAssignmentError) return error.message;

  return refusalMessage(error) ?? (isSupportErrandWriteConflict(error) ? conflictMessage : fallback);
};
