import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';

import { normalizeSupportManagementResourcePath } from '../../../services/supportmanagement-path';
import type { AvvikelseClassificationLabelTree } from '../avvikelse-classification-policy';
import type { LabelClassificationCatalog, LabelClassificationSelection } from './label-classification.types';

export interface LabelClassificationLegalBaseRule {
  readonly legalBase: string;
  readonly allowedClassificationCategories: readonly string[];
}

const normalizeClassification = (classification: string | undefined): string =>
  (classification ?? '').trim().replaceAll('_', '-').toUpperCase();

const normalizeResourcePath = normalizeSupportManagementResourcePath;

const isClassification = (label: Label, classification: string): boolean =>
  normalizeClassification(label.classification) === normalizeClassification(classification);

const labelCode = (label: Label): string => label.resourcePath || label.id || label.resourceName;

const labelResourceValue = (label: Label): string => label.resourcePath || label.resourceName;

const labelDisplayName = (label: Label): string => label.displayName || label.resourceName || labelCode(label);

const hasSameIdentity = (left: Label, right: Label): boolean => {
  if (left.id && right.id && left.id === right.id) {
    return true;
  }

  if (left.resourcePath && right.resourcePath) {
    return normalizeResourcePath(left.resourcePath) === normalizeResourcePath(right.resourcePath);
  }

  return (
    !left.id &&
    !right.id &&
    !left.resourcePath &&
    !right.resourcePath &&
    normalizeClassification(left.classification) === normalizeClassification(right.classification) &&
    left.resourceName === right.resourceName
  );
};

const withoutChildren = ({ labels: _labels, ...label }: Label): Label => label;

const sortLabels = (labels: readonly Label[]): Label[] =>
  [...labels].sort((left, right) => labelDisplayName(left).localeCompare(labelDisplayName(right), 'sv'));

const configuredLabelResource = (label: Label): string | undefined =>
  typeof label.resourcePath === 'string' && label.resourcePath.trim().length > 0
    ? label.resourcePath
    : label.resourceName;

const isConfiguredRoot = (label: Label, labelTree: AvvikelseClassificationLabelTree): boolean =>
  normalizeResourcePath(configuredLabelResource(label)) === normalizeResourcePath(labelTree.root.resource) &&
  isClassification(label, labelTree.root.classification);

const requireConfiguredRoot = (
  labelStructure: readonly Label[],
  labelTree: AvvikelseClassificationLabelTree
): Label => {
  const roots = labelStructure.filter((label) => isConfiguredRoot(label, labelTree));
  if (roots.length !== 1) {
    throw new Error(
      `Support Management classification metadata expected one configured root ${labelTree.root.resource}/${labelTree.root.classification}, found ${roots.length}`
    );
  }
  return roots[0];
};

const findTypeLabels = (labels: readonly Label[] | undefined, labelTree: AvvikelseClassificationLabelTree): Label[] => {
  const typeLabels: Label[] = [];

  const visit = (nodes: readonly Label[]) => {
    nodes.forEach((node) => {
      if (isClassification(node, labelTree.typeClassification)) {
        typeLabels.push(node);
        return;
      }

      if (!isClassification(node, labelTree.categoryClassification) && node.labels?.length) {
        visit(node.labels);
      }
    });
  };

  visit(labels ?? []);
  return sortLabels(typeLabels);
};

interface AvvikelseLabelClassificationBinding {
  readonly owner?: Label;
  readonly category: Label;
  readonly types: readonly Label[];
}

export interface AvvikelseLabelClassificationModel {
  readonly catalog: LabelClassificationCatalog;
  readonly bindings: readonly AvvikelseLabelClassificationBinding[];
  readonly labelTree: AvvikelseClassificationLabelTree;
}

export type PersistedIafLabelClassificationState =
  | 'known-valid'
  | 'legacy-unknown'
  | 'known-disallowed-legal-base'
  | 'known-missing-required-type'
  | 'known-inconsistent'
  | 'missing-classification';

interface PersistedIafLabelClassification {
  readonly labels?: readonly Label[];
  readonly category?: string;
  readonly type?: string;
  readonly subType?: string;
}

const getAllowedOwnerIdentifiers = (
  legalBases: readonly string[],
  legalBaseRules: readonly LabelClassificationLegalBaseRule[]
): ReadonlySet<string> => {
  const allowedOwnerIdentifiers = new Set<string>();
  const selectedLegalBases = new Set(legalBases.map((legalBase) => legalBase.trim().toUpperCase()));

  legalBaseRules
    .filter(({ legalBase }) => selectedLegalBases.has(legalBase.trim().toUpperCase()))
    .flatMap(({ allowedClassificationCategories }) => allowedClassificationCategories)
    .forEach((category) => {
      const normalizedCategory = normalizeResourcePath(category);
      if (!normalizedCategory) return;
      allowedOwnerIdentifiers.add(normalizedCategory);
      allowedOwnerIdentifiers.add(normalizedCategory.split('/').at(-1) ?? normalizedCategory);
    });

  return allowedOwnerIdentifiers;
};

const belongsToAllowedLegalBase = (owner: Label | undefined, allowedOwnerIdentifiers: ReadonlySet<string>): boolean =>
  Boolean(
    owner &&
      [owner.resourcePath, owner.resourceName].some(
        (identifier) => identifier && allowedOwnerIdentifiers.has(normalizeResourcePath(identifier))
      )
  );

const bindingOwnerValue = (binding: AvvikelseLabelClassificationBinding): string =>
  labelResourceValue(binding.owner ?? binding.category);

const hasPersistedProvisionOwner = (
  binding: AvvikelseLabelClassificationBinding,
  ownerValue: string | undefined
): boolean =>
  Boolean(
    binding.owner &&
      [binding.owner.resourcePath, binding.owner.resourceName].some(
        (identifier) => normalizeResourcePath(identifier) === normalizeResourcePath(ownerValue)
      )
  );

const hasPersistedTypeWithinProvisionOwner = (
  binding: AvvikelseLabelClassificationBinding,
  typeValue: string | undefined
): boolean => {
  if (!binding.owner) return false;

  const persistedType = normalizeResourcePath(typeValue);
  return [binding.owner.resourcePath, binding.owner.resourceName].some((identifier) => {
    const ownerPath = normalizeResourcePath(identifier);
    return Boolean(ownerPath && (persistedType === ownerPath || persistedType.startsWith(`${ownerPath}/`)));
  });
};

/**
 * Adapts the fixed IAF/VOF classification tree to the two choices shown in
 * Draken. The configured root is a container, the configured owner is retained
 * for persistence, and category/type are exposed as the editable choices.
 * The Iaf-prefixed symbols are retained until the parallel UI rewrite lands;
 * their behavior is profile-driven and no longer tied to an application name.
 */
export const createAvvikelseLabelClassificationModel = (
  labelStructure: readonly Label[] | undefined,
  labelTree: AvvikelseClassificationLabelTree | undefined,
  legalBases?: readonly string[],
  legalBaseRules: readonly LabelClassificationLegalBaseRule[] = []
): AvvikelseLabelClassificationModel => {
  if (!labelTree) {
    throw new Error('The IAF/VOF investigation classification rule is missing label-tree semantics');
  }
  if (labelStructure === undefined) {
    return {
      catalog: { code: `${labelTree.root.resource}_CLASSIFICATION`, displayName: labelTree.root.resource, types: [] },
      bindings: [],
      labelTree,
    };
  }
  const categoryRoot = requireConfiguredRoot(labelStructure, labelTree);
  const bindings: AvvikelseLabelClassificationBinding[] = [];

  const visit = (nodes: readonly Label[], owner?: Label) => {
    nodes.forEach((node) => {
      if (isClassification(node, labelTree.categoryClassification)) {
        bindings.push({ owner, category: node, types: findTypeLabels(node.labels, labelTree) });
        return;
      }

      const nextOwner = isClassification(node, labelTree.ownerClassification) ? node : owner;
      if (node.labels?.length) {
        visit(node.labels, nextOwner);
      }
    });
  };

  visit(categoryRoot.labels ?? []);

  const allowedOwnerIdentifiers =
    legalBases === undefined ? undefined : getAllowedOwnerIdentifiers(legalBases, legalBaseRules);
  const filteredBindings = allowedOwnerIdentifiers
    ? bindings.filter(({ owner }) => belongsToAllowedLegalBase(owner, allowedOwnerIdentifiers))
    : bindings;
  const sortedBindings = [...filteredBindings].sort((left, right) =>
    labelDisplayName(left.category).localeCompare(labelDisplayName(right.category), 'sv')
  );

  return {
    catalog: {
      code: `${labelTree.root.resource}_CLASSIFICATION`,
      displayName: labelTree.root.resource,
      types: sortedBindings.map(({ category, types }) => ({
        code: labelCode(category),
        displayName: labelDisplayName(category),
        subtypes: types.map((type) => ({
          code: labelCode(type),
          displayName: labelDisplayName(type),
        })),
      })),
    },
    bindings: sortedBindings,
    labelTree,
  };
};

const classificationReferencesType = (classification: PersistedIafLabelClassification, type: Label): boolean =>
  normalizeResourcePath(labelResourceValue(type)) === normalizeResourcePath(classification.subType) ||
  classification.labels?.some((label) => hasSameIdentity(label, type)) === true;

const getMissingBindingState = (
  completeModel: AvvikelseLabelClassificationModel,
  classification: PersistedIafLabelClassification,
  labelStructure: readonly Label[] | undefined,
  labelTree: AvvikelseClassificationLabelTree,
  legalBases: readonly string[],
  legalBaseRules: readonly LabelClassificationLegalBaseRule[]
): PersistedIafLabelClassificationState => {
  // An older category/type may no longer exist in metadata, but its persisted provision-category
  // still identifies the legal-base owner. Preserve it only while that owner remains allowed.
  const persistedCategoryOwner = completeModel.bindings.find((candidate) =>
    hasPersistedProvisionOwner(candidate, classification.category)
  )?.owner;
  const persistedTypeOwner = completeModel.bindings.find((candidate) =>
    hasPersistedTypeWithinProvisionOwner(candidate, classification.type)
  )?.owner;
  if (persistedCategoryOwner && persistedTypeOwner && !hasSameIdentity(persistedCategoryOwner, persistedTypeOwner)) {
    return 'known-inconsistent';
  }

  const persistedOwner = persistedTypeOwner ?? persistedCategoryOwner;
  if (!persistedOwner) return 'legacy-unknown';
  const contextualModel = createAvvikelseLabelClassificationModel(
    labelStructure,
    labelTree,
    legalBases,
    legalBaseRules
  );
  const persistedOwnerIsAllowed = contextualModel.bindings.some(
    (candidate) => candidate.owner && hasSameIdentity(candidate.owner, persistedOwner)
  );
  return persistedOwnerIsAllowed ? 'legacy-unknown' : 'known-disallowed-legal-base';
};

export const getPersistedAvvikelseLabelClassificationState = (
  labelStructure: readonly Label[] | undefined,
  labelTree: AvvikelseClassificationLabelTree,
  legalBases: readonly string[],
  classification: PersistedIafLabelClassification,
  legalBaseRules: readonly LabelClassificationLegalBaseRule[] = []
): PersistedIafLabelClassificationState => {
  if (!classification.category?.trim() || !classification.type?.trim()) return 'missing-classification';

  const completeModel = createAvvikelseLabelClassificationModel(labelStructure, labelTree);
  if (completeModel.bindings.length === 0) return 'legacy-unknown';

  // This strategy persists the selected configured category resource in classification.type.
  // Resolve that exact raw value before considering labels, which may contain stale references.
  const binding = completeModel.bindings.find(
    ({ category }) => normalizeResourcePath(labelResourceValue(category)) === normalizeResourcePath(classification.type)
  );
  if (!binding) {
    return getMissingBindingState(completeModel, classification, labelStructure, labelTree, legalBases, legalBaseRules);
  }

  const expectedOwner = bindingOwnerValue(binding);
  if (normalizeResourcePath(expectedOwner) !== normalizeResourcePath(classification.category)) {
    return 'known-inconsistent';
  }

  const contextualModel = createAvvikelseLabelClassificationModel(
    labelStructure,
    labelTree,
    legalBases,
    legalBaseRules
  );
  if (!contextualModel.bindings.some(({ category }) => hasSameIdentity(category, binding.category))) {
    return 'known-disallowed-legal-base';
  }
  if (binding.types.length === 0) return 'known-valid';

  const referencesKnownType = binding.types.some((type) => classificationReferencesType(classification, type));
  if (referencesKnownType) return 'known-valid';

  const hasPersistedTypeEvidence =
    Boolean(classification.subType?.trim()) ||
    classification.labels?.some((label) => isClassification(label, labelTree.typeClassification)) === true;
  if (!hasPersistedTypeEvidence) return 'known-missing-required-type';

  const typeKnownInAnotherBinding = completeModel.bindings.some(
    (candidate) =>
      !hasSameIdentity(candidate.category, binding.category) &&
      candidate.types.some((type) => classificationReferencesType(classification, type))
  );

  return typeKnownInAnotherBinding ? 'known-inconsistent' : 'legacy-unknown';
};

const getAvvikelseLabelClassificationSelection = (
  model: AvvikelseLabelClassificationModel,
  errandLabels: readonly Label[] | undefined,
  classification?: { readonly category?: string; readonly type?: string; readonly subType?: string }
): LabelClassificationSelection => {
  const labels = errandLabels ?? [];
  const bindingFromLabels = model.bindings.find(
    ({ category, types }) =>
      labels.some((label) => hasSameIdentity(label, category)) ||
      types.some((type) => labels.some((label) => hasSameIdentity(label, type)))
  );
  const binding =
    bindingFromLabels ??
    model.bindings.find(({ category }) =>
      [classification?.type, classification?.category].some(
        (resource) =>
          resource && normalizeResourcePath(resource) === normalizeResourcePath(labelResourceValue(category))
      )
    );

  if (!binding) {
    return {};
  }

  const selectedTypeFromLabels = binding.types.find((type) => labels.some((label) => hasSameIdentity(label, type)));
  const selectedType =
    selectedTypeFromLabels ??
    binding.types.find((type) =>
      [classification?.subType, classification?.type].some(
        (resource) => resource && normalizeResourcePath(resource) === normalizeResourcePath(labelResourceValue(type))
      )
    );
  return {
    typeCode: labelCode(binding.category),
    subtypeCode: selectedType ? labelCode(selectedType) : undefined,
  };
};

const isCategoryPath = (resourcePath: string | undefined, rootResource: string): boolean => {
  const path = normalizeResourcePath(resourcePath);
  const root = normalizeResourcePath(rootResource);
  return path === root || path.startsWith(`${root}/`);
};

const isManagedLabel = (model: AvvikelseLabelClassificationModel, label: Label): boolean =>
  isCategoryPath(label.resourcePath, model.labelTree.root.resource) ||
  model.bindings.some(
    ({ owner, category, types }) =>
      (owner ? hasSameIdentity(label, owner) : false) ||
      hasSameIdentity(label, category) ||
      types.some((type) => hasSameIdentity(label, type))
  );

const appendUnique = (labels: Label[], label: Label | undefined) => {
  if (label && !labels.some((existingLabel) => hasSameIdentity(existingLabel, label))) {
    labels.push(withoutChildren(label));
  }
};

export interface AvvikelseLabelClassificationUpdate {
  readonly labels: Label[];
  readonly categoryLabels: Label[];
  readonly labelsChanged: boolean;
  readonly category: string;
  readonly type: string;
  readonly subType: string;
  readonly requiresSubType: boolean;
}

const hasSameLabelSequence = (currentLabels: readonly Label[], nextLabels: readonly Label[]): boolean =>
  currentLabels.length === nextLabels.length &&
  currentLabels.every((label, index) => label.labels === undefined && hasSameIdentity(label, nextLabels[index]));

export const applyAvvikelseLabelClassificationSelection = (
  model: AvvikelseLabelClassificationModel,
  currentLabels: readonly Label[] | undefined,
  selection: LabelClassificationSelection
): AvvikelseLabelClassificationUpdate => {
  const binding = model.bindings.find(({ category }) => labelCode(category) === selection.typeCode);
  const selectedType = binding?.types.find((type) => labelCode(type) === selection.subtypeCode);
  const labels = (currentLabels ?? []).filter((label) => !isManagedLabel(model, label)).map(withoutChildren);
  const categoryLabels: Label[] = [];

  for (const selectedLabel of [binding?.owner, binding?.category, selectedType]) {
    appendUnique(labels, selectedLabel);
    appendUnique(categoryLabels, selectedLabel);
  }

  const category = binding ? labelResourceValue(binding.owner ?? binding.category) : '';

  return {
    labels,
    categoryLabels,
    labelsChanged: !hasSameLabelSequence(currentLabels ?? [], labels),
    category,
    type: binding ? labelResourceValue(binding.category) : '',
    subType: selectedType ? labelResourceValue(selectedType) : '',
    requiresSubType: Boolean(binding?.types.length),
  };
};

/** A legal base of a group, with the name its selector is headed by. */
interface AvvikelseClassificationGroupLegalBase {
  readonly legalBase: string;
  readonly label: string;
}

/** Legal bases whose categories are chosen in one selector. */
export interface AvvikelseClassificationGroup {
  readonly key: string;
  readonly legalBases: readonly AvvikelseClassificationGroupLegalBase[];
}

/** A group one or more of the chosen legal bases belong to. */
interface AvvikelseChosenClassificationGroup {
  readonly group: AvvikelseClassificationGroup;
  /** What the selector is headed by: the group's chosen legal bases, such as SoL, LSS or SoL/LSS. */
  readonly label: string;
  /** The group's legal bases among the chosen ones, which decide the categories it offers. */
  readonly legalBases: readonly string[];
}

interface AvvikelseGroupedClassificationModelGroup extends AvvikelseChosenClassificationGroup {
  /** The categories the group's chosen legal bases allow. */
  readonly model: AvvikelseLabelClassificationModel;
}

/**
 * An errand is classified once in every group one of its legal bases belongs to: a deviation under
 * both HSL and SoL has an HSL classification and a SoL/LSS one, each chosen in its own selector.
 */
export interface AvvikelseGroupedClassificationModel {
  /** The groups the chosen legal bases reach, in display order. */
  readonly groups: readonly AvvikelseGroupedClassificationModelGroup[];
  /** Every configured category, so a path chosen in a group the legal bases no longer reach is recognised. */
  readonly completeModel: AvvikelseLabelClassificationModel;
  /** Group keys in the order they claim the errand's own classification field, which holds only one. */
  readonly errandClassificationGroupPriority: readonly string[];
}

export type AvvikelseGroupedClassificationSelection = Readonly<Record<string, LabelClassificationSelection>>;

interface AvvikelseGroupClassificationUpdate extends AvvikelseLabelClassificationUpdate {
  readonly groupKey: string;
  readonly groupLabel: string;
}

export interface AvvikelseGroupedClassificationUpdate {
  readonly labels: Label[];
  readonly labelsChanged: boolean;
  /** One per group the legal bases reach, in display order. */
  readonly classifications: readonly AvvikelseGroupClassificationUpdate[];
  /** The chosen classification the errand's own classification field takes. */
  readonly errandClassification: AvvikelseGroupClassificationUpdate | undefined;
}

const normalizeLegalBase = (legalBase: string): string => legalBase.trim().toUpperCase();

/**
 * The groups the chosen legal bases reach, in the order the groups are configured. Every categorization
 * of an avvikelse follows this rule, whichever catalog its selectors offer.
 */
export const getChosenAvvikelseClassificationGroups = (
  legalBases: readonly string[],
  groups: readonly AvvikelseClassificationGroup[]
): AvvikelseChosenClassificationGroup[] => {
  const chosenLegalBases = new Set(legalBases.map(normalizeLegalBase));
  return groups.flatMap((group) => {
    const groupLegalBases = group.legalBases.filter(({ legalBase }) =>
      chosenLegalBases.has(normalizeLegalBase(legalBase))
    );
    return groupLegalBases.length === 0
      ? []
      : [
          {
            group,
            label: groupLegalBases.map(({ label }) => label).join('/'),
            legalBases: groupLegalBases.map(({ legalBase }) => legalBase),
          },
        ];
  });
};

export const createAvvikelseGroupedClassificationModel = (
  labelStructure: readonly Label[] | undefined,
  labelTree: AvvikelseClassificationLabelTree | undefined,
  legalBases: readonly string[],
  legalBaseRules: readonly LabelClassificationLegalBaseRule[],
  groups: readonly AvvikelseClassificationGroup[],
  errandClassificationGroupPriority: readonly string[]
): AvvikelseGroupedClassificationModel => ({
  groups: getChosenAvvikelseClassificationGroups(legalBases, groups).map((chosenGroup) => ({
    ...chosenGroup,
    model: createAvvikelseLabelClassificationModel(labelStructure, labelTree, chosenGroup.legalBases, legalBaseRules),
  })),
  completeModel: createAvvikelseLabelClassificationModel(labelStructure, labelTree),
  errandClassificationGroupPriority,
});

export const getAvvikelseGroupedClassificationSelection = (
  model: AvvikelseGroupedClassificationModel,
  errandLabels: readonly Label[] | undefined,
  classification?: { readonly category?: string; readonly type?: string; readonly subType?: string }
): AvvikelseGroupedClassificationSelection =>
  Object.fromEntries(
    model.groups.map(({ group, model: groupModel }) => [
      group.key,
      getAvvikelseLabelClassificationSelection(groupModel, errandLabels, classification),
    ])
  );

/**
 * Replaces every classification path on the errand with the paths chosen per group. A group the legal
 * bases no longer reach loses its path; labels outside the classification tree are kept as they are.
 */
export const applyAvvikelseGroupedClassificationSelection = (
  model: AvvikelseGroupedClassificationModel,
  currentLabels: readonly Label[] | undefined,
  selections: AvvikelseGroupedClassificationSelection
): AvvikelseGroupedClassificationUpdate => {
  const labels = (currentLabels ?? [])
    .filter((label) => !isManagedLabel(model.completeModel, label))
    .map(withoutChildren);
  const classifications = model.groups.map(({ group, label: groupLabel, model: groupModel }) => {
    const update = applyAvvikelseLabelClassificationSelection(groupModel, [], selections[group.key] ?? {});
    update.categoryLabels.forEach((label) => appendUnique(labels, label));
    return { ...update, groupKey: group.key, groupLabel };
  });
  const rank = (groupKey: string): number => {
    const index = model.errandClassificationGroupPriority.indexOf(groupKey);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const errandClassification = classifications
    .filter((classification) => classification.category)
    .sort((left, right) => rank(left.groupKey) - rank(right.groupKey))[0];

  return {
    labels,
    labelsChanged: !hasSameLabelSequence(currentLabels ?? [], labels),
    classifications,
    errandClassification,
  };
};

const hasChosenBinding = (binding: AvvikelseLabelClassificationBinding, labels: readonly Label[]): boolean =>
  labels.some(
    (label) => hasSameIdentity(label, binding.category) || binding.types.some((type) => hasSameIdentity(label, type))
  );

/**
 * The errand's labels on one chosen path: its owner, its category, the category's types - and any type
 * label below the category's path that metadata no longer describes, which is what a retired
 * undercategory looks like. Another group's labels are not evidence about this path.
 */
const labelsOnBindingPath = (
  binding: AvvikelseLabelClassificationBinding,
  labels: readonly Label[],
  labelTree: AvvikelseClassificationLabelTree
): Label[] => {
  const categoryPath = normalizeResourcePath(labelResourceValue(binding.category));
  return labels.filter(
    (label) =>
      (binding.owner !== undefined && hasSameIdentity(label, binding.owner)) ||
      hasSameIdentity(label, binding.category) ||
      binding.types.some((type) => hasSameIdentity(label, type)) ||
      (isClassification(label, labelTree.typeClassification) &&
        Boolean(label.resourcePath) &&
        normalizeResourcePath(label.resourcePath).startsWith(`${categoryPath}/`))
  );
};

/**
 * Whether the classification saved on the errand satisfies the chosen legal bases: every group they
 * reach has a complete path, and no group they no longer reach still has one. A group without a path
 * of its own is satisfied only by a legacy classification its legal bases still allow.
 */
export const getPersistedAvvikelseGroupedClassificationState = (
  labelStructure: readonly Label[] | undefined,
  labelTree: AvvikelseClassificationLabelTree,
  legalBases: readonly string[],
  classification: PersistedIafLabelClassification,
  legalBaseRules: readonly LabelClassificationLegalBaseRule[],
  groups: readonly AvvikelseClassificationGroup[],
  errandClassificationGroupPriority: readonly string[]
): PersistedIafLabelClassificationState => {
  const model = createAvvikelseGroupedClassificationModel(
    labelStructure,
    labelTree,
    legalBases,
    legalBaseRules,
    groups,
    errandClassificationGroupPriority
  );
  if (model.completeModel.bindings.length === 0) return 'legacy-unknown';
  if (model.groups.length === 0) return 'missing-classification';

  const labels = classification.labels ?? [];
  const chosenOutsideGroups = model.completeModel.bindings.some(
    (binding) =>
      hasChosenBinding(binding, labels) &&
      !model.groups.some(({ model: groupModel }) =>
        groupModel.bindings.some((candidate) => hasSameIdentity(candidate.category, binding.category))
      )
  );
  if (chosenOutsideGroups) return 'known-disallowed-legal-base';

  for (const { legalBases: groupLegalBases, model: groupModel } of model.groups) {
    const selection = getAvvikelseLabelClassificationSelection(groupModel, labels, classification);
    const binding = groupModel.bindings.find(({ category }) => labelCode(category) === selection.typeCode);
    // The group is judged the way a single classification always was, on the path it has: an errand
    // classified before the tree was labelled, or under an undercategory metadata has since retired,
    // is kept while the group's legal bases still allow its owner.
    const state = getPersistedAvvikelseLabelClassificationState(
      labelStructure,
      labelTree,
      groupLegalBases,
      binding
        ? {
            labels: labelsOnBindingPath(binding, labels, labelTree),
            category: labelResourceValue(binding.owner ?? binding.category),
            type: labelResourceValue(binding.category),
            subType: '',
          }
        : classification,
      legalBaseRules
    );
    if (state === 'known-valid' || state === 'legacy-unknown') continue;
    return binding ? state : 'missing-classification';
  }
  return 'known-valid';
};

export interface MissingAvvikelseGroupedClassificationChoice {
  readonly groupKey: string;
  /** The first choice the group still needs: a category, or the undercategory the chosen category requires. */
  readonly missing: 'type' | 'subtype';
}

/** The groups whose classification is not yet complete, in display order. */
export const getMissingAvvikelseGroupedClassificationChoices = (
  model: AvvikelseGroupedClassificationModel,
  selections: AvvikelseGroupedClassificationSelection
): MissingAvvikelseGroupedClassificationChoice[] =>
  model.groups.flatMap(({ group, model: groupModel }): MissingAvvikelseGroupedClassificationChoice[] => {
    const selection = selections[group.key] ?? {};
    const chosenType = groupModel.catalog.types.find((type) => type.code === selection.typeCode);
    if (!chosenType) return [{ groupKey: group.key, missing: 'type' }];
    if (chosenType.subtypes.length > 0 && !selection.subtypeCode) return [{ groupKey: group.key, missing: 'subtype' }];
    return [];
  });
