import type { Errand, Measure } from '@/data-contracts/supportmanagement/data-contracts';
import {
  collectOpenPlannedMeasures,
  isOpenPlannedMeasure,
  OPEN_PLANNED_MEASURES_FILTER,
  plannedMeasureDeadline,
} from '@/services/support-planned-measures';

const planned = (fields: Partial<Measure>): Measure => ({ id: 'm', accept: 'TRUE', plannedComplete: '2026-10-01T00:00:00Z', ...fields });
const errand = (fields: Partial<Errand>): Errand => ({ id: 'e', errandNumber: 'VOF-2026-0001', title: 'Titel', status: 'ONGOING', ...fields });

test.each([
  ['an approved planned measure', planned({}), true],
  ['a partly approved planned measure', planned({ accept: 'REWORK' }), true],
  ['a measure planned by start only', planned({ plannedComplete: undefined, plannedStart: '2026-09-20T00:00:00Z' }), true],
  ['a proposal (draft) even when it is planned', planned({ accept: undefined }), false],
  ['a proposal with an empty decision', planned({ accept: null }), false],
  ['a rejected proposal', planned({ accept: 'FALSE' }), false],
  ['an executed measure', planned({ executed: '2026-09-12T00:00:00Z' }), false],
  ['an approved measure without any planned date', planned({ plannedComplete: undefined }), false],
])('selects only approved, dated and not yet executed measures: %s', (_, measure, expected) => {
  expect(isOpenPlannedMeasure(measure)).toBe(expected);
});

test('the upstream filter asks for the same selection and leaves closed errands out', () => {
  expect(OPEN_PLANNED_MEASURES_FILTER).toBe(
    "(measures.accept:'TRUE' or measures.accept:'REWORK') and measures.executed is null" +
      " and (measures.plannedStart is not null or measures.plannedComplete is not null) and status!'SOLVED'",
  );
});

test('the deadline is the planned completion, falling back to the planned start', () => {
  expect(plannedMeasureDeadline({ plannedStart: '2026-09-20T00:00:00Z', plannedComplete: '2026-10-01T00:00:00Z' })).toBe('2026-10-01T00:00:00Z');
  expect(plannedMeasureDeadline({ plannedStart: '2026-09-20T00:00:00Z' })).toBe('2026-09-20T00:00:00Z');
  expect(plannedMeasureDeadline({})).toBeUndefined();
});

test('flattens the open planned measures of every errand, nearest deadline first, and ties the errand to each', () => {
  const late = planned({ id: 'late', plannedComplete: '2026-12-01T00:00:00Z' });
  const soon = planned({ id: 'soon', plannedComplete: '2026-09-20T00:00:00Z' });
  const startOnly = planned({ id: 'start-only', plannedComplete: undefined, plannedStart: '2026-10-15T00:00:00Z' });
  const proposal = planned({ id: 'proposal', accept: undefined });
  const done = planned({ id: 'done', executed: '2026-09-01T00:00:00Z' });
  const result = collectOpenPlannedMeasures([
    errand({ id: 'e1', errandNumber: 'VOF-2026-0001', measures: [late, proposal, done] }),
    errand({ id: 'e2', errandNumber: 'VOF-2026-0002', title: 'Andra', measures: [startOnly, soon] }),
  ]);
  expect(result.map(measure => measure.id)).toEqual(['soon', 'start-only', 'late']);
  // The errand's title is left out: the overview does not show it.
  expect(result[0].errand).toEqual({ id: 'e2', errandNumber: 'VOF-2026-0002', status: 'ONGOING' });
  expect(result[2].errand.errandNumber).toBe('VOF-2026-0001');
  expect(result[0]).toMatchObject({ accept: 'TRUE', plannedComplete: '2026-09-20T00:00:00Z' });
});

test('keeps an errand once when paging returned it twice and skips errands without an id or number', () => {
  const first = errand({ id: 'e1', measures: [planned({ id: 'm1' })] });
  const result = collectOpenPlannedMeasures([
    first,
    { ...first, measures: [planned({ id: 'm1' }), planned({ id: 'm2' })] },
    errand({ id: undefined, measures: [planned({ id: 'm3' })] }),
    errand({ id: 'e3', errandNumber: undefined, measures: [planned({ id: 'm4' })] }),
  ]);
  expect(result.map(measure => measure.id)).toEqual(['m1']);
});

test('orders same-day deadlines by errand number and undated ones last', () => {
  const result = collectOpenPlannedMeasures([
    errand({ id: 'e2', errandNumber: 'VOF-2026-0002', measures: [planned({ id: 'b' })] }),
    errand({ id: 'e1', errandNumber: 'VOF-2026-0001', measures: [planned({ id: 'a' }), planned({ id: 'undated', plannedComplete: 'not-a-date' })] }),
  ]);
  expect(result.map(measure => measure.id)).toEqual(['a', 'b', 'undated']);
});
