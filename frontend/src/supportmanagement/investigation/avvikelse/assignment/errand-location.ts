import {
  getPlaceNodes,
  getPlacePresentation,
  hasSubPlaces,
  isSameLabel,
  type PlaceNode,
  type PlacePresentation,
} from '@common/components/json/utils/place-structure';
import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';

/** Where the errand's labels put it, as the place structure describes that node. */
export interface ErrandPlace {
  readonly node: PlaceNode;
  readonly presentation: PlacePresentation;
}

/**
 * The place an errand's labels put it at.
 *
 * This is deliberately not the place in Ärendeuppgifter. Katla writes the place twice: as the
 * reporter's own words in the incoming JSON parameter, and as the label chain Support Management's
 * AccessMapper matches on. The two agree when the errand was routed right and disagree when it was
 * not, and only the labels ever move - the JSON parameter is the record of what was reported.
 *
 * An errand carries every level of its place, so the place is the deepest of its place-structure
 * labels. Two at the same depth are two places, not two levels of one; that is reported as no
 * resolvable place rather than guessed.
 */
export const resolveErrandPlace = (
  labels: readonly Label[] | undefined,
  labelStructure: readonly Label[] | undefined
): ErrandPlace | undefined => {
  const placeNodes = getPlaceNodes(labelStructure);
  if (placeNodes.length === 0) return undefined;

  const carried = placeNodes.filter((node) => (labels ?? []).some((label) => isSameLabel(label, node.label)));
  if (carried.length === 0) return undefined;

  const deepest = Math.max(...carried.map((node) => node.path.length));
  const deepestNodes = carried.filter((node) => node.path.length === deepest);
  if (deepestNodes.length !== 1) return undefined;

  return { node: deepestNodes[0], presentation: getPlacePresentation(deepestNodes[0]) };
};

/** The places an errand can be moved to: the units at the bottom of the structure, as Katla offers them. */
export const selectablePlaceNodes = (labelStructure: readonly Label[] | undefined): PlaceNode[] =>
  getPlaceNodes(labelStructure).filter((node) => !hasSubPlaces(node));

/** One line naming a place, with its department when it has one. */
export const describePlace = (presentation: PlacePresentation): string =>
  presentation.department ? `${presentation.place} — Avdelning: ${presentation.department}` : presentation.place;
