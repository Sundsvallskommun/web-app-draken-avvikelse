import { countWithNoun } from '@common/utils/count-with-noun';

import type { PlaceManagerPerson, PlaceManagerRole } from './place-manager-service';
import type { PlaceHolder, PlaceTreeNode } from './place-manager-tree';

/** AccessMapper's mark on an entry somebody adjusted by hand; every other entry is the seed's. */
const MANUAL_ORIGIN = 'MANUAL';

/** One person on the selected place, as the list shows them. */
export interface PlaceManagerRow {
  readonly adAccount: string;
  /** The person's name, or the account while the name is not known. */
  readonly name: string;
  /**
   * The manager roles the person holds, by name. Empty for a person with the place but without a role, who is not
   * yet a manager there. Undefined while the roles are not known.
   */
  readonly roleLabels?: readonly string[];
  /** What the person holds of the place, in words. */
  readonly extent: string;
  /** How the person's entry came about, in words: read in by the seed, or set by hand since. */
  readonly originLabel: string;
  /** Whether there is anything on the place itself to take away, as opposed to on a level above it. */
  readonly removable: boolean;
}

/** What the person holds of the place: the unit, some or all of an area's units, or an area as one pattern. */
const describeExtent = (node: PlaceTreeNode, holder: PlaceHolder): string => {
  const covering = holder.coveringArea ? `hela ${holder.coveringArea.name} som ett mönster` : undefined;
  const coveringAlone = covering ? `H${covering.slice(1)}` : '';
  if (node.kind === 'unit') return holder.heldUnitCount > 0 ? 'Enheten' : coveringAlone;

  const unitCount = node.unitPaths.length;
  const units =
    holder.heldUnitCount === unitCount
      ? `Alla ${countWithNoun(unitCount, 'enhet', 'enheter')}`
      : `${holder.heldUnitCount} av ${countWithNoun(unitCount, 'enhet', 'enheter')}`;
  if (holder.heldUnitCount === 0) return coveringAlone;
  return covering ? `${units}, och ${covering}` : units;
};

/**
 * The people on a place, named and in the order of their names. The role is what makes a person with the place a
 * manager there, so a person without one is listed all the same - that is the thing to see.
 */
export const toPlaceManagerRows = (
  node: PlaceTreeNode,
  holders: readonly PlaceHolder[],
  people: ReadonlyMap<string, PlaceManagerPerson>,
  roles: readonly PlaceManagerRole[]
): PlaceManagerRow[] =>
  holders
    .map((holder) => {
      const person = people.get(holder.adAccount.toLowerCase());
      return {
        adAccount: holder.adAccount,
        name: person?.displayName ?? holder.adAccount,
        ...(person
          ? { roleLabels: roles.filter((role) => person.roleKeys.includes(role.key)).map((role) => role.label) }
          : {}),
        extent: describeExtent(node, holder),
        originLabel: holder.origin === MANUAL_ORIGIN ? 'Satt för hand' : 'Inläst automatiskt',
        removable: holder.heldUnitCount > 0 || holder.coveringArea?.resourcePath === node.resourcePath,
      };
    })
    .sort((first, second) => first.name.localeCompare(second.name, 'sv'));

/** The accounts whose name and roles are still to be asked for. */
export const accountsWithoutPerson = (
  holders: readonly PlaceHolder[],
  people: ReadonlyMap<string, PlaceManagerPerson>
): string[] => holders.map((holder) => holder.adAccount).filter((account) => !people.has(account.toLowerCase()));
