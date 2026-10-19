/** A count with its noun in the right number: `1 enhet`, `3 enheter`. */
export const countWithNoun = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;
