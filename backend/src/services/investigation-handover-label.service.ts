import {
  INVESTIGATION_ACCESS_LEX_LABEL,
  isInvestigationHandoverLabelPath,
  isInvestigationLocationLabelClassification,
} from '@/config/investigation-handover-labels';
import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import { Errand, Label } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';

/**
 * Resolves one label by its resource path anywhere in the metadata tree.
 *
 * The path is matched against `resourcePath` as a whole and never split into segments: a resource
 * path is not a chain of resource names, and reconstructing it from the levels it passes through
 * resolves the wrong node as soon as two branches share a name.
 */
const findLabelByResourcePath = (labelStructure: readonly Label[] | undefined, resourcePath: string): Label => {
  const wanted = normalizeSupportManagementResourcePath(resourcePath);
  const matches: Label[] = [];

  const visit = (nodes: readonly Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (normalizeSupportManagementResourcePath(node.resourcePath) === wanted) matches.push(node);
      visit(node.labels);
    }
  };
  visit(labelStructure);

  if (matches.length !== 1) {
    throw new HttpException(502, `Label path ${resourcePath} resolved ${matches.length} times in Support Management metadata`);
  }
  return matches[0];
};

const requireLabelId = (label: { id?: string }, context: string): string => {
  if (typeof label.id !== 'string' || label.id.length === 0) {
    throw new HttpException(502, `Support Management ${context} contains a label without id`);
  }
  return label.id;
};

const hasCarriedDescendant = (nodes: readonly Label[] | undefined, carried: ReadonlySet<string>): boolean =>
  (nodes ?? []).some(node => (typeof node.id === 'string' && carried.has(node.id)) || hasCarriedDescendant(node.labels, carried));

/**
 * The label ids without the top-level labels that would be left with nothing beneath them.
 *
 * A root - ACCESS, LOCATION, REPORT_TYPE, CATEGORY - names a structure rather than saying anything about
 * the errand, so on its own it is noise, and an access root left behind could still be matched by an
 * AccessMapper pattern after the label that justified it is gone. Whenever labels are written here, a
 * root goes as soon as none of its descendants remains.
 *
 * Only the top level is pruned. A level further down can be a complete answer on its own - a type
 * without an optional sub-type - and removing it would take part of the classification with it. A
 * top-level label with no children in the metadata is a label in its own right, not a structure, and
 * stays.
 */
export const withoutEmptyLabelRoots = (labelIds: readonly string[], labelStructure: readonly Label[] | undefined): string[] => {
  const carried = new Set(labelIds);
  const emptyRootIds = new Set(
    (labelStructure ?? [])
      .filter(
        root => typeof root.id === 'string' && carried.has(root.id) && (root.labels?.length ?? 0) > 0 && !hasCarriedDescendant(root.labels, carried),
      )
      .map(root => root.id as string),
  );
  return labelIds.filter(id => !emptyRootIds.has(id));
};

interface HandoverLabelUpdateInput {
  readonly currentLabels: Errand['labels'];
  readonly labelStructure: readonly Label[] | undefined;
  readonly addResourcePaths: readonly string[];
  readonly removeResourcePaths: readonly string[];
}

/**
 * Builds the complete label id list for a handover step.
 *
 * Support Management replaces the label collection wholesale, so every label the errand already
 * carries is repeated here. Only the paths the step names move; the classification labels pass
 * through untouched, which is what keeps this route from becoming a second way to categorise an
 * errand.
 *
 * Removing a path the errand does not carry is a no-op rather than an error: a step describes the
 * state it leaves behind, not a transition from one exact starting point. A root left with nothing
 * beneath it goes too - taking ACCESS/LEX off takes the ACCESS root with it (`withoutEmptyLabelRoots`).
 *
 * Returns `undefined` when the errand already has exactly the requested labels, so an unchanged
 * assignment does not spend an errand version.
 */
export const buildInvestigationHandoverLabelUpdate = ({
  currentLabels,
  labelStructure,
  addResourcePaths,
  removeResourcePaths,
}: HandoverLabelUpdateInput): { id: string }[] | undefined => {
  for (const resourcePath of [...addResourcePaths, ...removeResourcePaths]) {
    if (!isInvestigationHandoverLabelPath(resourcePath)) {
      throw new HttpException(400, `${resourcePath} is not a label a handover step may change`);
    }
  }

  const addedIds = addResourcePaths.map(path => requireLabelId(findLabelByResourcePath(labelStructure, path), 'label metadata'));
  const removedIds = new Set(removeResourcePaths.map(path => requireLabelId(findLabelByResourcePath(labelStructure, path), 'label metadata')));

  const currentIds = (currentLabels ?? []).map(label => requireLabelId(label, 'errand response'));
  const keptIds = currentIds.filter(id => !removedIds.has(id));
  const updatedIds = withoutEmptyLabelRoots([...new Set([...keptIds, ...addedIds])], labelStructure);

  const unchanged =
    updatedIds.length === currentIds.length && new Set(currentIds).size === updatedIds.length && updatedIds.every(id => currentIds.includes(id));
  if (unchanged) return undefined;

  return updatedIds.map(id => ({ id }));
};

interface MetadataLabelNode {
  readonly resourcePath: string;
  readonly classification: string;
  /** The human-readable name. A resource path is an identity, never something to show a handler. */
  readonly displayName: string;
  /** Depth in the metadata tree, read from the structure rather than counted in the path text. */
  readonly depth: number;
}

/** Indexes the metadata tree by both identities an errand label can be recognised by. */
const indexMetadataLabels = (
  labelStructure: readonly Label[] | undefined,
): { byId: Map<string, MetadataLabelNode>; byPath: Map<string, MetadataLabelNode> } => {
  const byId = new Map<string, MetadataLabelNode>();
  const byPath = new Map<string, MetadataLabelNode>();

  const visit = (nodes: readonly Label[] | undefined, depth: number): void => {
    for (const node of nodes ?? []) {
      const resourcePath = typeof node.resourcePath === 'string' ? node.resourcePath.trim() : '';
      if (resourcePath.length > 0) {
        const indexed: MetadataLabelNode = { resourcePath, classification: node.classification ?? '', displayName: node.displayName ?? '', depth };
        byPath.set(normalizeSupportManagementResourcePath(resourcePath), indexed);
        if (typeof node.id === 'string' && node.id.length > 0) byId.set(node.id, indexed);
      }
      visit(node.labels, depth + 1);
    }
  };
  visit(labelStructure, 0);

  return { byId, byPath };
};

/** The metadata nodes an errand's labels stand for, dropping any the metadata does not describe. */
const resolveErrandMetadataLabels = (currentLabels: Errand['labels'], labelStructure: readonly Label[] | undefined): MetadataLabelNode[] => {
  const { byId, byPath } = indexMetadataLabels(labelStructure);

  return (currentLabels ?? [])
    .map(label => {
      // The id is the identity. An errand label's own resourcePath is only consulted when the id is
      // missing, and even then the metadata node is what carries the classification.
      if (typeof label.id === 'string' && byId.has(label.id)) return byId.get(label.id);
      const resourcePath = typeof label.resourcePath === 'string' ? label.resourcePath.trim() : '';
      return resourcePath.length > 0 ? byPath.get(normalizeSupportManagementResourcePath(resourcePath)) : undefined;
    })
    .filter((node): node is MetadataLabelNode => node !== undefined);
};

/** The resource paths an errand's labels stand for, resolved through the metadata tree. */
const resolveErrandLabelResourcePaths = (currentLabels: Errand['labels'], labelStructure: readonly Label[] | undefined): string[] =>
  resolveErrandMetadataLabels(currentLabels, labelStructure).map(node => node.resourcePath);

/** Where an errand happened: the path AccessMapper matches on, and the name a handler is shown. */
export interface ErrandLocation {
  readonly resourcePath: string;
  readonly displayName: string;
}

/**
 * The one place an errand concerns.
 *
 * An errand carries its whole location path, not just the leaf: a place four levels down arrives as
 * four labels, one per level. They are all classified as locations, so counting them is not how you
 * find the place - the place is the **deepest** of them. Every ancestor is a broader area, and
 * resolving against one of those would hand the errand to whoever manages a whole region instead of
 * the unit it concerns.
 *
 * Depth comes from the metadata tree rather than from counting separators in the path, so a resource
 * path is never parsed as if it were a chain of names.
 *
 * Two labels at the same depth are a genuine ambiguity - two different places, not two levels of one
 * - and that is reported rather than guessed.
 */
export const resolveErrandLocation = (currentLabels: Errand['labels'], labelStructure: readonly Label[] | undefined): ErrandLocation => {
  const locations = resolveErrandMetadataLabels(currentLabels, labelStructure).filter(node =>
    isInvestigationLocationLabelClassification(node.classification),
  );

  if (locations.length === 0) {
    throw new HttpException(409, 'The errand has no location label, so its unit manager cannot be resolved');
  }

  const deepest = Math.max(...locations.map(node => node.depth));
  const deepestByPath = new Map(
    locations.filter(node => node.depth === deepest).map(node => [normalizeSupportManagementResourcePath(node.resourcePath), node]),
  );

  if (deepestByPath.size > 1) {
    const names = [...deepestByPath.values()].map(node => node.displayName || node.resourcePath);
    throw new HttpException(
      409,
      `The errand carries ${deepestByPath.size} places at the same level (${names.join(', ')}), so its unit manager is ambiguous`,
    );
  }

  const [resourcePath, node] = [...deepestByPath.entries()][0];
  // AccessMapper matches on the path; a handler is shown the name. Falling back to the path keeps a
  // place with no display name readable rather than blank.
  return { resourcePath, displayName: node.displayName || resourcePath };
};

/** Whether the errand is currently with the LEX roles, which the access label is what says. */
export const hasInvestigationAccessLexLabel = (currentLabels: Errand['labels'], labelStructure: readonly Label[] | undefined): boolean => {
  const wanted = normalizeSupportManagementResourcePath(INVESTIGATION_ACCESS_LEX_LABEL);
  return resolveErrandLabelResourcePaths(currentLabels, labelStructure).some(
    resourcePath => normalizeSupportManagementResourcePath(resourcePath) === wanted,
  );
};

/** A place an errand can be moved to, resolved from the metadata tree. */
export interface InvestigationLocationTarget {
  /** The target node's own id. */
  readonly labelId: string;
  /** What the handler picked, by name. */
  readonly displayName: string;
  /**
   * The labels the errand will carry for the place: every level below the tree's top node, down to
   * and including the target. The top node itself is the structure, not a place, and an errand does
   * not carry it.
   */
  readonly chainIds: readonly string[];
  /** The top-level node the target sits under. Everything beneath it is the location structure. */
  readonly rootId: string;
  /** The AccessMapper-matched place within the chain: the deepest node classified as a location. */
  readonly location: ErrandLocation;
}

interface LabelTreeMatch {
  readonly node: Label;
  /** From the top-level node down to the target's parent. */
  readonly ancestors: readonly Label[];
}

const findLabelTreeMatches = (labelStructure: readonly Label[] | undefined, labelId: string): LabelTreeMatch[] => {
  const matches: LabelTreeMatch[] = [];
  const visit = (nodes: readonly Label[] | undefined, ancestors: readonly Label[]): void => {
    for (const node of nodes ?? []) {
      if (node.id === labelId) matches.push({ node, ancestors });
      visit(node.labels, [...ancestors, node]);
    }
  };
  visit(labelStructure, []);
  return matches;
};

/**
 * Resolves the place an errand is being moved to.
 *
 * The target is named by label id, because that is the identity a label has; the path is looked up
 * from it, never reconstructed from names. Three things are checked, and each one refuses rather
 * than guesses:
 *
 * - the id must be in the metadata tree, exactly once;
 * - it must be a leaf. Katla offers only the units with no sub-units as places, and an errand moved
 *   to a level above one would carry a place its own reporter could not have chosen;
 * - the path down to it must pass through a node classified as a location, or there is nothing for
 *   AccessMapper to match and no manager to resolve - the errand would be moved to nowhere.
 */
export const resolveInvestigationLocationTarget = (labelStructure: readonly Label[] | undefined, labelId: string): InvestigationLocationTarget => {
  const matches = findLabelTreeMatches(labelStructure, labelId);
  if (matches.length === 0) {
    throw new HttpException(400, 'The selected place does not exist in Support Management metadata');
  }
  if (matches.length > 1) {
    throw new HttpException(502, `Label id ${labelId} resolved ${matches.length} times in Support Management metadata`);
  }

  const { node, ancestors } = matches[0];
  if ((node.labels?.length ?? 0) > 0) {
    throw new HttpException(400, 'The selected place has sub-places; choose the unit the errand concerns');
  }
  if (ancestors.length === 0) {
    throw new HttpException(400, 'The selected label is the top of the structure, not a place');
  }

  const path = [...ancestors, node];
  const rootId = requireLabelId(ancestors[0], 'label metadata');
  const chainIds = path.slice(1).map(label => requireLabelId(label, 'label metadata'));

  const locations = path.filter(label => isInvestigationLocationLabelClassification(label.classification));
  const deepestLocation = locations.at(-1);
  if (!deepestLocation) {
    throw new HttpException(400, 'The selected label is not a place: no level on its path is classified as a location');
  }
  const locationResourcePath = typeof deepestLocation.resourcePath === 'string' ? deepestLocation.resourcePath.trim() : '';
  if (locationResourcePath.length === 0) {
    throw new HttpException(502, 'Support Management label metadata contains a location without resourcePath');
  }

  return {
    labelId: requireLabelId(node, 'label metadata'),
    displayName: node.displayName || node.resourceName || locationResourcePath,
    chainIds,
    rootId,
    location: {
      resourcePath: normalizeSupportManagementResourcePath(locationResourcePath),
      displayName: deepestLocation.displayName || locationResourcePath,
    },
  };
};

interface LocationLabelUpdateInput {
  readonly currentLabels: Errand['labels'];
  readonly labelStructure: readonly Label[] | undefined;
  readonly target: InvestigationLocationTarget;
}

/** Label ids by normalized resource path, for errand labels that arrive without an id. */
export const indexLabelIdsByPath = (labelStructure: readonly Label[] | undefined): Map<string, string> => {
  const idByPath = new Map<string, string>();
  const visit = (nodes: readonly Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      const resourcePath = typeof node.resourcePath === 'string' ? node.resourcePath.trim() : '';
      if (resourcePath.length > 0 && typeof node.id === 'string' && node.id.length > 0) {
        idByPath.set(normalizeSupportManagementResourcePath(resourcePath), node.id);
      }
      visit(node.labels);
    }
  };
  visit(labelStructure);
  return idByPath;
};

/** Every id strictly beneath one node of the tree. */
const collectDescendantIds = (labelStructure: readonly Label[] | undefined, rootId: string): Set<string> => {
  const ids = new Set<string>();
  const collect = (nodes: readonly Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (typeof node.id === 'string' && node.id.length > 0) ids.add(node.id);
      collect(node.labels);
    }
  };
  const visit = (nodes: readonly Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.id === rootId) collect(node.labels);
      else visit(node.labels);
    }
  };
  visit(labelStructure);
  return ids;
};

/**
 * Builds the complete label id list for moving an errand to another place.
 *
 * Only the location changes. Every label outside the location structure - classification, report
 * type, the LEX access label if the errand carries it - passes through untouched, so this cannot
 * become a second way to reclassify an errand. Within the structure the whole chain is replaced:
 * every level the errand carried for the old place goes, every level down to the new place comes,
 * because AccessMapper's patterns are written against ancestors as well as the place itself and a
 * leftover level would keep the old unit's managers on the errand.
 *
 * The top-level node is left as it was while anything beneath it is carried: it is the structure
 * rather than a place, and whether a deployment writes it onto errands is not this function's
 * decision. A root left with nothing beneath it goes, as on every label write here.
 *
 * Returns `undefined` when the errand already carries exactly the target's chain, so a move to
 * where the errand already is does not spend an errand version.
 */
export const buildInvestigationLocationLabelUpdate = ({
  currentLabels,
  labelStructure,
  target,
}: LocationLabelUpdateInput): { id: string }[] | undefined => {
  const { byId } = indexMetadataLabels(labelStructure);
  const idByPath = indexLabelIdsByPath(labelStructure);
  const structureIds = collectDescendantIds(labelStructure, target.rootId);

  const currentIds = (currentLabels ?? []).map(label => {
    if (typeof label.id === 'string' && label.id.length > 0) return label.id;
    // The id is what goes upstream. A label that arrived without one is only usable if the metadata
    // can name it by path; otherwise this write would silently drop it.
    const resourcePath = typeof label.resourcePath === 'string' ? label.resourcePath.trim() : '';
    const resolvedId = resourcePath.length > 0 ? idByPath.get(normalizeSupportManagementResourcePath(resourcePath)) : undefined;
    if (!resolvedId) throw new HttpException(502, 'Support Management errand response contains a label without id');
    return resolvedId;
  });

  const isLocationLabel = (id: string): boolean => structureIds.has(id) || isInvestigationLocationLabelClassification(byId.get(id)?.classification);

  const keptIds = currentIds.filter(id => !isLocationLabel(id));
  const updatedIds = withoutEmptyLabelRoots([...new Set([...keptIds, ...target.chainIds])], labelStructure);

  const unchanged =
    updatedIds.length === currentIds.length && new Set(currentIds).size === updatedIds.length && updatedIds.every(id => currentIds.includes(id));
  if (unchanged) return undefined;

  return updatedIds.map(id => ({ id }));
};
