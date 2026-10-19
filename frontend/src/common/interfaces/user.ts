interface Permissions {
  canEditSupportManagement: boolean;
}

export interface User {
  name: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  permissions: Permissions;
  /** The handler roles the user holds through their AD groups. */
  roleKeys: string[];
  /** Whether the user is in the superadmin group - in the avvikelse applications, the administrators. */
  superadmin?: boolean;
}
