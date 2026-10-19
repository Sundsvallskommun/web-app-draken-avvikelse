import assert from 'node:assert/strict';

import type { MeasureType } from '@common/data-contracts/supportmanagement/data-contracts';
import dayjs from 'dayjs';
import { test } from 'vitest';

import {
  describeDeadlineDistance,
  filterPlannedMeasures,
  filterPlannedMeasuresByDate,
  formatDeadlineDay,
  groupPlannedMeasures,
  isPlannedMeasureOverdue,
  plannedMeasureBucket,
  plannedMeasureDeadline,
  type PlannedSupportMeasure,
} from './planned-measures';

const types: MeasureType[] = [
  { id: 'type-education', name: 'EDUCATION', displayName: 'Utbildning', measureGroups: ['PREVENTIVE'] },
];
const planned = (fields: Partial<PlannedSupportMeasure>): PlannedSupportMeasure => ({
  id: 'm',
  accept: 'TRUE',
  type: 'EDUCATION',
  plannedComplete: '2026-10-01T00:00:00Z',
  errand: { id: 'e', errandNumber: 'VOF-2026-0001' },
  ...fields,
});

test('the deadline is the planned completion, falling back to the planned start', () => {
  assert.equal(
    plannedMeasureDeadline({ plannedStart: '2026-09-20T00:00:00Z', plannedComplete: '2026-10-01T00:00:00Z' }),
    '2026-10-01T00:00:00Z'
  );
  assert.equal(plannedMeasureDeadline({ plannedStart: '2026-09-20T00:00:00Z' }), '2026-09-20T00:00:00Z');
  assert.equal(plannedMeasureDeadline({}), undefined);
});

test('a measure is overdue once its completion date lies before today, never on a passed start alone', () => {
  const today = dayjs('2026-09-14T10:00:00');
  assert.equal(isPlannedMeasureOverdue({ plannedComplete: '2026-09-13T23:00:00' }, today), true);
  assert.equal(isPlannedMeasureOverdue({ plannedComplete: '2026-09-14T00:00:00' }, today), false);
  assert.equal(isPlannedMeasureOverdue({ plannedComplete: '2026-09-15T00:00:00' }, today), false);
  assert.equal(isPlannedMeasureOverdue({}, today), false);
});

test('free text matches the errand number, the type label and the measure content', () => {
  const measures = [
    planned({ id: 'by-number', errand: { id: 'e1', errandNumber: 'VOF-2026-0007' } }),
    planned({ id: 'by-description', description: 'Utbilda på avdelning 3' }),
    planned({ id: 'by-type', type: 'EDUCATION', errand: { id: 'e3', errandNumber: 'VOF-2026-0009' } }),
    planned({ id: 'by-goal', goal: 'Färre fall', type: 'UNKNOWN', errand: { id: 'e4', errandNumber: 'X' } }),
    planned({
      id: 'by-user',
      responsibleUser: 'abc01abc',
      type: 'UNKNOWN',
      errand: { id: 'e5', errandNumber: 'Y' },
    }),
  ];
  const ids = (text: string) => filterPlannedMeasures(measures, text, types).map((measure) => measure.id);
  assert.deepEqual(ids('0007'), ['by-number']);
  assert.deepEqual(ids('avdelning 3'), ['by-description']);
  assert.deepEqual(ids('utbildning'), ['by-number', 'by-description', 'by-type']);
  assert.deepEqual(ids('FÄRRE'), ['by-goal']);
  assert.deepEqual(ids('abc01'), ['by-user']);
  assert.deepEqual(ids('finns inte'), []);
});

test('blank text keeps every measure in its given order', () => {
  const measures = [planned({ id: 'a' }), planned({ id: 'b' })];
  assert.deepEqual(
    filterPlannedMeasures(measures, '   ', types).map((measure) => measure.id),
    ['a', 'b']
  );
});

const today = dayjs('2026-09-14T10:00:00');

test('buckets by deadline: passed completion is late, within two weeks is soon, the rest later', () => {
  assert.equal(plannedMeasureBucket(planned({ plannedComplete: '2026-09-13T00:00:00' }), today), 'overdue');
  assert.equal(plannedMeasureBucket(planned({ plannedComplete: '2026-09-14T00:00:00' }), today), 'soon');
  assert.equal(plannedMeasureBucket(planned({ plannedComplete: '2026-09-28T00:00:00' }), today), 'soon');
  assert.equal(plannedMeasureBucket(planned({ plannedComplete: '2026-09-29T00:00:00' }), today), 'later');
  // Planned by start only: a passed start is current work, not lateness.
  assert.equal(
    plannedMeasureBucket(planned({ plannedComplete: undefined, plannedStart: '2026-09-01T00:00:00' }), today),
    'soon'
  );
  assert.equal(
    plannedMeasureBucket(planned({ plannedComplete: undefined, plannedStart: '2026-10-20T00:00:00' }), today),
    'later'
  );
  assert.equal(plannedMeasureBucket(planned({ plannedComplete: 'not-a-date' }), today), 'later');
});

test('groups keep the given order inside each bucket and drop empty buckets', () => {
  const groups = groupPlannedMeasures(
    [
      planned({ id: 'late-1', plannedComplete: '2026-09-01T00:00:00' }),
      planned({ id: 'late-2', plannedComplete: '2026-09-10T00:00:00' }),
      planned({ id: 'far', plannedComplete: '2026-12-01T00:00:00' }),
    ],
    today
  );
  assert.deepEqual(
    groups.map((group) => [group.bucket, group.label, group.measures.map((measure) => measure.id)]),
    [
      ['overdue', 'Försenade', ['late-1', 'late-2']],
      ['later', 'Senare', ['far']],
    ]
  );
  assert.deepEqual(groupPlannedMeasures([], today), []);
});

test('the agenda day reads "10 sep" and names the year only when it is another year', () => {
  assert.equal(formatDeadlineDay('2026-09-10T00:00:00', today), '10 sep');
  assert.equal(formatDeadlineDay('2026-03-01T00:00:00', today), '1 mars');
  assert.equal(formatDeadlineDay('2027-01-05T00:00:00', today), '5 jan 2027');
  assert.equal(formatDeadlineDay(undefined, today), '–');
  assert.equal(formatDeadlineDay('not-a-date', today), '–');
});

test('the distance to the deadline is worded in whole days from today', () => {
  assert.equal(describeDeadlineDistance('2026-09-14T23:00:00', today), 'i dag');
  assert.equal(describeDeadlineDistance('2026-09-15T00:00:00', today), 'i morgon');
  assert.equal(describeDeadlineDistance('2026-09-13T00:00:00', today), 'i går');
  assert.equal(describeDeadlineDistance('2026-09-27T00:00:00', today), 'om 13 dagar');
  assert.equal(describeDeadlineDistance('2026-09-10T00:00:00', today), '4 dagar sedan');
  assert.equal(describeDeadlineDistance(undefined, today), '');
});

// Ö1. A span of days over the date the agenda orders by, either end open.
test('a date span keeps the measures whose deadline falls within it, both ends included', () => {
  const measures = [
    planned({ id: 'before', plannedComplete: '2026-09-30T12:00:00' }),
    planned({ id: 'first-day', plannedComplete: '2026-10-01T12:00:00' }),
    planned({ id: 'last-day', plannedComplete: '2026-10-15T12:00:00' }),
    planned({ id: 'after', plannedComplete: '2026-10-16T12:00:00' }),
    // Planned by its start alone: the start is the date the agenda places it by.
    planned({ id: 'by-start', plannedComplete: undefined, plannedStart: '2026-10-10T12:00:00' }),
    planned({ id: 'undated', plannedComplete: undefined }),
  ];
  const ids = (from: string, to: string) => filterPlannedMeasuresByDate(measures, { from, to }).map(({ id }) => id);

  assert.deepEqual(ids('2026-10-01', '2026-10-15'), ['first-day', 'last-day', 'by-start']);
  assert.deepEqual(ids('2026-10-10', ''), ['last-day', 'after', 'by-start']);
  assert.deepEqual(ids('', '2026-09-30'), ['before']);
  // No span set is no filter, and keeps what has no date too.
  assert.deepEqual(ids('', ''), ['before', 'first-day', 'last-day', 'after', 'by-start', 'undated']);
});
