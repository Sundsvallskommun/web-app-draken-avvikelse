import type { Labels } from '@/data-contracts/supportmanagement/data-contracts';

interface SupportManagementLabelFilterFieldDefinition<TFieldKey extends string = string> {
  readonly key: TFieldKey;
  readonly label: string;
  readonly classification: string;
}

interface SupportManagementLabelFilterGroupDefinition<TGroupKey extends string = string, TFieldKey extends string = string> {
  readonly key: TGroupKey;
  readonly label: string;
  readonly rootResourcePath: string;
  readonly fields: readonly SupportManagementLabelFilterFieldDefinition<TFieldKey>[];
}

/** Structural projection of the profile-owned label-filter configuration. */
export interface SupportManagementLabelFilterProfile<TGroupKey extends string = string, TFieldKey extends string = string> {
  readonly groups: readonly SupportManagementLabelFilterGroupDefinition<TGroupKey, TFieldKey>[];
}

/** Complete, transport-safe identity of one selected metadata label. */
export interface SupportManagementLabelFilterSelection {
  readonly groupKey: string;
  readonly fieldKey: string;
  readonly resourcePath: string;
}

export type SupportManagementLabelFilterErrorSource = 'metadata' | 'profile' | 'selection';

export type SupportManagementLabelFilterErrorCode =
  | 'DUPLICATE_CLASSIFICATION'
  | 'DUPLICATE_FIELD'
  | 'DUPLICATE_GROUP'
  | 'DUPLICATE_METADATA_PATH'
  | 'DUPLICATE_ROOT_OWNERSHIP'
  | 'INCOMPATIBLE_SELECTION'
  | 'INVALID_FIELD_ORDER'
  | 'INVALID_KEY'
  | 'INVALID_METADATA'
  | 'INVALID_PROFILE'
  | 'INVALID_RESOURCE_PATH'
  | 'INVALID_SELECTION'
  | 'MISSING_FIELD_CHOICES'
  | 'ROOT_NOT_UNIQUE'
  | 'RESOURCE_PATH_FIELD_MISMATCH'
  | 'RESOURCE_PATH_NOT_SELECTABLE'
  | 'UNKNOWN_FIELD'
  | 'UNKNOWN_GROUP'
  | 'UNKNOWN_RESOURCE_PATH';

/** Lets an HTTP adapter map selection errors to 400, profile errors to 500 and metadata errors to 502. */
export class SupportManagementLabelFilterError extends Error {
  constructor(
    readonly source: SupportManagementLabelFilterErrorSource,
    readonly code: SupportManagementLabelFilterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SupportManagementLabelFilterError';
  }
}

interface CanonicalMetadataNode {
  readonly classification: string;
  readonly resourcePath?: string;
  readonly children: readonly CanonicalMetadataNode[];
}

interface CompiledFieldDefinition {
  readonly key: string;
  readonly classification: string;
  readonly index: number;
}

interface CompiledChoiceAncestor {
  readonly fieldKey: string;
  readonly resourcePath: string;
}

interface CompiledChoice {
  readonly fieldKey: string;
  readonly fieldIndex: number;
  readonly choiceIndex: number;
  readonly resourcePath: string;
  readonly ancestors: readonly CompiledChoiceAncestor[];
}

interface CompiledGroupDefinition {
  readonly key: string;
  readonly root: CanonicalMetadataNode;
  readonly fieldsByKey: ReadonlyMap<string, CompiledFieldDefinition>;
  readonly choicesByResourcePath: ReadonlyMap<string, CompiledChoice>;
}

interface CompiledProfile {
  readonly groups: readonly CompiledGroupDefinition[];
  readonly groupsByKey: ReadonlyMap<string, CompiledGroupDefinition>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const containsControlCharacter = (value: string): boolean =>
  [...value].some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });

const fail = (source: SupportManagementLabelFilterErrorSource, code: SupportManagementLabelFilterErrorCode, message: string): never => {
  throw new SupportManagementLabelFilterError(source, code, message);
};

const requireKey = (value: unknown, source: 'profile' | 'selection', location: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value || containsControlCharacter(value)) {
    return fail(source, 'INVALID_KEY', `${location} must be a canonical, non-empty key`);
  }
  return value;
};

/**
 * Current Support Management metadata generates slash-separated paths without
 * leading/trailing slashes. Backslashes and quotes cannot be serialized safely
 * by the pinned spring-filter converter, so fail closed rather than mutate an
 * identity into a different resourcePath.
 */
const requireResourcePath = (value: unknown, source: SupportManagementLabelFilterErrorSource, location: string): string => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim() !== value ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.includes("'") ||
    value.includes('\\') ||
    containsControlCharacter(value)
  ) {
    return fail(source, 'INVALID_RESOURCE_PATH', `${location} is not a safely serializable Support Management resourcePath`);
  }
  return value;
};

const normalizeClassification = (value: unknown, source: 'metadata' | 'profile', location: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    return fail(source, source === 'metadata' ? 'INVALID_METADATA' : 'INVALID_PROFILE', `${location} must contain a classification`);
  }
  return value.trim().replaceAll('_', '-').toUpperCase();
};

const readMetadata = (
  metadata: Pick<Labels, 'labelStructure'>,
): {
  readonly roots: readonly CanonicalMetadataNode[];
  readonly resourcePaths: ReadonlySet<string>;
} => {
  const rawMetadata: unknown = metadata;
  if (!isRecord(rawMetadata)) return fail('metadata', 'INVALID_METADATA', 'Support Management label metadata must be an object');

  const rawStructure = rawMetadata.labelStructure;
  if (rawStructure === undefined) return { roots: [], resourcePaths: new Set() };
  if (!Array.isArray(rawStructure)) {
    return fail('metadata', 'INVALID_METADATA', 'Support Management label metadata labelStructure must be an array');
  }

  const resourcePaths = new Set<string>();
  const readNode = (candidate: unknown, ancestors: ReadonlySet<object>, location: string): CanonicalMetadataNode => {
    if (!isRecord(candidate)) return fail('metadata', 'INVALID_METADATA', `${location} must be a label object`);
    if (ancestors.has(candidate)) return fail('metadata', 'INVALID_METADATA', `${location} contains a cyclic label hierarchy`);

    const classification = normalizeClassification(candidate.classification, 'metadata', `${location}.classification`);
    let resourcePath: string | undefined;
    if (candidate.resourcePath !== undefined) {
      resourcePath = requireResourcePath(candidate.resourcePath, 'metadata', `${location}.resourcePath`);
      if (resourcePaths.has(resourcePath)) {
        return fail('metadata', 'DUPLICATE_METADATA_PATH', `Support Management metadata contains duplicate resourcePath ${resourcePath}`);
      }
      resourcePaths.add(resourcePath);
    }

    if (candidate.labels !== undefined && !Array.isArray(candidate.labels)) {
      return fail('metadata', 'INVALID_METADATA', `${location}.labels must be an array`);
    }
    const nextAncestors = new Set(ancestors).add(candidate);
    const children = (candidate.labels ?? []).map((child, index) => readNode(child, nextAncestors, `${location}.labels[${index}]`));
    return { classification, ...(resourcePath !== undefined && { resourcePath }), children };
  };

  return {
    roots: rawStructure.map((candidate, index) => readNode(candidate, new Set(), `labelStructure[${index}]`)),
    resourcePaths,
  };
};

const findNodesByResourcePath = (
  nodes: readonly CanonicalMetadataNode[],
  resourcePath: string,
  matches: CanonicalMetadataNode[] = [],
): readonly CanonicalMetadataNode[] => {
  nodes.forEach(node => {
    if (node.resourcePath === resourcePath) matches.push(node);
    findNodesByResourcePath(node.children, resourcePath, matches);
  });
  return matches;
};

const containsNode = (root: CanonicalMetadataNode, candidate: CanonicalMetadataNode): boolean =>
  root === candidate || root.children.some(child => containsNode(child, candidate));

const compileFields = (candidate: Record<string, unknown>, groupIndex: number, groupKey: string): readonly CompiledFieldDefinition[] => {
  if (!Array.isArray(candidate.fields) || candidate.fields.length === 0) {
    return fail('profile', 'INVALID_PROFILE', `Label-filter group ${groupKey} must declare at least one field`);
  }

  const keys = new Set<string>();
  const classifications = new Set<string>();
  return candidate.fields.map((rawField, fieldIndex) => {
    const location = `groups[${groupIndex}].fields[${fieldIndex}]`;
    if (!isRecord(rawField)) return fail('profile', 'INVALID_PROFILE', `${location} must be an object`);
    const key = requireKey(rawField.key, 'profile', `${location}.key`);
    const classification = normalizeClassification(rawField.classification, 'profile', `${location}.classification`);
    if (keys.has(key)) return fail('profile', 'DUPLICATE_FIELD', `Label-filter group ${groupKey} contains duplicate field key ${key}`);
    if (classifications.has(classification)) {
      return fail('profile', 'DUPLICATE_CLASSIFICATION', `Label-filter group ${groupKey} contains duplicate classification ${classification}`);
    }
    keys.add(key);
    classifications.add(classification);
    return { key, classification, index: fieldIndex };
  });
};

const compileGroup = (
  candidate: Record<string, unknown>,
  groupIndex: number,
  metadataRoots: readonly CanonicalMetadataNode[],
): CompiledGroupDefinition => {
  const key = requireKey(candidate.key, 'profile', `groups[${groupIndex}].key`);
  const rootResourcePath = requireResourcePath(candidate.rootResourcePath, 'profile', `groups[${groupIndex}].rootResourcePath`);
  const roots = findNodesByResourcePath(metadataRoots, rootResourcePath);
  if (roots.length !== 1) {
    return fail('metadata', 'ROOT_NOT_UNIQUE', `Label-filter group ${key} expected one metadata root ${rootResourcePath}, found ${roots.length}`);
  }

  const fields = compileFields(candidate, groupIndex, key);
  const fieldsByClassification = new Map(fields.map(field => [field.classification, field]));
  const fieldsByKey = new Map(fields.map(field => [field.key, field]));
  const choicesByResourcePath = new Map<string, CompiledChoice>();
  const choiceCounts = fields.map(() => 0);

  const visit = (node: CanonicalMetadataNode, ancestors: readonly CompiledChoiceAncestor[], lastFieldIndex: number): void => {
    const field = fieldsByClassification.get(node.classification);
    let childAncestors = ancestors;
    let childLastFieldIndex = lastFieldIndex;
    if (field) {
      if (field.index <= lastFieldIndex) {
        return fail('metadata', 'INVALID_FIELD_ORDER', `Label-filter group ${key} metadata violates field order at ${field.key}`);
      }
      if (!node.resourcePath) {
        return fail('metadata', 'INVALID_METADATA', `Label-filter group ${key}.${field.key} choice is missing resourcePath`);
      }

      const choice: CompiledChoice = {
        fieldKey: field.key,
        fieldIndex: field.index,
        choiceIndex: choiceCounts[field.index]++,
        resourcePath: node.resourcePath,
        ancestors,
      };
      choicesByResourcePath.set(node.resourcePath, choice);
      childAncestors = [...ancestors, { fieldKey: field.key, resourcePath: node.resourcePath }];
      childLastFieldIndex = field.index;
    }
    node.children.forEach(child => visit(child, childAncestors, childLastFieldIndex));
  };
  visit(roots[0], [], -1);

  fields.forEach(field => {
    if (choiceCounts[field.index] === 0) {
      return fail('metadata', 'MISSING_FIELD_CHOICES', `Label-filter group ${key} has no metadata choices for field ${field.key}`);
    }
  });

  return { key, root: roots[0], fieldsByKey, choicesByResourcePath };
};

const compileProfile = (profile: SupportManagementLabelFilterProfile, metadataRoots: readonly CanonicalMetadataNode[]): CompiledProfile => {
  const rawProfile: unknown = profile;
  if (!isRecord(rawProfile) || !Array.isArray(rawProfile.groups)) {
    return fail('profile', 'INVALID_PROFILE', 'Support Management label-filter profile must contain a groups array');
  }

  const groups: CompiledGroupDefinition[] = [];
  const groupsByKey = new Map<string, CompiledGroupDefinition>();
  rawProfile.groups.forEach((candidate, groupIndex) => {
    if (!isRecord(candidate)) return fail('profile', 'INVALID_PROFILE', `groups[${groupIndex}] must be an object`);
    const group = compileGroup(candidate, groupIndex, metadataRoots);
    if (groupsByKey.has(group.key)) {
      return fail('profile', 'DUPLICATE_GROUP', `Support Management label-filter profile contains duplicate group key ${group.key}`);
    }
    if (groups.some(existing => containsNode(existing.root, group.root) || containsNode(group.root, existing.root))) {
      return fail('profile', 'DUPLICATE_ROOT_OWNERSHIP', `Label-filter group ${group.key} overlaps another configured metadata root`);
    }
    groups.push(group);
    groupsByKey.set(group.key, group);
  });
  return { groups, groupsByKey };
};

const compareChoices = (left: CompiledChoice, right: CompiledChoice): number =>
  left.fieldIndex - right.fieldIndex || left.choiceIndex - right.choiceIndex;

const labelClause = (resourcePath: string): string => `exists(labels.metadataLabel.resourcePath:'${resourcePath}')`;

/**
 * Canonical owner of profile-driven Support Management label-filter semantics.
 * Profile group/field order and metadata choice order determine stable output;
 * request/click order never does.
 */
export class SupportManagementLabelFilterService {
  private readonly metadataResourcePaths: ReadonlySet<string>;
  private readonly profile: CompiledProfile;

  constructor(profile: SupportManagementLabelFilterProfile, metadata: Pick<Labels, 'labelStructure'>) {
    const canonicalMetadata = readMetadata(metadata);
    this.metadataResourcePaths = canonicalMetadata.resourcePaths;
    this.profile = compileProfile(profile, canonicalMetadata.roots);
  }

  /** Returns an appendable `&filter=...` fragment, or an empty string when no labels are selected. */
  buildFilter(selections: readonly SupportManagementLabelFilterSelection[]): string {
    const groupClauses = this.selectLeafResourcePaths(selections).map(leaves => `(${leaves.map(labelClause).join(' or ')})`);
    return groupClauses.length > 0 ? `&filter=${groupClauses.join(' and ')}` : '';
  }

  /**
   * The labels an errand has to carry to match the selections: one list per profile group that has
   * a selection, in profile order, of which the errand needs any one. A selected choice gives way to
   * any selected choice beneath it, so picking a category and one of its types asks for that type.
   */
  selectLeafResourcePaths(selections: readonly SupportManagementLabelFilterSelection[]): string[][] {
    if (!Array.isArray(selections)) {
      return fail('selection', 'INVALID_SELECTION', 'Support Management label-filter selections must be an array');
    }

    const selectedByGroup = new Map<string, Map<string, CompiledChoice>>();
    selections.forEach((candidate, index) => {
      const location = `selections[${index}]`;
      if (!isRecord(candidate)) return fail('selection', 'INVALID_SELECTION', `${location} must be an object`);
      const groupKey = requireKey(candidate.groupKey, 'selection', `${location}.groupKey`);
      const fieldKey = requireKey(candidate.fieldKey, 'selection', `${location}.fieldKey`);
      const resourcePath = requireResourcePath(candidate.resourcePath, 'selection', `${location}.resourcePath`);

      const group = this.profile.groupsByKey.get(groupKey);
      if (!group) return fail('selection', 'UNKNOWN_GROUP', `Unknown Support Management label-filter group ${groupKey}`);
      if (!group.fieldsByKey.has(fieldKey)) {
        return fail('selection', 'UNKNOWN_FIELD', `Unknown Support Management label-filter field ${groupKey}.${fieldKey}`);
      }

      const choice = group.choicesByResourcePath.get(resourcePath);
      if (!choice) {
        if (!this.metadataResourcePaths.has(resourcePath)) {
          return fail('selection', 'UNKNOWN_RESOURCE_PATH', `Unknown Support Management label resourcePath ${resourcePath}`);
        }
        return fail(
          'selection',
          'RESOURCE_PATH_NOT_SELECTABLE',
          `Support Management label resourcePath ${resourcePath} is not selectable in group ${groupKey}`,
        );
      }
      if (choice.fieldKey !== fieldKey) {
        return fail(
          'selection',
          'RESOURCE_PATH_FIELD_MISMATCH',
          `Support Management label resourcePath ${resourcePath} belongs to field ${choice.fieldKey}, not ${fieldKey}`,
        );
      }

      const selectedChoices = selectedByGroup.get(groupKey) ?? new Map<string, CompiledChoice>();
      selectedChoices.set(resourcePath, choice);
      selectedByGroup.set(groupKey, selectedChoices);
    });

    for (const [groupKey, choicesByPath] of selectedByGroup) {
      const selectedPathsByField = new Map<string, Set<string>>();
      choicesByPath.forEach(choice => {
        const paths = selectedPathsByField.get(choice.fieldKey) ?? new Set<string>();
        paths.add(choice.resourcePath);
        selectedPathsByField.set(choice.fieldKey, paths);
      });

      choicesByPath.forEach(choice => {
        const reachable = choice.ancestors.every(ancestor => {
          const selectedAncestorPaths = selectedPathsByField.get(ancestor.fieldKey);
          return !selectedAncestorPaths?.size || selectedAncestorPaths.has(ancestor.resourcePath);
        });
        if (!reachable) {
          return fail(
            'selection',
            'INCOMPATIBLE_SELECTION',
            `Support Management label resourcePath ${choice.resourcePath} is incompatible with selected ancestors in group ${groupKey}`,
          );
        }
      });
    }

    return this.profile.groups.flatMap(group => {
      const choicesByPath = selectedByGroup.get(group.key);
      if (!choicesByPath?.size) return [];
      const selectedChoices = [...choicesByPath.values()];
      const leaves = selectedChoices
        .filter(choice => !selectedChoices.some(candidate => candidate.ancestors.some(ancestor => ancestor.resourcePath === choice.resourcePath)))
        .sort(compareChoices);
      return [leaves.map(choice => choice.resourcePath)];
    });
  }
}
