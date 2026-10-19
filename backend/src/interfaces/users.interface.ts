export interface User {
  id: number;
  personId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  username: string;
  groups: string[];
  permissions: Permissions;
}
export interface Permissions {
  canEditSupportManagement: boolean;
  /** Setting which places a manager has, in AccessMapper. Changes who reaches which errands, so it is superadmin's. */
  canAdministerPlaceManagers: boolean;
}

/** Internal roles */
export type InternalRole = 'draken_developer' | 'draken_admin' | 'draken_superadmin';
