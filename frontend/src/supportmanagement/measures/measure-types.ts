import type { Measure, MeasureType } from '@common/data-contracts/supportmanagement/data-contracts';

/**
 * Render Draken's resolved choices; retain the saved type when editing historical measures. Types are
 * keyed by their metadata name, which is what a measure's `type` carries.
 */
export const selectableMeasureTypes = (
  types: readonly MeasureType[],
  availableTypes: readonly string[],
  currentType?: string
): MeasureType[] =>
  types
    .filter(
      (type) =>
        Boolean(type.name) && (type.name === currentType || (!type.deprecated && availableTypes.includes(type.name)))
    )
    .toSorted(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        (a.displayName || a.name).localeCompare(b.displayName || b.name, 'sv')
    );

export const measureTypeLabel = (types: readonly MeasureType[], measure: Pick<Measure, 'type'>): string => {
  const type = types.find((candidate) => candidate.name === measure.type);
  return type?.displayName || measure.type || 'Typ saknas';
};
