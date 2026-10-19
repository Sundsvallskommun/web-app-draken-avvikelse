import type { Measure, Role } from '@common/data-contracts/supportmanagement/data-contracts';
import dayjs from 'dayjs';

import { measureContentIsLocked, measureIsApproved } from '../measure-decision';
import type { MeasureChanges, NewMeasure } from '../support-measure-service';

export interface MeasureForm {
  type: string;
  addedByRole: string;
  timing: '' | 'planned' | 'executed';
  responsibleUser: string;
  goal: string;
  description: string;
  plannedStart: string;
  plannedComplete: string;
  executed: string;
}

export const measureFormValues = (measure?: Measure, creationRoles: readonly Role[] = []): MeasureForm => ({
  type: measure?.type ?? '',
  addedByRole: measure ? measure.addedByRole ?? '' : creationRoles.length === 1 ? creationRoles[0].name : '',
  timing: measure?.executed ? 'executed' : measure?.plannedStart || measure?.plannedComplete ? 'planned' : '',
  responsibleUser: measure?.responsibleUser ?? '',
  goal: measure?.goal ?? '',
  description: measure?.description ?? '',
  plannedStart: measure?.plannedStart ? dayjs(measure.plannedStart).format('YYYY-MM-DD') : '',
  plannedComplete: measure?.plannedComplete ? dayjs(measure.plannedComplete).format('YYYY-MM-DD') : '',
  executed: measure?.executed ? dayjs(measure.executed).format('YYYY-MM-DD') : '',
});

export type MeasureFormErrors = Partial<Record<keyof MeasureForm, string>>;

export type MeasureDateField = 'plannedStart' | 'plannedComplete' | 'executed';
export type PlannedMeasureDateField = Exclude<MeasureDateField, 'executed'>;

/** What each date is asked as, wherever it is entered: the form or an approval. */
export const measureDateLabels: Record<MeasureDateField, string> = {
  plannedStart: 'När ska åtgärden påbörjas?',
  plannedComplete: 'När ska åtgärden vara klar?',
  executed: 'När genomfördes åtgärden?',
};

/** Whether this date field holds a planned date, which may be locked, rather than the executed one. */
export const plannedDateField = (field: MeasureDateField): PlannedMeasureDateField | undefined =>
  field === 'executed' ? undefined : field;

/** The same timing choice controls both visible fields and the dates sent to the API. */
export function measureDateFields(timing: MeasureForm['timing']): readonly MeasureDateField[] {
  switch (timing) {
    case 'planned':
      return ['plannedStart', 'plannedComplete'];
    case 'executed':
      return ['executed'];
    default:
      return [];
  }
}

export interface MeasureFormPolicy {
  /** Only a deciding role, or an already accepted measure, may be reported as executed. */
  canExecute: boolean;
  /** A proposal has no timing to choose and no dates to give; see `measureIsUndatedProposal`. */
  undatedProposal?: boolean;
  /** Today as YYYY-MM-DD; an executed date may not lie after it. Injectable for tests. */
  today?: string;
}

export const todayIsoDate = (): string => dayjs().format('YYYY-MM-DD');

/** A date picked in the form as the timestamp the API stores. */
export const measureDateTime = (date: string): string => dayjs(date).format('YYYY-MM-DDTHH:mm:ssZ');

/** What is missing or wrong in a planned measure's dates, wherever they are entered: the form or an approval. */
export function plannedMeasureDateErrors(
  plannedStart: string,
  plannedComplete: string
): Pick<MeasureFormErrors, 'plannedStart' | 'plannedComplete'> {
  const errors: Pick<MeasureFormErrors, 'plannedStart' | 'plannedComplete'> = {};
  if (!plannedStart) errors.plannedStart = 'Ange när åtgärden ska påbörjas.';
  if (!plannedComplete) errors.plannedComplete = 'Ange när åtgärden ska vara klar.';
  if (plannedStart && plannedComplete && plannedComplete < plannedStart) {
    errors.plannedComplete = 'Slutdatum får inte vara före startdatum.';
  }
  return errors;
}

/**
 * A proposal is registered without dates: when the business starts on a measure is not for the one who proposes it
 * to say. The dates are asked for when the proposal is approved. Holds while the measure is undecided and its role
 * only proposes - which role that is, is the role configuration's to say.
 */
export function measureIsUndatedProposal(existing: Measure | undefined, roleDecides: boolean): boolean {
  return !roleDecides && !existing?.accept && !existing?.executed;
}

/**
 * Whether a planned date can no longer be edited in the form. The start never changes once set. An approved
 * measure's end is moved with Ändra slutdatum, by whoever follows the measure up. The BFF holds the same rules.
 */
export const measurePlannedDateIsLocked = (measure: Measure | undefined, field: PlannedMeasureDateField): boolean =>
  field === 'plannedStart' ? Boolean(measure?.plannedStart) : Boolean(measure && measureIsApproved(measure));

/** Why a locked planned date cannot be edited, said beneath it. */
export const lockedMeasureDateHelp: Record<PlannedMeasureDateField, string> = {
  plannedStart: 'Startdatumet kan inte ändras.',
  plannedComplete: 'Slutdatumet ändras med Ändra slutdatum, av den som följer upp åtgärden.',
};

/** Executed measures are facts, not proposals, so proposing roles can only register planned ones. */
export function measureCanExecute(existing: Measure | undefined, roleDecides: boolean): boolean {
  return existing ? measureIsApproved(existing) || Boolean(existing.executed) : roleDecides;
}

export function measureFormErrors(
  values: MeasureForm,
  existing?: Measure,
  policy: MeasureFormPolicy = { canExecute: true }
): MeasureFormErrors {
  const errors: MeasureFormErrors = {};
  if (!values.type) errors.type = 'Välj typ av åtgärd.';
  if (!existing && !values.addedByRole) errors.addedByRole = 'Välj vilken roll åtgärden registreras för.';
  if (!values.description.trim()) errors.description = 'Beskriv vad åtgärden innebär.';
  if (!values.goal.trim()) errors.goal = 'Beskriv vad åtgärden ska uppnå.';
  if (policy.undatedProposal) return errors;
  switch (values.timing) {
    case 'planned':
      if (existing?.executed) errors.timing = 'En genomförd åtgärd kan inte återställas till planerad.';
      Object.assign(errors, plannedMeasureDateErrors(values.plannedStart, values.plannedComplete));
      break;
    case 'executed':
      if (!policy.canExecute) errors.timing = 'Förslag kan bara registreras som planerade åtgärder.';
      if (!values.executed) errors.executed = 'Ange när åtgärden genomfördes.';
      else if (values.executed > (policy.today ?? todayIsoDate())) {
        errors.executed = 'Genomfört datum kan inte ligga i framtiden.';
      }
      break;
    default:
      errors.timing = 'Välj om åtgärden är genomförd eller planerad.';
  }
  return errors;
}

/** The editable fields; addedByRole is fixed for an existing measure and never rebases. */
const REBASABLE_FIELDS = [
  'type',
  'timing',
  'responsibleUser',
  'goal',
  'description',
  'plannedStart',
  'plannedComplete',
  'executed',
] as const satisfies readonly (keyof MeasureForm)[];

const FIELD_LABELS: Record<(typeof REBASABLE_FIELDS)[number], string> = {
  type: 'Typ av åtgärd',
  timing: 'Genomförd eller planerad',
  responsibleUser: 'Ansvarig',
  goal: 'Mål',
  description: 'Beskrivning',
  plannedStart: 'Startdatum',
  plannedComplete: 'Slutdatum',
  executed: 'Genomfört datum',
};

export interface MeasureFormRebase {
  /** Values to adopt from the current measure: the user never touched these, so the other writer owns them. */
  adopt: Partial<MeasureForm>;
  /** Labels of fields both writers changed, differently. The draft wins, so the user has to be told. */
  conflicts: string[];
}

/**
 * Merges an open draft onto the measure as it now stands upstream, given the measure the draft started from.
 * Keeping the whole draft would silently revert every field the other writer changed as soon as the retry
 * passed If-Match, and discarding it would throw away typing that is usually still valid. So: fields only the
 * other writer moved are adopted, fields the user typed into stay, and the overlap is reported rather than
 * resolved - only the user knows whose wording should win.
 */
export function measureFormRebase(
  values: MeasureForm,
  touched: Partial<Record<keyof MeasureForm, unknown>>,
  baseline: Measure,
  current: Measure
): MeasureFormRebase {
  const before = measureFormValues(baseline);
  const upstream = measureFormValues(current);
  const adopt: Partial<MeasureForm> = {};
  const conflicts: string[] = [];
  for (const key of REBASABLE_FIELDS) {
    // Only what moved upstream is any of our business; a field the other writer left alone stays as typed.
    if (upstream[key] === before[key]) continue;
    if (touched[key]) conflicts.push(FIELD_LABELS[key]);
    // Key and value are read from the same MeasureForm, so the pairing holds; iterating widens the key to a
    // union of the field names and TypeScript can no longer see that the value belongs to this one.
    else (adopt as Record<string, string>)[key] = upstream[key];
  }
  return { adopt, conflicts };
}

/** Send only edited basic fields, preserving audit/decision fields and exact timestamps on untouched dates. */
export function measureFormChanges(
  values: MeasureForm,
  existing: Measure,
  errandIsInvestigated = false
): MeasureChanges {
  const initial = measureFormValues(existing);
  const changes: MeasureChanges = {};
  for (const key of ['type', 'responsibleUser', 'goal', 'description'] as const) {
    if (key !== 'responsibleUser' && measureContentIsLocked(existing, errandIsInvestigated)) continue;
    // Responsible is free text, so surrounding whitespace is not a change worth sending.
    const value = key === 'responsibleUser' ? values[key].trim() : values[key];
    if (value !== initial[key]) changes[key] = value;
  }
  for (const key of measureDateFields(values.timing)) {
    const plannedKey = plannedDateField(key);
    if (plannedKey && measurePlannedDateIsLocked(existing, plannedKey)) continue;
    if (values[key] && values[key] !== initial[key]) changes[key] = measureDateTime(values[key]);
  }
  return changes;
}

export function measureFormCreate(values: MeasureForm): NewMeasure {
  return {
    ...measureFormChanges(values, {}),
    type: values.type,
    addedByRole: values.addedByRole,
    goal: values.goal,
    description: values.description,
  };
}
