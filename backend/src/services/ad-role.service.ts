import { ADMIN_GROUP, DEVELOPER_GROUP, SUPERADMIN_GROUP } from '@/config';
import { InternalRole } from '@/interfaces/users.interface';

export type RoleADMapping = {
  [key: string]: InternalRole;
};

/**
 * The AD groups a role setting names. DEVELOPER_GROUP, ADMIN_GROUP and SUPERADMIN_GROUP each take one group
 * or a comma-separated list, and a member of any listed group holds the role. Groups are compared lowercased,
 * the way the SAML groups they are matched against are lowercased at login.
 */
export const readRoleGroups = (configured: string | undefined): string[] =>
  (configured ?? '')
    .split(',')
    .map(group => group.trim().toLocaleLowerCase())
    .filter(Boolean);

/**
 * Maps every group of every setting to its role. A group named in more than one setting takes the role of
 * the last one, as it did when each setting held a single group.
 */
export const buildRoleADMapping = (settings: ReadonlyArray<readonly [string | undefined, InternalRole]>): RoleADMapping => {
  const mapping: RoleADMapping = {};
  for (const [configured, role] of settings) {
    for (const group of readRoleGroups(configured)) mapping[group] = role;
  }
  return mapping;
};

export const roleADMapping: RoleADMapping = buildRoleADMapping([
  [DEVELOPER_GROUP, 'draken_developer'],
  [ADMIN_GROUP, 'draken_admin'],
  [SUPERADMIN_GROUP, 'draken_superadmin'],
]);
