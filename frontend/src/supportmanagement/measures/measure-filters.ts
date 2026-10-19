import type { Measure, MeasureType, Role } from '@common/data-contracts/supportmanagement/data-contracts';

import { type MeasureDecision, measureDecision } from './measure-decision';
import { measureTypeLabel } from './measure-types';

export type MeasureStatus = 'planned' | 'executed' | 'unscheduled';

export interface MeasureFilters {
  status: '' | MeasureStatus;
  decision: '' | MeasureDecision;
  role: string;
  type: string;
  text: string;
}

export const emptyMeasureFilters: MeasureFilters = { status: '', decision: '', role: '', type: '', text: '' };

export const measureStatus = (measure: Measure): MeasureStatus =>
  measure.executed ? 'executed' : measure.plannedStart || measure.plannedComplete ? 'planned' : 'unscheduled';

export const isMeasureFilterActive = (filters: MeasureFilters): boolean =>
  Boolean(filters.status || filters.decision || filters.role || filters.type || filters.text.trim());

export function filterMeasures(
  measures: readonly Measure[],
  filters: MeasureFilters,
  types: readonly MeasureType[]
): Measure[] {
  const needle = filters.text.trim().toLocaleLowerCase('sv');
  return measures.filter((measure) => {
    if (filters.status && measureStatus(measure) !== filters.status) return false;
    if (filters.decision && measureDecision(measure) !== filters.decision) return false;
    if (filters.role && measure.addedByRole !== filters.role) return false;
    if (filters.type && measure.type !== filters.type) return false;
    if (!needle) return true;
    return [
      measureTypeLabel(types, measure),
      measure.description,
      measure.goal,
      measure.responsibleUser,
      measure.acceptMotivation,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase('sv').includes(needle));
  });
}

/** Only roles and types that occur in the list are worth offering as choices. */
export const measureFilterOptions = (
  measures: readonly Measure[],
  types: readonly MeasureType[],
  roles: readonly Role[]
): { roles: { value: string; label: string }[]; types: { value: string; label: string }[] } => {
  const roleNames = [...new Set(measures.map((measure) => measure.addedByRole).filter(Boolean))] as string[];
  const typeNames = [...new Set(measures.map((measure) => measure.type).filter(Boolean))] as string[];
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'sv');
  return {
    roles: roleNames
      .map((name) => ({ value: name, label: roles.find((role) => role.name === name)?.displayName || name }))
      .sort(byLabel),
    types: typeNames.map((name) => ({ value: name, label: measureTypeLabel(types, { type: name }) })).sort(byLabel),
  };
};
