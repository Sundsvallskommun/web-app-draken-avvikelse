import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { normalizeSupportManagementResourcePath } from '@supportmanagement/services/supportmanagement-path';

import { isPlaceLabel } from '../place-label';
import type { PlaceManagerAssignment } from './place-manager-service';

/** One level of the place structure: what it is called, and the path a pattern on it is written against. */
interface PlaceLevel {
  readonly name: string;
  readonly resourcePath: string;
}

/**
 * A place a manager can be given. A unit is the level a manager is set on - the deepest place on its branch, the
 * one AccessMapper's patterns are written against. An area is any level above units, and stands for all of them.
 */
export interface PlaceTreeNode extends PlaceLevel {
  readonly labelId: string;
  readonly kind: 'area' | 'unit';
  readonly children: readonly PlaceTreeNode[];
  /** The units the place stands for: itself when it is a unit, every unit beneath it when it is an area. */
  readonly unitPaths: readonly string[];
  /** The levels above the place, from the top of the structure down. */
  readonly ancestors: readonly PlaceLevel[];
}

const hasPlaceBeneath = (label: Label): boolean =>
  (label.labels ?? []).some((child) => isPlaceLabel(child) || hasPlaceBeneath(child));

const toPlaceTreeNode = (label: Label, ancestors: readonly PlaceLevel[]): PlaceTreeNode | undefined => {
  const resourcePath = normalizeSupportManagementResourcePath(label.resourcePath);
  // A label without identity or path cannot be named to the BFF, so it is not offered.
  if (!label.id || !resourcePath) return undefined;
  const level: PlaceLevel = { name: label.displayName || label.resourceName || resourcePath, resourcePath };
  const base = { ...level, labelId: label.id, ancestors };

  if (isPlaceLabel(label) && !hasPlaceBeneath(label)) {
    return { ...base, kind: 'unit', children: [], unitPaths: [resourcePath] };
  }
  const children = (label.labels ?? [])
    .map((child) => toPlaceTreeNode(child, [...ancestors, level]))
    .filter((child): child is PlaceTreeNode => child !== undefined);
  // What lies beneath a unit - its departments - follows the unit and is no place of its own.
  if (children.length === 0) return undefined;
  return { ...base, kind: 'area', children, unitPaths: children.flatMap((child) => child.unitPaths) };
};

/**
 * The place structure as a tree of areas and units, as the BFF reads it: the one label tree whose levels are
 * places, from just beneath its top node down to the units.
 */
export const buildPlaceTree = (labelStructure: readonly Label[] | undefined): PlaceTreeNode[] => {
  const root = (labelStructure ?? []).find((candidate) => !isPlaceLabel(candidate) && hasPlaceBeneath(candidate));
  return (root?.labels ?? [])
    .map((label) => toPlaceTreeNode(label, []))
    .filter((node): node is PlaceTreeNode => node !== undefined);
};

export const findPlaceTreeNode = (
  tree: readonly PlaceTreeNode[],
  labelId: string | undefined
): PlaceTreeNode | undefined => {
  if (!labelId) return undefined;
  for (const node of tree) {
    const found = node.labelId === labelId ? node : findPlaceTreeNode(node.children, labelId);
    if (found) return found;
  }
  return undefined;
};

/** How many people hold each place by its own pattern, keyed by the place's path. */
export const countPlaceHolders = (assignments: readonly PlaceManagerAssignment[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    for (const path of new Set(assignment.placePaths.map(normalizeSupportManagementResourcePath))) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
};

/** How many of the place's units nobody holds: the units an errand could not be handed back to a manager on. */
export const countUnitsWithoutHolder = (node: PlaceTreeNode, holderCounts: ReadonlyMap<string, number>): number =>
  node.unitPaths.filter((path) => !holderCounts.get(path)).length;

export interface PlaceTreeFilter {
  /** Words to find in the place's name or in a level above it; every word has to be found. */
  readonly query: string;
  /** Only the units nobody holds. */
  readonly onlyWithoutHolder: boolean;
}

export const isPlaceTreeFiltered = ({ query, onlyWithoutHolder }: PlaceTreeFilter): boolean =>
  query.trim() !== '' || onlyWithoutHolder;

/**
 * The tree narrowed to the units the filter keeps, with the areas that lead to them. The words may sit on different
 * levels, so searching for an area keeps everything beneath it. An area that is kept still stands for all its
 * units, not only the ones shown.
 */
export const filterPlaceTree = (
  tree: readonly PlaceTreeNode[],
  filter: PlaceTreeFilter,
  holderCounts: ReadonlyMap<string, number>
): PlaceTreeNode[] => {
  const terms = filter.query.toLowerCase().split(/\s+/u).filter(Boolean);
  const matchesQuery = (node: PlaceTreeNode): boolean => {
    const names = [...node.ancestors, node].map((level) => level.name.toLowerCase());
    return terms.every((term) => names.some((name) => name.includes(term)));
  };
  const keep = (node: PlaceTreeNode): PlaceTreeNode | undefined => {
    if (node.kind === 'unit') {
      const kept = matchesQuery(node) && (!filter.onlyWithoutHolder || !holderCounts.get(node.resourcePath));
      return kept ? node : undefined;
    }
    const children = node.children.map(keep).filter((child): child is PlaceTreeNode => child !== undefined);
    return children.length > 0 ? { ...node, children } : undefined;
  };
  return tree.map(keep).filter((node): node is PlaceTreeNode => node !== undefined);
};

/** The ids of every area in the tree: what is opened to show a filtered tree in full. */
export const areaIdsOf = (tree: readonly PlaceTreeNode[]): string[] =>
  tree.flatMap((node) => (node.kind === 'area' ? [node.labelId, ...areaIdsOf(node.children)] : []));

/** A person with something to do with a place. */
export interface PlaceHolder {
  readonly adAccount: string;
  readonly origin: string;
  /**
   * How many of the place's units the person holds by the unit's own pattern. That is what makes them a manager
   * there, together with a manager role.
   */
  readonly heldUnitCount: number;
  /**
   * The level the person holds as one pattern covering the place: the area itself, or one above. It lets them
   * reach the errands, but a manager is looked up on the unit's own pattern, so it does not make them one.
   */
  readonly coveringArea?: PlaceLevel;
}

/** The people who hold the place, or part of it, in the order of their accounts. */
export const holdersOfPlace = (node: PlaceTreeNode, assignments: readonly PlaceManagerAssignment[]): PlaceHolder[] => {
  const ownLevel: PlaceLevel = { name: node.name, resourcePath: node.resourcePath };
  const coveringLevels = node.kind === 'area' ? [...node.ancestors, ownLevel] : node.ancestors;
  return assignments
    .flatMap((assignment) => {
      const held = new Set(assignment.placePaths.map(normalizeSupportManagementResourcePath));
      const heldUnitCount = node.unitPaths.filter((path) => held.has(path)).length;
      const coveringArea = coveringLevels.find((level) => held.has(level.resourcePath));
      if (heldUnitCount === 0 && !coveringArea) return [];
      return [
        {
          adAccount: assignment.adAccount,
          origin: assignment.origin,
          heldUnitCount,
          ...(coveringArea ? { coveringArea } : {}),
        },
      ];
    })
    .sort((first, second) => first.adAccount.localeCompare(second.adAccount, 'sv'));
};

/** The assignments with one person's replaced by what the BFF answered after a change: no places, no assignment. */
export const withChangedAssignment = (
  assignments: readonly PlaceManagerAssignment[],
  changed: PlaceManagerAssignment
): PlaceManagerAssignment[] => {
  const account = changed.adAccount.toLowerCase();
  const others = assignments.filter((assignment) => assignment.adAccount.toLowerCase() !== account);
  return changed.placePaths.length > 0 ? [...others, changed] : others;
};
