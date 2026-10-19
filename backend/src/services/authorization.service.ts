import { AUTHORIZED_GROUPS } from '@config';
import { InternalRole, Permissions } from '@interfaces/users.interface';

import { logger } from '@/utils/logger';

import { roleADMapping } from './ad-role.service';

export function authorizeGroups(groups: string) {
  logger.debug(`authorizing groups ${groups}`);
  logger.debug(`against ${AUTHORIZED_GROUPS}`);
  const authorizedGroupsList = AUTHORIZED_GROUPS!.split(',');
  const groupsList = groups.split(',').map((g: string) => g.toLowerCase());
  return authorizedGroupsList.some(authorizedGroup => groupsList.includes(authorizedGroup.toLowerCase()));
}

export const defaultPermissions: () => Permissions = () => ({
  canEditSupportManagement: false,
  canAdministerPlaceManagers: false,
});

enum RoleOrderEnum {
  'draken_developer',
  'draken_admin',
  'draken_superadmin',
}

const roles = new Map<InternalRole, Partial<Permissions>>([
  [
    'draken_developer',
    {
      canEditSupportManagement: true,
    },
  ],
  [
    'draken_admin',
    {
      canEditSupportManagement: true,
    },
  ],
  [
    'draken_superadmin',
    {
      canEditSupportManagement: true,
      canAdministerPlaceManagers: true,
    },
  ],
]);

/**
 *
 * @param groups Array of groups/roles
 * @param internalGroups Whether to use internal groups or external group-mappings
 * @returns collected permissions for all matching role groups
 */
export const getPermissions = (groups: InternalRole[] | string[], internalGroups = false): Permissions => {
  const permissions: Permissions = defaultPermissions();
  groups.forEach(group => {
    const groupLower = group.toLowerCase();
    const role = internalGroups ? (groupLower as InternalRole) : (roleADMapping[groupLower] as InternalRole);
    if (roles.has(role)) {
      const groupPermissions = roles.get(role)!;
      (Object.keys(groupPermissions) as Array<keyof Permissions>).forEach(permission => {
        if (groupPermissions[permission] === true) {
          permissions[permission] = true as Permissions[typeof permission];
        }
      });
    }
  });
  return permissions;
};

/**
 * Ensures to return only the role with most permissions
 * @param groups List of AD roles
 * @returns role with most permissions
 */
export const getRole = (groups: string[]) => {
  if (groups.length == 1) return roleADMapping[groups[0]]; // meta_read

  const roles: InternalRole[] = [];
  groups.forEach(group => {
    const groupLower = group.toLowerCase();
    const role = roleADMapping[groupLower];
    if (role) {
      roles.push(role);
    }
  });

  return roles.sort((a, b) => RoleOrderEnum[a] - RoleOrderEnum[b])[0];
};
