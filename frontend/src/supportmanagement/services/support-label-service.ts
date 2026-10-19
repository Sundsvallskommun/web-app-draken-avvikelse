import { Label } from '@common/data-contracts/supportmanagement/data-contracts';

import { SupportMetadata } from './support-metadata-service';

/**
 * Deprecated labels stay in the metadata so existing errands keep resolving them; the flag only governs
 * what can be picked, so option lists are filtered at render time. Deprecation is inherited by children.
 */

const isLabelDeprecated = (label?: Label): boolean => label?.deprecated === true;

/** Labels a user may pick. `keepIds` (the errand's own labels) are kept even when deprecated. */
const getSelectableLabels = (labels: Label[] | undefined, keepIds: (string | undefined)[] = []): Label[] => {
  const idsToKeep = new Set(keepIds.filter((id): id is string => !!id));
  return (labels ?? []).filter((label) => !isLabelDeprecated(label) || (!!label.id && idsToKeep.has(label.id)));
};

/** Selectable types of a category with their selectable subtypes inlined (see getSelectableGroupedLabels). */
export const getSelectableTypesForCategory = (
  category: Label | undefined,
  keepIds: (string | undefined)[] = []
): Label[] => getSelectableGroupedLabels(category?.labels, keepIds, isLabelDeprecated(category));

/** Top level (CATEGORY) labels a user may pick, in metadata order. */
export const getSelectableCategories = (metadata: SupportMetadata | undefined) =>
  getSelectableLabels(metadata?.labels?.labelStructure);

/** Selectable types across the structure, or within the given categories. */
export const getSelectableTypes = (
  metadata: SupportMetadata | undefined,
  categoryResourcePaths: string[] = []
): Label[] => {
  const categories = getSelectableCategories(metadata).filter(
    (category) =>
      categoryResourcePaths.length === 0 ||
      (!!category.resourcePath && categoryResourcePaths.includes(category.resourcePath))
  );
  return categories.flatMap((category) => getSelectableTypesForCategory(category));
};

/** Selectable subtypes across the structure, narrowed by category and/or type display name. */
export const getSelectableSubTypes = (
  metadata: SupportMetadata | undefined,
  categoryResourcePaths: string[] = [],
  typeDisplayNames: string[] = []
): Label[] => {
  const types = getSelectableTypes(metadata, categoryResourcePaths).filter(
    (type) => typeDisplayNames.length === 0 || (!!type.displayName && typeDisplayNames.includes(type.displayName))
  );
  return types.flatMap((type) => getSelectableLabels(type.labels));
};

export const sortLabelsByDisplayName = (labels: Label[] | undefined): Label[] =>
  [...(labels ?? [])].sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));

/** Levels of the categorization tree, top down. */
export const CATEGORIZATION_CLASSIFICATIONS = ['DEPARTMENT', 'CATEGORY', 'TYPE', 'SUBTYPE'];

/**
 * `parents` with their selectable children inlined: childless parents are leaves, parents with no
 * selectable children are dropped, below a deprecated parent (or `parentsDeprecated`) only `keepIds` remain.
 */
export const getSelectableGroupedLabels = (
  parents: Label[] | undefined,
  keepIds: (string | undefined)[] = [],
  parentsDeprecated = false
): Label[] => {
  const idsToKeep = new Set(keepIds.filter((id): id is string => !!id));
  const isKept = (label: Label) => !!label.id && idsToKeep.has(label.id);
  const selectableParents = parentsDeprecated ? (parents ?? []).filter(isKept) : getSelectableLabels(parents, keepIds);

  return selectableParents
    .map((parent) => ({
      parent,
      selectableChildren:
        parentsDeprecated || isLabelDeprecated(parent)
          ? (parent.labels ?? []).filter(isKept)
          : getSelectableLabels(parent.labels, keepIds),
    }))
    .filter(
      ({ parent, selectableChildren }) =>
        (parent.labels?.length ?? 0) === 0 || selectableChildren.length > 0 || isKept(parent)
    )
    .map(({ parent, selectableChildren }) => ({ ...parent, labels: selectableChildren }));
};

/** Labels at a depth (1 = top level) across the whole structure. */
export const getLabelsAtDepth = (labelStructure: Label[] | undefined, depth: number): Label[] => {
  let level = labelStructure ?? [];
  for (let i = 1; i < depth; i++) {
    level = level.flatMap((label) => label.labels ?? []);
  }
  return level;
};

/** The `classificationDisplayName` the labels share, else the fallback. */
export const getClassificationDisplayName = (labels: Label[], fallback: string): string =>
  labels.find((label) => label.classificationDisplayName)?.classificationDisplayName || fallback;

/** Display names of the given labels, de-duplicated and with missing names dropped. */
export const getUniqueLabelDisplayNames = (labels: Label[]): string[] =>
  Array.from(new Set(labels.map((label) => label.displayName).filter((name): name is string => !!name)));

/** Marker appended to a label that is shown but can no longer be chosen. */
const DEPRECATED_LABEL_SUFFIX = '(Utgått)';

/**
 * Effective (inherited) deprecation of every label, by id and by resource path: an errand's label copies
 * carry no flags and must be resolved back to the structure. Indexed once per structure.
 */
interface DeprecationIndex {
  byId: Map<string, boolean>;
  byResourcePath: Map<string, boolean>;
}

/** One index per metadata object; a refetch gets a fresh one. */
const deprecationIndexes = new WeakMap<SupportMetadata, DeprecationIndex>();

const buildDeprecationIndex = (labelStructure: Label[]): DeprecationIndex => {
  const index: DeprecationIndex = { byId: new Map(), byResourcePath: new Map() };

  const indexLevel = (labels: Label[], hasDeprecatedAncestor: boolean) => {
    for (const label of labels) {
      const deprecated = hasDeprecatedAncestor || isLabelDeprecated(label);
      if (label.id) {
        index.byId.set(label.id, deprecated);
      }
      if (label.resourcePath) {
        index.byResourcePath.set(label.resourcePath, deprecated);
      }
      indexLevel(label.labels ?? [], deprecated);
    }
  };

  indexLevel(labelStructure, false);
  return index;
};

const getDeprecationIndex = (metadata: SupportMetadata | undefined): DeprecationIndex | undefined => {
  const labelStructure = metadata?.labels?.labelStructure;
  if (!metadata || !labelStructure?.length) {
    return undefined;
  }

  const cached = deprecationIndexes.get(metadata);
  if (cached) {
    return cached;
  }

  const index = buildDeprecationIndex(labelStructure);
  deprecationIndexes.set(metadata, index);
  return index;
};

/** Whether the label or an ancestor is deprecated; false when the label or the metadata is unknown. */
const isLabelPathDeprecated = (label: Label | undefined, metadata: SupportMetadata | undefined): boolean => {
  const index = getDeprecationIndex(metadata);
  if (!index || !label) {
    return false;
  }

  const byId = label.id ? index.byId.get(label.id) : undefined;
  if (byId !== undefined) {
    return byId;
  }

  return (label.resourcePath ? index.byResourcePath.get(label.resourcePath) : undefined) ?? false;
};

/** Display name, suffixed with '(Utgått)' when the label can no longer be chosen. */
export const getLabelDisplayName = (label: Label | undefined, metadata: SupportMetadata | undefined): string => {
  const displayName = label?.displayName || label?.resourcePath || '';
  if (!displayName) {
    return '';
  }
  return isLabelPathDeprecated(label, metadata) ? `${displayName} ${DEPRECATED_LABEL_SUFFIX}` : displayName;
};
