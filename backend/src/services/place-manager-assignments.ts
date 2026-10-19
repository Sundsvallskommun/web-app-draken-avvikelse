import { isInvestigationLocationLabelClassification } from '@/config/investigation-handover-labels';
import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import { type Access, AccessAccessLevelEnum, type AccessType, type AccessUser } from '@/data-contracts/access-mapper/data-contracts';
import type { Label } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';

/**
 * Which places a manager has, as AccessMapper holds it.
 *
 * A person is a manager for a place when two things are true: they hold the place's own label pattern, and they
 * hold a manager role. The role comes with an AD group, ordered outside Draken, and brings the role's rights with
 * it. The places are per person, and those are what is administered here - nothing else on the person is touched.
 */

/** The access type whose patterns are written against Support Management label resource paths. */
const LABEL_ACCESS_TYPE = 'label';
const PLACE_PATTERN_SUFFIX = '/**';

/** An entry that was adjusted by hand, as opposed to one the seed created. */
export const MANUAL_ACCESS_ORIGIN = 'MANUAL';

/** The pattern AccessMapper stores for a place: the place's own path, covering everything under it. */
export const placeAccessPattern = (placeResourcePath: string): string =>
  `${normalizeSupportManagementResourcePath(placeResourcePath)}${PLACE_PATTERN_SUFFIX}`;

const isLabelAccess = (accessType: AccessType): boolean => accessType.type?.trim().toLowerCase() === LABEL_ACCESS_TYPE;

/**
 * The place a label pattern stands for, or undefined when the pattern is about something else - a category, the
 * LEX access label - or about the place structure as a whole, which is a role's reach and no single place.
 */
const placePathOfPattern = (pattern: string | undefined, placeRootPath: string): string | undefined => {
  if (!pattern?.endsWith(PLACE_PATTERN_SUFFIX)) return undefined;
  const path = normalizeSupportManagementResourcePath(pattern.slice(0, -PLACE_PATTERN_SUFFIX.length));
  return path.startsWith(`${normalizeSupportManagementResourcePath(placeRootPath)}/`) ? path : undefined;
};

export interface PlaceManagerAssignment {
  readonly adAccount: string;
  /** How the entry came about: the seed's, or adjusted by hand. */
  readonly origin: string;
  /** The places the person holds, by resource path. Usually units; a path higher up covers the whole area. */
  readonly placePaths: string[];
}

/** One person's places, read from their AccessMapper entry. A person without any place is no assignment. */
export const readPlaceManagerAssignment = (accessUser: AccessUser, placeRootPath: string): PlaceManagerAssignment | undefined => {
  const adAccount = accessUser.userId?.trim();
  if (!adAccount) return undefined;
  const placePaths = (accessUser.accessByType ?? [])
    .filter(isLabelAccess)
    .flatMap(accessType => accessType.access ?? [])
    .map(access => placePathOfPattern(access.pattern, placeRootPath))
    .filter((path): path is string => path !== undefined);
  if (placePaths.length === 0) return undefined;
  return { adAccount, origin: accessUser.origin ?? '', placePaths: [...new Set(placePaths)] };
};

const isPlace = (label: Label): boolean => isInvestigationLocationLabelClassification(label.classification);
const hasPlaceBeneath = (label: Label): boolean => (label.labels ?? []).some(child => isPlace(child) || hasPlaceBeneath(child));

/** The top node of the place structure: the one tree whose levels are places. */
export const findPlaceStructureRoot = (labelStructure: readonly Label[] | undefined): Label | undefined =>
  (labelStructure ?? []).find(root => !isPlace(root) && hasPlaceBeneath(root));

export const requirePlaceRootPath = (labelStructure: readonly Label[] | undefined): string => {
  const rootPath = findPlaceStructureRoot(labelStructure)?.resourcePath?.trim();
  if (!rootPath) throw new HttpException(502, 'Support Management label metadata has no place structure');
  return normalizeSupportManagementResourcePath(rootPath);
};

/**
 * A unit is the deepest place on its branch: the level a manager is set on, and the one AccessMapper's patterns are
 * written against. What lies beneath a unit - its departments - follows the unit.
 */
const isUnit = (label: Label): boolean => isPlace(label) && !hasPlaceBeneath(label);

const unitPathsBeneath = (label: Label): string[] => {
  if (isUnit(label)) {
    const path = label.resourcePath?.trim();
    if (!path) throw new HttpException(502, 'Support Management label metadata contains a place without resourcePath');
    return [normalizeSupportManagementResourcePath(path)];
  }
  return (label.labels ?? []).flatMap(unitPathsBeneath);
};

export interface AdministeredPlace {
  readonly labelId: string;
  readonly displayName: string;
  /** The place's own path. */
  readonly resourcePath: string;
  /** The units the place stands for: itself when it is a unit, every unit beneath it when it is an area. */
  readonly unitPaths: string[];
}

/**
 * Resolves a place named by label id, the identity a label has. It has to be in the place structure, exactly once,
 * and be a unit or have units beneath it - not the structure's top node, and not a department beneath a unit.
 */
export const resolveAdministeredPlace = (labelStructure: readonly Label[] | undefined, labelId: string): AdministeredPlace => {
  const root = findPlaceStructureRoot(labelStructure);
  const matches: Label[] = [];
  const visit = (nodes: readonly Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.id === labelId) matches.push(node);
      visit(node.labels);
    }
  };
  visit(root?.labels);

  if (matches.length === 0) throw new HttpException(400, 'The selected place does not exist in the place structure');
  if (matches.length > 1) throw new HttpException(502, `Label id ${labelId} resolved ${matches.length} times in the place structure`);
  const [place] = matches;
  const unitPaths = unitPathsBeneath(place);
  if (unitPaths.length === 0) throw new HttpException(400, 'The selected label is not a place a manager is set on');
  const resourcePath = place.resourcePath?.trim();
  if (!resourcePath) throw new HttpException(502, 'Support Management label metadata contains a place without resourcePath');

  return {
    labelId,
    displayName: place.displayName || place.resourceName || resourcePath,
    resourcePath: normalizeSupportManagementResourcePath(resourcePath),
    unitPaths,
  };
};

export type PlaceManagerChange =
  | { readonly kind: 'none' }
  | { readonly kind: 'create' | 'update'; readonly accessUser: AccessUser }
  | { readonly kind: 'delete' };

interface PlaceChanges {
  /** The top of the place structure, which tells a place pattern from every other label pattern. */
  readonly placeRootPath: string;
  /** Places to give the person, by resource path. */
  readonly addPaths: readonly string[];
  /** Places to take from the person, by resource path. */
  readonly removePaths: readonly string[];
}

const patternKey = (pattern: string | undefined): string => normalizeSupportManagementResourcePath(pattern ?? '');

/**
 * The person's AccessMapper entry with places added and removed, and everything else on it left as it is: a role,
 * the role's rights and labels that are not places are not this view's to change.
 *
 * New places are written beside the places the person already has. An entry that is changed is marked as adjusted
 * by hand, so that it can be told from what the seed created. One that is left granting nothing is removed rather
 * than kept empty.
 */
export const applyPlaceChanges = (existing: AccessUser | undefined, adAccount: string, changes: PlaceChanges): PlaceManagerChange => {
  const removed = new Set(changes.removePaths.map(placeAccessPattern).map(patternKey));
  const before = existing?.accessByType ?? [];
  const held = new Set(
    before
      .filter(isLabelAccess)
      .flatMap(accessType => accessType.access ?? [])
      .map(access => patternKey(access.pattern)),
  );
  const added: Access[] = [...new Set(changes.addPaths.map(placeAccessPattern))]
    .filter(pattern => !removed.has(patternKey(pattern)) && !held.has(patternKey(pattern)))
    .map(pattern => ({ pattern, accessLevel: AccessAccessLevelEnum.RW }));
  const removesSomething = [...removed].some(pattern => held.has(pattern));
  if (added.length === 0 && !removesSomething) return { kind: 'none' };

  const withoutRemoved = before.map(accessType =>
    isLabelAccess(accessType)
      ? { ...accessType, access: (accessType.access ?? []).filter(access => !removed.has(patternKey(access.pattern))) }
      : accessType,
  );
  // Beside the places already there, in the same entry: a person's places are read as one list.
  const holdsPlaces = (accessType: AccessType): boolean =>
    isLabelAccess(accessType) && (accessType.access ?? []).some(access => placePathOfPattern(access.pattern, changes.placeRootPath) !== undefined);
  const targetIndex = [withoutRemoved.findIndex(holdsPlaces), withoutRemoved.findIndex(isLabelAccess)].find(index => index >= 0);
  const withAdded =
    added.length === 0
      ? withoutRemoved
      : targetIndex === undefined
        ? [...withoutRemoved, { type: LABEL_ACCESS_TYPE, access: added }]
        : withoutRemoved.map((accessType, index) =>
            index === targetIndex ? { ...accessType, access: [...(accessType.access ?? []), ...added] } : accessType,
          );
  const accessByType = withAdded.filter(accessType => !isLabelAccess(accessType) || (accessType.access ?? []).length > 0);

  if (accessByType.length === 0) return existing ? { kind: 'delete' } : { kind: 'none' };
  return {
    kind: existing ? 'update' : 'create',
    accessUser: { userId: existing?.userId ?? adAccount, origin: MANUAL_ACCESS_ORIGIN, accessByType },
  };
};
