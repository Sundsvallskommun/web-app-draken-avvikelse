import { Admin, HandlerRole } from '@common/services/user-service';

export interface HandlerRoleGroup {
  key: string;
  label: string;
  administrators: Admin[];
}

const byLastName = (first: Admin, second: Admin): number => (first.lastName > second.lastName ? 1 : -1);

/**
 * Splits the handler list into one group per configured role, in the deployment's configured order,
 * leaving out the roles nobody holds. A handler holding two roles appears under both, because the
 * reason to group is to answer "who can take this next", and that person can take it in either
 * capacity.
 */
export const groupHandlersByRole = (administrators: Admin[], roles: HandlerRole[]): HandlerRoleGroup[] =>
  roles
    .map((role) => ({
      key: role.key,
      label: role.label,
      administrators: administrators
        .filter((administrator) => administrator.roleKeys.includes(role.key))
        .sort(byLastName),
    }))
    .filter((group) => group.administrators.length > 0);
