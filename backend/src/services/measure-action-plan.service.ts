import type { Errand, Measure, MeasureType, Role } from '@/data-contracts/supportmanagement/data-contracts';

import { EMPTY_VALUE } from './investigation-report.service';

/**
 * The action plan is the errand's measures as the Åtgärder tab shows them, in the same order and
 * with the same words for timing and decision, laid out for print. Labels are resolved from the
 * namespace metadata (type and registration role) and from the handler directory (people); a
 * value nothing resolves is shown as it is stored rather than dropped.
 */
interface MeasureActionPlanEntry {
  readonly number: number;
  readonly type: string;
  /** Genomförd, Planerad or Ej tidsatt - the same wording as the tab's status badge. */
  readonly status: string;
  /** The executed date, the planned range, or `Ej angivet`. */
  readonly dates: string;
  /** Förslag, Godkänd, Avslagen, Delvis godkänd, or the raw value for a decision Draken does not know. */
  readonly decision: string;
  readonly decisionCommentLabel: string;
  /** Empty when no comment was recorded; the template hides the field then. */
  readonly decisionComment: string;
  readonly responsible: string;
  readonly goal: string;
  readonly description: string;
  /** Display name with the registration role, e.g. "Anna Andersson (Enhetschef)". */
  readonly registeredBy: string;
  /** `YYYY-MM-DD`, or empty when the measure carries no creation timestamp. */
  readonly created: string;
}

interface MeasureActionPlanCounts {
  readonly total: number;
  readonly executed: number;
  readonly planned: number;
  readonly unscheduled: number;
}

export interface MeasureActionPlanModel {
  readonly title: string;
  readonly sequence: number;
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly errand: {
    readonly errandNumber: string;
    /** Empty when the errand has no title; the template omits it then. */
    readonly title: string;
  };
  readonly counts: MeasureActionPlanCounts;
  readonly measures: readonly MeasureActionPlanEntry[];
}

export interface BuildMeasureActionPlanModelInput {
  readonly measures: readonly Measure[];
  readonly measureTypes: readonly MeasureType[];
  readonly roles: readonly Role[];
  readonly errand: Pick<Errand, 'errandNumber' | 'title'>;
  readonly sequence: number;
  /** Already formatted for print, e.g. `2026-09-11 12:30`. */
  readonly generatedAt: string;
  readonly generatedBy: string;
  /** Resolves an AD account to a display name; undefined leaves the stored value in place. */
  readonly displayName?: (username: string) => string | undefined;
}

const ACTION_PLAN_TITLE = 'Handlingsplan';

const STOCKHOLM_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' });

/** `YYYY-MM-DD` in Swedish local time, matching what the tab shows; an unparsable value is returned as stored. */
export const formatActionPlanDate = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? value : STOCKHOLM_DATE.format(new Date(time));
};

const text = (value: string | undefined | null): string => (value && value.trim().length > 0 ? value.trim() : EMPTY_VALUE);

type Timing = { status: 'Genomförd' | 'Planerad' | 'Ej tidsatt'; dates: string };

const timingOf = (measure: Measure): Timing => {
  const executed = formatActionPlanDate(measure.executed);
  if (executed) return { status: 'Genomförd', dates: executed };
  const start = formatActionPlanDate(measure.plannedStart);
  const complete = formatActionPlanDate(measure.plannedComplete);
  if (start || complete) {
    const range = start && complete && start !== complete ? `${start} – ${complete}` : (start ?? complete ?? EMPTY_VALUE);
    return { status: 'Planerad', dates: range };
  }
  return { status: 'Ej tidsatt', dates: EMPTY_VALUE };
};

const decisionOf = (measure: Pick<Measure, 'accept'>): { decision: string; commentLabel: string } => {
  switch (measure.accept) {
    case 'TRUE':
      return { decision: 'Godkänd', commentLabel: 'Motivering till godkännande' };
    case 'FALSE':
      return { decision: 'Avslagen', commentLabel: 'Motivering till avslag' };
    case 'REWORK':
      return { decision: 'Delvis godkänd', commentLabel: 'Detta ska justeras' };
    default:
      return { decision: measure.accept ? measure.accept : 'Förslag', commentLabel: 'Beslutskommentar' };
  }
};

export const buildMeasureActionPlanModel = (input: BuildMeasureActionPlanModelInput): MeasureActionPlanModel => {
  const resolveName = (username: string | undefined): string | undefined => {
    if (!username?.trim()) return undefined;
    return input.displayName?.(username) || username;
  };
  const typeLabel = (measure: Measure): string => {
    const type = input.measureTypes.find(candidate => candidate.name === measure.type);
    return type?.displayName || measure.type || 'Typ saknas';
  };
  const roleLabel = (name: string | undefined): string | undefined => {
    if (!name) return undefined;
    return input.roles.find(role => role.name === name)?.displayName || name;
  };

  const counts = { total: input.measures.length, executed: 0, planned: 0, unscheduled: 0 };
  const measures = input.measures.map((measure, index): MeasureActionPlanEntry => {
    const timing = timingOf(measure);
    if (timing.status === 'Genomförd') counts.executed += 1;
    else if (timing.status === 'Planerad') counts.planned += 1;
    else counts.unscheduled += 1;
    const { decision, commentLabel } = decisionOf(measure);
    const creator = resolveName(measure.addedByUser);
    const role = roleLabel(measure.addedByRole);
    const registeredBy = creator ? `${creator}${role ? ` (${role})` : ''}` : (role ?? EMPTY_VALUE);
    return {
      number: index + 1,
      type: typeLabel(measure),
      status: timing.status,
      dates: timing.dates,
      decision,
      decisionCommentLabel: commentLabel,
      decisionComment: measure.acceptMotivation?.trim() ?? '',
      responsible: resolveName(measure.responsibleUser) ?? EMPTY_VALUE,
      goal: text(measure.goal),
      description: text(measure.description),
      registeredBy,
      created: formatActionPlanDate(measure.created) ?? '',
    };
  });

  return {
    title: ACTION_PLAN_TITLE,
    sequence: input.sequence,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    errand: {
      errandNumber: input.errand.errandNumber?.trim() || EMPTY_VALUE,
      title: input.errand.title?.trim() ?? '',
    },
    counts,
    measures,
  };
};

const ACTION_PLAN_FILE_PATTERN = /^Handlingsplan(?:_.*)?_(\d+)\.pdf$/iu;

/**
 * Action plans are numbered per errand like investigation reports, but nothing records them
 * besides the attachment list, so the next number is read from the names already attached. The
 * next number is one above the highest number among the remaining attachments.
 */
export const nextMeasureActionPlanSequence = (attachments: readonly { fileName?: string }[]): number => {
  const highest = attachments.reduce((max, attachment) => {
    const match = attachment.fileName?.match(ACTION_PLAN_FILE_PATTERN);
    const sequence = match ? Number(match[1]) : Number.NaN;
    return Number.isSafeInteger(sequence) && sequence > max ? sequence : max;
  }, 0);
  return highest + 1;
};

/** ASCII attachment names avoid whitespace and Unicode encoding differences in multipart headers. */
export const measureActionPlanFileName = (errandNumber: string | undefined, sequence: number): string => {
  const name = (errandNumber ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9-]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  return name ? `Handlingsplan_${name}_${sequence}.pdf` : `Handlingsplan_${sequence}.pdf`;
};

const STOCKHOLM_TIMESTAMP = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `YYYY-MM-DD HH:mm` in Swedish local time, for the generation stamp on the plan. */
export const formatActionPlanTimestamp = (date: Date): string => STOCKHOLM_TIMESTAMP.format(date);
