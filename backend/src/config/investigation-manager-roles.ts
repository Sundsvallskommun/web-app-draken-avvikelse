/**
 * The AccessMapper roles that may receive an errand handed back from a LEX investigation.
 *
 * The role is AccessMapper's answer, read per user from `access/ad/{adId}?type=role`, not a Draken
 * AD group: a place's managers are configured where their access to the place is configured, and
 * keeping the two in one system is what stops them drifting apart.
 *
 * Array order is display order. A role AccessMapper reports that is not listed here is not a manager
 * for this purpose and is ignored, so an unrelated role can never receive an errand.
 */
export interface InvestigationManagerRole {
  /**
   * The role name AccessMapper reports for a user - the `access[].pattern` of a group's `role` entry, for example
   * `UNIT_MANAGER` (`readAccessMapperRoles`). Not the group's `groupId`, which is a UUID.
   */
  readonly key: string;
  /** Swedish label, used as the group heading in the client's picker. */
  readonly label: string;
}

export const INVESTIGATION_MANAGER_ROLES: readonly InvestigationManagerRole[] = Object.freeze([
  Object.freeze({ key: 'UNIT_MANAGER', label: 'Enhetschef' }),
  Object.freeze({ key: 'HEAD_OF_OPERATIONS', label: 'Verksamhetschef' }),
]);

/** AccessMapper's own filter value for reading a user's roles rather than their other access. */
export const ACCESS_MAPPER_ROLE_TYPE = 'role';

const rolesByKey = new Map(INVESTIGATION_MANAGER_ROLES.map(role => [role.key.trim().toUpperCase(), role]));

export const findInvestigationManagerRole = (roleName: string | undefined): InvestigationManagerRole | undefined =>
  typeof roleName === 'string' ? rolesByKey.get(roleName.trim().toUpperCase()) : undefined;
