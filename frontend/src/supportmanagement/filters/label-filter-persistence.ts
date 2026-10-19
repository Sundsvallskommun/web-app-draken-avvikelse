import type { LabelFilterSelection } from './label-filter-projector';

export const SUPPORT_MANAGEMENT_LABEL_FILTER_PARAMETER = 'labelFilter';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCanonicalIdentityPart = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.trim() === value &&
  ![...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });

const readSelection = (value: unknown): LabelFilterSelection | undefined => {
  if (
    !isRecord(value) ||
    !isCanonicalIdentityPart(value.groupKey) ||
    !isCanonicalIdentityPart(value.fieldKey) ||
    !isCanonicalIdentityPart(value.resourcePath)
  ) {
    return undefined;
  }

  return Object.freeze({
    groupKey: value.groupKey,
    fieldKey: value.fieldKey,
    resourcePath: value.resourcePath,
  });
};

/**
 * Reads the persisted browser value as untrusted data. A malformed entry
 * invalidates the complete selection instead of partially applying a filter
 * the user did not choose.
 */
export const parsePersistedLabelFilterSelections = (value: unknown): readonly LabelFilterSelection[] => {
  let candidate: unknown = value;
  if (typeof value === 'string') {
    try {
      candidate = JSON.parse(value) as unknown;
    } catch {
      return Object.freeze([]);
    }
  }

  if (!Array.isArray(candidate)) return Object.freeze([]);
  const selections = candidate.map(readSelection);
  if (selections.includes(undefined)) return Object.freeze([]);
  return Object.freeze(selections as LabelFilterSelection[]);
};

/** Uses the backend request contract without introducing a second identity. */
export const serializeLabelFilterSelections = (selections: readonly LabelFilterSelection[]): string =>
  JSON.stringify(selections.map(({ groupKey, fieldKey, resourcePath }) => ({ groupKey, fieldKey, resourcePath })));

export const labelFilterSelectionsEqual = (
  left: readonly LabelFilterSelection[],
  right: readonly LabelFilterSelection[]
): boolean =>
  left.length === right.length &&
  left.every(
    (selection, index) =>
      selection.groupKey === right[index]?.groupKey &&
      selection.fieldKey === right[index]?.fieldKey &&
      selection.resourcePath === right[index]?.resourcePath
  );
