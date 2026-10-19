export type FollowUpSortDirection = 'ascending' | 'descending';

export interface FollowUpSort<TKey extends string> {
  readonly key: TKey;
  readonly direction: FollowUpSortDirection;
}

type SortValue = string | number | undefined;

/**
 * Orders rows by one column. Missing values sort last whichever way the column is turned, so the rows
 * with something to compare stay together at the top.
 */
export const sortFollowUpRows = <TRow, TKey extends string>(
  rows: readonly TRow[],
  sort: FollowUpSort<TKey>,
  valueOf: (row: TRow, key: TKey) => SortValue
): TRow[] => {
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = valueOf(left, sort.key);
    const b = valueOf(right, sort.key);
    if (a === undefined || a === '') return b === undefined || b === '' ? 0 : 1;
    if (b === undefined || b === '') return -1;
    const order = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'sv');
    return sign * order;
  });
};

/** A click on the active column turns it; a click on another column starts there, in the given direction. */
export const nextFollowUpSort = <TKey extends string>(
  current: FollowUpSort<TKey>,
  key: TKey,
  initialDirection: FollowUpSortDirection = 'ascending'
): FollowUpSort<TKey> =>
  current.key === key
    ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
    : { key, direction: initialDirection };
