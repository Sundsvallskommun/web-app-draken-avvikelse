import type { Errand, Measure } from '@/data-contracts/supportmanagement/data-contracts';

import { isPlannedApprovedMeasure } from './support-measure-follow-up';

/** A planned measure together with the errand it belongs to, so an overview can link back to it. */
export interface PlannedSupportMeasure extends Measure {
  readonly errand: Pick<Errand, 'id' | 'errandNumber' | 'status'>;
}

/**
 * The upstream filter that narrows the errand list to errands with at least one open planned measure:
 * approved (fully or partly), planned with a date and not yet executed. Closed errands are left out;
 * no measure can be followed up there. Spring Filter reuses one join per path, so every `measures.*`
 * clause applies to the same measure row.
 *
 * This borrows the errand list because Support Management has no measure query across errands. The
 * better home is a `GET .../measures` there: paged and sorted per measure rather than per errand, a
 * slim payload instead of whole errands, a count for the sidebar, and a filter written on the measure
 * entity rather than resting on how the library joins. It is deliberately not built yet: the measure
 * model is still settling, and an API contract cut now would have to be cut again. Until then this
 * service is the only place that knows about the errand list; the snapshot it returns need not change.
 */
export const OPEN_PLANNED_MEASURES_FILTER =
  "(measures.accept:'TRUE' or measures.accept:'REWORK') and measures.executed is null" +
  " and (measures.plannedStart is not null or measures.plannedComplete is not null) and status!'SOLVED'";

/** Approved, dated and still ahead: the same selection the filter asks upstream for, applied to each errand's list. */
export const isOpenPlannedMeasure = (measure: Measure): boolean => isPlannedApprovedMeasure(measure) && !measure.executed;

/** The date the overview orders by: the deadline when set, otherwise the planned start. */
export const plannedMeasureDeadline = (measure: Pick<Measure, 'plannedStart' | 'plannedComplete'>): string | undefined =>
  measure.plannedComplete || measure.plannedStart || undefined;

/**
 * Flattens the errands' measures into one list ordered by deadline, nearest first. Errands are read page by
 * page while other users write, so an errand that moved between pages is kept once.
 */
export function collectOpenPlannedMeasures(errands: readonly Errand[]): PlannedSupportMeasure[] {
  const seen = new Set<string>();
  const collected: PlannedSupportMeasure[] = [];
  for (const errand of errands) {
    if (!errand.id || !errand.errandNumber || seen.has(errand.id)) continue;
    seen.add(errand.id);
    const summary = { id: errand.id, errandNumber: errand.errandNumber, status: errand.status };
    for (const measure of errand.measures ?? []) {
      if (isOpenPlannedMeasure(measure)) collected.push({ ...measure, errand: summary });
    }
  }
  return collected.sort(byDeadline);
}

function byDeadline(a: PlannedSupportMeasure, b: PlannedSupportMeasure): number {
  const left = Date.parse(plannedMeasureDeadline(a) ?? '');
  const right = Date.parse(plannedMeasureDeadline(b) ?? '');
  if (Number.isNaN(left) || Number.isNaN(right)) return Number(Number.isNaN(left)) - Number(Number.isNaN(right));
  return left - right || a.errand.errandNumber!.localeCompare(b.errand.errandNumber!, 'sv');
}
