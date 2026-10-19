import { expect, test } from 'vitest';

import { groupMeasuresByPerson, sortMeasuresByCreated } from './measure-sort';

const measure = (id: string, created?: string, addedByUser?: string) => ({ id, created, addedByUser });

// Ä10. An errand has several handlers over time, so the list opens on what was added last.
test('puts the latest added measure first, whatever offset the time is written in', () => {
  const sorted = sortMeasuresByCreated([
    measure('latest', '2026-10-09T10:00:00+02:00'),
    measure('earliest', '2026-10-08T23:30:00+02:00'),
    // 07:30 UTC is 09:30 Swedish time: before the latest, after the earliest.
    measure('between', '2026-10-09T07:30:00Z'),
  ]);
  expect(sorted.map(({ id }) => id)).toEqual(['latest', 'between', 'earliest']);
});

test('keeps the given order for measures registered at the same time, and puts those without a time last', () => {
  const sorted = sortMeasuresByCreated([
    measure('undated'),
    measure('a', '2026-10-09T10:00:00+02:00'),
    measure('b', '2026-10-09T10:00:00+02:00'),
    measure('unreadable', 'i går'),
  ]);
  expect(sorted.map(({ id }) => id)).toEqual(['a', 'b', 'undated', 'unreadable']);
});

test('gathers each person’s measures, people by name and their measures with the latest first', () => {
  const names: Record<string, string> = { 'ann.berg': 'Ann Berg', 'örjan.ek': 'Örjan Ek' };
  const groups = groupMeasuresByPerson(
    [
      measure('örjan-late', '2026-10-09T12:00:00+02:00', 'örjan.ek'),
      measure('nobody', '2026-10-01T08:00:00+02:00'),
      measure('ann-late', '2026-10-09T09:00:00+02:00', 'Ann.Berg'),
      measure('örjan-early', '2026-10-08T12:00:00+02:00', 'ÖRJAN.EK'),
      measure('ann-early', '2026-10-07T09:00:00+02:00', 'ann.berg'),
    ],
    (account) => (account ? names[account.toLowerCase()] : undefined)
  );

  expect(groups.map(({ person, measures }) => [person, measures.map(({ id }) => id)])).toEqual([
    ['Ann Berg', ['ann-late', 'ann-early']],
    ['Örjan Ek', ['örjan-late', 'örjan-early']],
    // Nobody is recorded for it, so it comes last and under no name.
    [undefined, ['nobody']],
  ]);
});

test('names a person the directory does not know by what the resolver gives, and groups them all the same', () => {
  const groups = groupMeasuresByPerson(
    [measure('one', '2026-10-09T12:00:00+02:00', 'okänd.person'), measure('two', undefined, 'okänd.person')],
    (account) => account
  );
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ key: 'okänd.person', person: 'okänd.person' });
});
