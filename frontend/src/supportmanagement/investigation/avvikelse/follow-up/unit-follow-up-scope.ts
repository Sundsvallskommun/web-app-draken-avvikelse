import type { InvestigationViewer } from '../../investigation-variant';
import {
  HEAD_OF_OPERATIONS_ROLE_KEY,
  LEX_INVESTIGATOR_ROLE_KEY,
  LEX_MANAGER_ROLE_KEY,
  MAS_MAR_ROLE_KEY,
  UNIT_MANAGER_ROLE_KEY,
} from '../assignment/avvikelse-handler-roles';

/** How much of the organisation a viewer follows up: their own unit, several units, or the whole area. */
type UnitFollowUpScope = 'unit' | 'units' | 'area';

/**
 * The handler roles by how much they follow up, widest first, as the deployment keys them in
 * `HEALTHCAREDEVIATION_HANDLER_ROLES`. LEX and MAS/MAR work across the whole area, a head of operations
 * across the units beneath them, a unit manager on their own unit.
 */
const SCOPE_ROLE_KEYS: readonly { readonly scope: UnitFollowUpScope; readonly roleKeys: readonly string[] }[] =
  Object.freeze([
    { scope: 'area', roleKeys: [LEX_MANAGER_ROLE_KEY, LEX_INVESTIGATOR_ROLE_KEY, MAS_MAR_ROLE_KEY] },
    { scope: 'units', roleKeys: [HEAD_OF_OPERATIONS_ROLE_KEY] },
    { scope: 'unit', roleKeys: [UNIT_MANAGER_ROLE_KEY] },
  ]);

const SCOPE_LABELS: Readonly<Record<UnitFollowUpScope, string>> = Object.freeze({
  unit: 'Enhet',
  units: 'Enheter',
  area: 'Verksamhetsområde',
});

/**
 * The widest scope among the viewer's roles. An administrator follows up the whole area. Someone holding
 * none of the roles keeps the name the follow-up has always had.
 */
const resolveUnitFollowUpScope = ({ roleKeys = [], superadmin }: InvestigationViewer): UnitFollowUpScope => {
  if (superadmin) return 'area';
  return (
    SCOPE_ROLE_KEYS.find((candidate) => candidate.roleKeys.some((key) => roleKeys.includes(key)))?.scope ?? 'units'
  );
};

/** The sidebar entry, named before anything is read: by the viewer's role alone. */
export const unitFollowUpMenuLabel = (viewer: InvestigationViewer): string =>
  SCOPE_LABELS[resolveUnitFollowUpScope(viewer)];

/**
 * The view's heading. A unit manager may be responsible for more than one unit, which only the errands
 * Support Management lets them read can tell: once those span several units, the heading says so.
 */
export const unitFollowUpHeading = (viewer: InvestigationViewer, unitCount: number): string => {
  const scope = resolveUnitFollowUpScope(viewer);
  return SCOPE_LABELS[scope === 'unit' && unitCount > 1 ? 'units' : scope];
};
