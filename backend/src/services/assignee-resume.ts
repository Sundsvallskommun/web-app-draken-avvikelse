import { Event, Operation } from '@/data-contracts/supportmanagement/data-contracts';

const ASSIGNED_STATUS = 'ASSIGNED';

/** One write to an errand, with what it changed and, where the event names one, the account that made it. */
export interface ErrandHistoryEntry {
  readonly at: string;
  readonly operations: readonly Operation[];
  readonly by?: string;
}

const eventMetadata = (event: Event): Map<string | undefined, string | undefined> =>
  new Map((event.metadata ?? []).map(({ key, value }) => [key, value]));

/** The revisions an errand event moved the errand between, when it is a write to the errand itself. */
export const readErrandEventVersions = (event: Event): { previous: string; current: string } | undefined => {
  if (event.subType !== 'ERRAND' || !event.created) return undefined;
  const metadata = eventMetadata(event);
  const previous = metadata.get('PreviousVersion');
  const current = metadata.get('CurrentVersion');
  return previous && current ? { previous, current } : undefined;
};

/** The account Support Management recorded as making the write. */
export const readErrandEventExecutor = (event: Event): string | undefined => eventMetadata(event).get('ExecutedBy')?.trim() || undefined;

const changedValue = (entry: ErrandHistoryEntry, path: string): string | undefined =>
  entry.operations.find(operation => operation.path === path && (operation.op === 'replace' || operation.op === 'add'))?.value;

/** Whether the write gave the errand to this person. */
export const assignsErrandTo = (entry: ErrandHistoryEntry, assignee: string): boolean =>
  changedValue(entry, '/assignedUserId')?.trim().toLowerCase() === assignee.trim().toLowerCase();

/**
 * Who gave the errand to its handler: the account that made their latest assignment. A history naming no
 * assignment to them, or one that does not say who made it, answers nothing.
 *
 * `historyNewestFirst` is in the event log's order, and need reach no further back than the assignment.
 */
export const resolveAssignedBy = (historyNewestFirst: readonly ErrandHistoryEntry[], assignee: string): string | undefined =>
  historyNewestFirst.find(entry => assignsErrandTo(entry, assignee))?.by;

/**
 * When the errand's handler took it up after it was given to them: the first change of status away from
 * ASSIGNED from their latest assignment on - the assignment itself, when the same write moved the status on.
 * An errand not taken up yet answers the assignment; a history naming no assignment to them answers nothing.
 *
 * `historyNewestFirst` is in the event log's order, and need reach no further back than the assignment.
 */
export const resolveAssigneeResumedAt = (historyNewestFirst: readonly ErrandHistoryEntry[], assignee: string): string | undefined => {
  let resumedAt: string | undefined;
  for (const entry of historyNewestFirst) {
    const status = changedValue(entry, '/status');
    if (status !== undefined && status !== ASSIGNED_STATUS) resumedAt = entry.at;
    if (assignsErrandTo(entry, assignee)) return resumedAt ?? entry.at;
  }
  return undefined;
};
