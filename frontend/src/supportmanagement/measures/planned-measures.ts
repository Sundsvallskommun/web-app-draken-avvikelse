import type { Measure, MeasureType } from '@common/data-contracts/supportmanagement/data-contracts';
import dayjs from 'dayjs';

import { measureTypeLabel } from './measure-types';

/** A planned measure with the errand it belongs to, as the BFF's planned overview returns it. */
export interface PlannedSupportMeasure extends Measure {
  errand: { id: string; errandNumber: string; status?: string };
}

/** The date the overview orders by: the deadline when set, otherwise the planned start. */
export const plannedMeasureDeadline = (
  measure: Pick<Measure, 'plannedStart' | 'plannedComplete'>
): string | undefined => measure.plannedComplete || measure.plannedStart || undefined;

/** A measure whose completion date has passed without it being executed. A passed start date alone is not late. */
export const isPlannedMeasureOverdue = (measure: Pick<Measure, 'plannedComplete'>, today = dayjs()): boolean =>
  Boolean(measure.plannedComplete) && dayjs(measure.plannedComplete).isBefore(today.startOf('day'));

/** Free-text match over what the overview shows: the errand number, the measure type and its content. */
export function filterPlannedMeasures(
  measures: readonly PlannedSupportMeasure[],
  text: string,
  types: readonly MeasureType[]
): PlannedSupportMeasure[] {
  const needle = text.trim().toLocaleLowerCase('sv');
  if (!needle) return [...measures];
  return measures.filter((measure) =>
    [
      measure.errand.errandNumber,
      measureTypeLabel(types, measure),
      measure.description,
      measure.goal,
      measure.responsibleUser,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase('sv').includes(needle))
  );
}

/** A span of days, each written `YYYY-MM-DD`; an empty end bounds nothing. */
export interface PlannedMeasureDateRange {
  readonly from: string;
  readonly to: string;
}

export const emptyPlannedMeasureDateRange: PlannedMeasureDateRange = { from: '', to: '' };

export const isPlannedMeasureDateRangeSet = (range: PlannedMeasureDateRange): boolean =>
  Boolean(range.from || range.to);

/**
 * The measures whose deadline - the date the agenda orders them by - falls within the span, both ends included.
 * The day is read in the handler's own time zone, as the agenda shows it. A span that is set leaves out a measure
 * without any date, which the agenda could not place in it.
 */
export function filterPlannedMeasuresByDate(
  measures: readonly PlannedSupportMeasure[],
  range: PlannedMeasureDateRange
): PlannedSupportMeasure[] {
  if (!isPlannedMeasureDateRangeSet(range)) return [...measures];
  return measures.filter((measure) => {
    // Asked for the value first: dayjs reads a missing date as now.
    const value = plannedMeasureDeadline(measure);
    const deadline = dayjs(value);
    if (!value || !deadline.isValid()) return false;
    const day = deadline.format('YYYY-MM-DD');
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  });
}

/** The agenda's time buckets, in the order they are shown. */
export type PlannedMeasureBucket = 'overdue' | 'soon' | 'later';

export interface PlannedMeasureGroup {
  bucket: PlannedMeasureBucket;
  label: string;
  measures: PlannedSupportMeasure[];
}

const bucketLabels: Record<PlannedMeasureBucket, string> = {
  overdue: 'Försenade',
  soon: 'Kommande två veckor',
  later: 'Senare',
};

/** How far ahead "soon" reaches, in days from today inclusive. */
const SOON_HORIZON_DAYS = 14;

/**
 * Places a measure in its time bucket. Only a passed completion date makes it late; a measure that is
 * planned by start date alone and already started is simply current work, so it lands among the soon ones.
 */
export function plannedMeasureBucket(measure: PlannedSupportMeasure, today = dayjs()): PlannedMeasureBucket {
  if (isPlannedMeasureOverdue(measure, today)) return 'overdue';
  const deadline = dayjs(plannedMeasureDeadline(measure));
  if (!deadline.isValid()) return 'later';
  return deadline.isBefore(today.startOf('day').add(SOON_HORIZON_DAYS + 1, 'day')) ? 'soon' : 'later';
}

/** Groups the (already deadline-ordered) list into the buckets that have something in them. */
export function groupPlannedMeasures(
  measures: readonly PlannedSupportMeasure[],
  today = dayjs()
): PlannedMeasureGroup[] {
  const buckets: PlannedMeasureBucket[] = ['overdue', 'soon', 'later'];
  return buckets
    .map((bucket) => ({
      bucket,
      label: bucketLabels[bucket],
      measures: measures.filter((measure) => plannedMeasureBucket(measure, today) === bucket),
    }))
    .filter((group) => group.measures.length > 0);
}

const monthAbbreviations = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** The deadline as the agenda shows it: "10 sep", with the year added only when it is not this year. */
export function formatDeadlineDay(value: string | undefined, today = dayjs()): string {
  const date = dayjs(value);
  if (!value || !date.isValid()) return '–';
  const day = `${date.date()} ${monthAbbreviations[date.month()]}`;
  return date.year() === today.year() ? day : `${day} ${date.year()}`;
}

/** Whole days between today and the deadline, in words. */
export function describeDeadlineDistance(value: string | undefined, today = dayjs()): string {
  const date = dayjs(value);
  if (!value || !date.isValid()) return '';
  const days = date.startOf('day').diff(today.startOf('day'), 'day');
  if (days === 0) return 'i dag';
  if (days === 1) return 'i morgon';
  if (days === -1) return 'i går';
  return days > 0 ? `om ${days} dagar` : `${-days} dagar sedan`;
}
