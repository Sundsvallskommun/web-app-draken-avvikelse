/**
 * The small subset of Support Management label metadata needed to project
 * filter choices. Keeping this structural avoids coupling the pure projector to
 * generated API contracts.
 */
export interface LabelFilterMetadataNode {
  readonly classification: string;
  readonly displayName?: string;
  readonly resourceName?: string;
  readonly resourcePath?: string;
  readonly labels?: readonly LabelFilterMetadataNode[];
}

interface LabelFilterFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly classification: string;
}

export interface LabelFilterGroupDefinition {
  readonly key: string;
  readonly label: string;
  readonly rootResourcePath: string;
  readonly fields: readonly LabelFilterFieldDefinition[];
}

interface LabelFilterChoiceAncestor {
  readonly groupKey: string;
  readonly fieldKey: string;
  readonly resourcePath: string;
}

/**
 * `groupKey`, `fieldKey` and `resourcePath` are the complete persisted filter
 * identity. `displayName` is presentation only and is deliberately never used
 * to identify or deduplicate a choice.
 */
export interface LabelFilterChoice {
  readonly groupKey: string;
  readonly fieldKey: string;
  readonly resourcePath: string;
  readonly displayName: string;
  readonly ancestors: readonly LabelFilterChoiceAncestor[];
}

export type LabelFilterSelection = Pick<LabelFilterChoice, 'groupKey' | 'fieldKey' | 'resourcePath'>;

interface LabelFilterFieldProjection {
  readonly key: string;
  readonly label: string;
  readonly classification: string;
  readonly choices: readonly LabelFilterChoice[];
}

export interface LabelFilterGroupProjection {
  readonly key: string;
  readonly label: string;
  readonly rootResourcePath: string;
  readonly fields: readonly LabelFilterFieldProjection[];
}

interface CanonicalFieldDefinition extends LabelFilterFieldDefinition {
  readonly classification: string;
  readonly index: number;
}

const requireNonEmpty = (value: string, path: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Label filter definition ${path} must not be empty`);
  return normalized;
};

const normalizeClassification = (classification: string): string =>
  requireNonEmpty(classification, 'classification').replaceAll('_', '-').toUpperCase();

const requireResourcePath = (node: LabelFilterMetadataNode, context: string): string => {
  if (typeof node.resourcePath !== 'string' || !node.resourcePath.trim()) {
    throw new Error(`Label filter metadata ${context} is missing resourcePath`);
  }
  return node.resourcePath.trim();
};

const choiceDisplayName = (node: LabelFilterMetadataNode, resourcePath: string): string =>
  node.displayName?.trim() || node.resourceName?.trim() || resourcePath;

const findRoots = (
  nodes: readonly LabelFilterMetadataNode[],
  rootResourcePath: string,
  matches: LabelFilterMetadataNode[]
): void => {
  for (const node of nodes) {
    if (node.resourcePath?.trim() === rootResourcePath) matches.push(node);
    if (node.labels?.length) findRoots(node.labels, rootResourcePath, matches);
  }
};

const canonicalFields = (
  group: LabelFilterGroupDefinition,
  groupIndex: number
): readonly CanonicalFieldDefinition[] => {
  if (group.fields.length === 0) {
    throw new Error(`Label filter definition groups[${groupIndex}].fields must not be empty`);
  }

  const keys = new Set<string>();
  const classifications = new Set<string>();

  return group.fields.map((field, fieldIndex) => {
    const key = requireNonEmpty(field.key, `groups[${groupIndex}].fields[${fieldIndex}].key`);
    const label = requireNonEmpty(field.label, `groups[${groupIndex}].fields[${fieldIndex}].label`);
    const classification = normalizeClassification(field.classification);

    if (keys.has(key)) throw new Error(`Label filter group ${group.key} contains duplicate field key ${key}`);
    if (classifications.has(classification)) {
      throw new Error(`Label filter group ${group.key} contains duplicate classification ${classification}`);
    }
    keys.add(key);
    classifications.add(classification);

    return Object.freeze({ key, label, classification, index: fieldIndex });
  });
};

/**
 * Projects arbitrary-depth label metadata into profile-declared filter fields.
 * Nodes whose classifications are not declared are traversed but never exposed;
 * this is what lets a hidden PROVISION_CATEGORY layer connect CATEGORY and TYPE.
 */
export const projectLabelFilterGroups = (
  definitions: readonly LabelFilterGroupDefinition[],
  labelStructure: readonly LabelFilterMetadataNode[]
): readonly LabelFilterGroupProjection[] => {
  const groupKeys = new Set<string>();

  return Object.freeze(
    definitions.map((definition, groupIndex) => {
      const key = requireNonEmpty(definition.key, `groups[${groupIndex}].key`);
      const label = requireNonEmpty(definition.label, `groups[${groupIndex}].label`);
      const rootResourcePath = requireNonEmpty(definition.rootResourcePath, `groups[${groupIndex}].rootResourcePath`);
      if (groupKeys.has(key)) throw new Error(`Label filter definition contains duplicate group key ${key}`);
      groupKeys.add(key);

      const fields = canonicalFields(definition, groupIndex);
      const fieldsByClassification = new Map(fields.map((field) => [field.classification, field]));
      const choicesByField = new Map(fields.map((field) => [field.key, [] as LabelFilterChoice[]]));
      const seenResourcePaths = new Set<string>();
      const roots: LabelFilterMetadataNode[] = [];
      findRoots(labelStructure, rootResourcePath, roots);
      if (roots.length !== 1) {
        throw new Error(
          `Label filter group ${key} expected exactly one metadata root ${rootResourcePath}, found ${roots.length}`
        );
      }

      const visit = (
        node: LabelFilterMetadataNode,
        ancestors: readonly LabelFilterChoiceAncestor[],
        lastFieldIndex: number
      ): void => {
        const field = fieldsByClassification.get(normalizeClassification(node.classification));
        let childAncestors = ancestors;
        let childLastFieldIndex = lastFieldIndex;

        if (field) {
          if (field.index <= lastFieldIndex) {
            throw new Error(`Label filter group ${key} metadata does not follow declared field order at ${field.key}`);
          }

          const resourcePath = requireResourcePath(node, `${key}.${field.key}`);
          if (seenResourcePaths.has(resourcePath)) {
            throw new Error(`Label filter group ${key} contains duplicate resourcePath ${resourcePath}`);
          }
          seenResourcePaths.add(resourcePath);

          const choice = Object.freeze({
            groupKey: key,
            fieldKey: field.key,
            resourcePath,
            displayName: choiceDisplayName(node, resourcePath),
            ancestors: Object.freeze([...ancestors]),
          });
          choicesByField.get(field.key)?.push(choice);
          childAncestors = Object.freeze([
            ...ancestors,
            Object.freeze({ groupKey: key, fieldKey: field.key, resourcePath }),
          ]);
          childLastFieldIndex = field.index;
        }

        for (const child of node.labels ?? []) visit(child, childAncestors, childLastFieldIndex);
      };

      visit(roots[0], Object.freeze([]), -1);

      const projectedFields = fields.map((field) => {
        const choices = choicesByField.get(field.key) ?? [];
        if (choices.length === 0) {
          throw new Error(
            `Label filter group ${key} found no metadata labels with classification ${field.classification}`
          );
        }
        return Object.freeze({
          key: field.key,
          label: field.label,
          classification: field.classification,
          choices: Object.freeze(choices),
        });
      });

      return Object.freeze({
        key,
        label,
        rootResourcePath,
        fields: Object.freeze(projectedFields),
      });
    })
  );
};
