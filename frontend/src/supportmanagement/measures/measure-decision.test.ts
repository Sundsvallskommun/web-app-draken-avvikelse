import { expect, test } from 'vitest';

import {
  measureCanBeDecided,
  measureCanBeRemoved,
  measureContentIsLocked,
  measureDecisionPresentation,
  measureDecisionSetsDates,
  measureIsApproved,
} from './measure-decision';

test.each([
  ['TRUE', 'Godkänd', true],
  ['FALSE', 'Avslagen', false],
  ['REWORK', 'Delvis godkänd', true],
] as const)('presents decision %s consistently and only permits approved execution', (accept, label, approved) => {
  const measure = { id: '1', accept };
  expect(measureDecisionPresentation(measure).label).toBe(label);
  expect(measureIsApproved(measure)).toBe(approved);
  expect(measureContentIsLocked(measure, false)).toBe(true);
  expect(measureCanBeDecided(measure)).toBe(false);
});

test('only an existing, undecided, unexecuted proposal can be assessed', () => {
  expect(measureCanBeDecided({ id: '1' })).toBe(true);
  expect(measureCanBeDecided({})).toBe(false);
  expect(measureCanBeDecided({ id: '1', executed: '2026-09-09T00:00:00Z' })).toBe(false);
  expect(measureIsApproved({})).toBe(false);
  expect(measureContentIsLocked({}, false)).toBe(false);
});

test('unknown persisted decisions remain visible and never become writable proposals', () => {
  const measure = { id: '1', accept: 'UNKNOWN' };
  expect(measureDecisionPresentation(measure).label).toBe('UNKNOWN');
  expect(measureContentIsLocked(measure, false)).toBe(true);
  expect(measureIsApproved(measure)).toBe(false);
  expect(measureCanBeDecided(measure)).toBe(false);
});

// While the errand is investigated a decided measure may still be put right, and removed until it is carried out.
test('a decision locks the content once the errand has left Utredning, not before', () => {
  expect(measureContentIsLocked({ accept: 'TRUE' }, true)).toBe(false);
  expect(measureContentIsLocked({ accept: 'TRUE' }, false)).toBe(true);
});

test('a measure may be removed while the errand is investigated and it is not carried out', () => {
  expect(measureCanBeRemoved({ id: '1' }, true)).toBe(true);
  expect(measureCanBeRemoved({ id: '1', executed: '2026-09-09T00:00:00Z' }, true)).toBe(false);
  expect(measureCanBeRemoved({ id: '1' }, false)).toBe(false);
  expect(measureCanBeRemoved({}, true)).toBe(false);
});

test('an approval, whole or in part, decides when the measure runs; a rejection does not', () => {
  expect(measureDecisionSetsDates('TRUE')).toBe(true);
  expect(measureDecisionSetsDates('REWORK')).toBe(true);
  expect(measureDecisionSetsDates('FALSE')).toBe(false);
  expect(measureDecisionSetsDates('')).toBe(false);
});
