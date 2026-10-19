import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';

/** How far below the label tree's roots the legacy filters' labels sit: types one level down, subtypes two. */
export const LEGACY_LABEL_TYPE_DEPTH = 1;
export const LEGACY_LABEL_SUBTYPE_DEPTH = 2;

const labelsAtDepth = (labels: readonly Label[] | undefined, depth: number): Label[] =>
  depth === 0 ? [...(labels ?? [])] : (labels ?? []).flatMap((label) => labelsAtDepth(label.labels, depth - 1));

/**
 * The resource paths the overview's legacy type or subtype filter asks for: every label at that depth of the tree
 * whose display name was chosen. A display name several labels share asks for all of them.
 */
export const legacyLabelFilterResourcePaths = (
  labelStructure: readonly Label[] | undefined,
  displayNames: readonly string[],
  depth: number
): string[] =>
  labelsAtDepth(labelStructure, depth)
    .filter((label) => label.displayName !== undefined && displayNames.includes(label.displayName))
    .map((label) => label.resourcePath ?? '');
