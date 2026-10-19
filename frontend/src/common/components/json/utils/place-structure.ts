import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';

/**
 * Platsvalet skrivs av web-app-katla-sm som namn ur labelstrukturen: `orgName` är den valda noden och
 * `parentOrgName` dess förälder. Vilken nivå namnen ligger på framgår inte av den sparade datan, så
 * strukturen måste slås upp för att veta vad som är anläggning och vad som är avdelning. Nivåerna
 * speglar Katlas frontend/src/utils/label-structure.ts och måste hållas i takt med den.
 */
const PLACE_STRUCTURE_ROOT_NAMES = new Set(['platsstruktur', 'place_structure', 'placestructure']);
const PLACE_STRUCTURE_ROOT_LEVEL = 2;
const PLACE_LEVEL = 6;
const DEPARTMENT_LEVEL = 7;

export interface PlaceNode {
  /** Labelnoden själv */
  label: Label;
  /** Kedjan från platsstrukturens rot ner till och med noden */
  path: Label[];
}

export interface PlacePresentation {
  place: string;
  department?: string;
}

export interface PlaceEmployment<TManager = unknown> {
  orgId?: number;
  orgName?: string;
  manager?: TManager;
}

export interface PlaceEmploymentMatch<TManager = unknown> {
  node: PlaceNode;
  employment: PlaceEmployment<TManager>;
}

export interface FacilityPlaceInfo<TManager = unknown> {
  orgId?: number;
  orgName: string;
  parentOrgName?: string;
  manager?: TManager;
}

const normalizeName = (value: string | undefined): string => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const labelName = (label: Label): string => label.displayName || label.resourceName;

export const isSameLabel = (left: Label | undefined, right: Label | undefined): boolean => {
  if (!left || !right) return false;
  if (left.id && right.id) return left.id === right.id;
  if (left.resourcePath && right.resourcePath) return left.resourcePath === right.resourcePath;
  return normalizeName(left.resourceName) === normalizeName(right.resourceName);
};

const getPlaceStructureRoot = (labelStructure: readonly Label[] | undefined): Label | undefined =>
  labelStructure?.find(
    (label) =>
      PLACE_STRUCTURE_ROOT_NAMES.has(normalizeName(label.resourceName)) ||
      PLACE_STRUCTURE_ROOT_NAMES.has(normalizeName(label.displayName))
  );

/** Alla noder under platsstrukturens rot, var och en med sin väg från roten */
export const getPlaceNodes = (labelStructure: readonly Label[] | undefined): PlaceNode[] => {
  const root = getPlaceStructureRoot(labelStructure);
  if (!root) return [];

  const nodes: PlaceNode[] = [];
  const traverse = (label: Label, ancestors: Label[]) => {
    const path = [...ancestors, label];
    nodes.push({ label, path });
    label.labels?.forEach((child) => traverse(child, path));
  };

  root.labels?.forEach((child) => traverse(child, [root]));

  return nodes;
};

export const hasSubPlaces = (node: PlaceNode): boolean => (node.label.labels?.length ?? 0) > 0;

export const placeName = (node: PlaceNode): string => labelName(node.label);

/** Föräldern inom platsstrukturen. Roten räknas inte som förälder. */
const placeParentName = (node: PlaceNode): string | undefined => {
  const parent = node.path.at(-2);
  return parent && !isSameLabel(parent, node.path[0]) ? labelName(parent) : undefined;
};

const labelAtLevel = (node: PlaceNode, level: number): Label | undefined =>
  node.path[level - PLACE_STRUCTURE_ROOT_LEVEL];

/**
 * Nivå 6 är platsen som visas. Nivå 7 är en valfri avdelning under platsen. Ett ofullständigt val på
 * nivå 3–5 visas som noden själv, precis som i Katla.
 */
export const getPlacePresentation = (node: PlaceNode): PlacePresentation => {
  const place = labelAtLevel(node, PLACE_LEVEL) ?? node.label;
  const department = labelAtLevel(node, DEPARTMENT_LEVEL);

  return {
    place: labelName(place),
    ...(department ? { department: labelName(department) } : {}),
  };
};

/**
 * Slår upp en nod på visningsnamn. Sista nivån är inte unik i sig — "Blå" finns under flera enheter —
 * så föräldern används som kvalificerare. Flera träffar räknas som ingen träff, då visas namnen som de
 * sparades i stället för att en gissad nivåtolkning presenteras som fakta.
 */
export const findPlaceNode = (
  nodes: readonly PlaceNode[],
  name: string | undefined,
  parentName?: string
): PlaceNode | undefined => {
  const wanted = normalizeName(name);
  if (!wanted) return undefined;

  const matches = nodes.filter((node) => normalizeName(placeName(node)) === wanted);
  if (matches.length <= 1) return matches[0];

  const wantedParent = normalizeName(parentName);
  if (!wantedParent) return undefined;

  const withParent = matches.filter((node) => normalizeName(placeParentName(node)) === wantedParent);
  return withParent.length === 1 ? withParent[0] : undefined;
};

const isDescendantOrSelf = (node: PlaceNode, ancestor: PlaceNode): boolean =>
  node.path.some((label) => isSameLabel(label, ancestor.label));

/** Finds the first employment whose organisation name resolves unambiguously in the place structure. */
export const findPlaceEmploymentMatch = <TManager>(
  nodes: readonly PlaceNode[],
  employments: readonly PlaceEmployment<TManager>[],
  selectedNode?: PlaceNode
): PlaceEmploymentMatch<TManager> | undefined => {
  const matches: PlaceEmploymentMatch<TManager>[] = [];
  for (const employment of employments) {
    const node = findPlaceNode(nodes, employment.orgName);
    if (node) matches.push({ node, employment });
  }

  return selectedNode
    ? matches.find((match) => isDescendantOrSelf(selectedNode, match.node)) ?? matches[0]
    : matches[0];
};

/** A saved facility wins over employment prefill, while the match itself remains usable for later changes. */
export const getEmploymentPrefillNode = <TManager>(
  employmentMatch: PlaceEmploymentMatch<TManager> | undefined,
  persistedOrgName: string | undefined
): PlaceNode | undefined => (persistedOrgName?.trim() ? undefined : employmentMatch?.node);

export const placeKey = (node: PlaceNode): string => node.label.resourcePath || node.path.map(labelName).join('/');

export const findPlaceNodeByKey = (nodes: readonly PlaceNode[], key: string): PlaceNode | undefined =>
  nodes.find((node) => placeKey(node) === key);

/** Sökindexet innehåller samtliga användarnivåer 3–7 men inte den tekniska roten på nivå 2. */
const placeSearchText = (node: PlaceNode): string =>
  node.path
    .slice(1, DEPARTMENT_LEVEL - PLACE_STRUCTURE_ROOT_LEVEL + 1)
    .map(labelName)
    .join(' ');

/** Sökord får ligga på olika nivåer i strukturen och behöver därför inte stå direkt efter varandra. */
export const matchesPlaceSearch = (node: PlaceNode, query: string): boolean => {
  const searchableText = normalizeName(placeSearchText(node));
  const terms = normalizeName(query).split(' ').filter(Boolean);
  return terms.every((term) => searchableText.includes(term));
};

/** Närmaste föräldern inom platsstrukturen. Den tekniska roten returneras aldrig som valbar plats. */
export const getParentPlaceNode = (nodes: readonly PlaceNode[], node: PlaceNode): PlaceNode | undefined => {
  const parentLabel = node.path.at(-2);
  if (!parentLabel || isSameLabel(parentLabel, node.path[0])) return undefined;

  return nodes.find((candidate) => isSameLabel(candidate.label, parentLabel));
};

/** Direkta barn till en nod, som PlaceNode så att de bär med sig hela sin väg */
export const getSubPlaceNodes = (nodes: readonly PlaceNode[], parent: PlaceNode): PlaceNode[] =>
  nodes.filter((node) => node.path.length === parent.path.length + 1 && isSameLabel(node.path.at(-2), parent.label));

/** Adds organisation metadata only when the selected place belongs to the matched employment branch. */
export const getFacilityPlaceInfo = <TManager>(
  node: PlaceNode,
  employmentMatch: PlaceEmploymentMatch<TManager> | undefined
): FacilityPlaceInfo<TManager> => {
  const isEmploymentPlace = Boolean(employmentMatch && isSameLabel(node.label, employmentMatch.node.label));
  const withinEmploymentBranch = Boolean(employmentMatch && isDescendantOrSelf(node, employmentMatch.node));

  return {
    orgId: isEmploymentPlace ? employmentMatch?.employment.orgId : undefined,
    orgName: placeName(node),
    parentOrgName: placeParentName(node),
    manager: withinEmploymentBranch ? employmentMatch?.employment.manager : undefined,
  };
};
