import { type HandlerGroupRole, resolveHeldHandlerRoleKeys } from './handler-group-roles';

/**
 * The handler roles that follow up an approved measure: mark it carried out and say whether it had the effect
 * sought. The unit owns what is done in it, so it is the unit's managers who do it, whoever proposed it.
 */
const MEASURE_FOLLOW_UP_ROLE_KEYS: readonly string[] = Object.freeze(['enhetschef', 'verksamhetschef']);

/** Whether the user follows up measures through their role. */
export const mayFollowUpMeasuresByRole = (handlerRoles: readonly HandlerGroupRole[], userGroups: readonly string[]): boolean =>
  resolveHeldHandlerRoleKeys(handlerRoles, userGroups).some(key => MEASURE_FOLLOW_UP_ROLE_KEYS.includes(key));
