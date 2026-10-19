import { defaultPermissions, getPermissions, getRole } from '@/services/authorization.service';

import { MOCK_ADMIN_GROUP, MOCK_DEVELOPER_GROUP, MOCK_SUPERADMIN_GROUP } from './helpers/mock-data';

describe('authorization.service', () => {
  describe('defaultPermissions', () => {
    it('grants nothing by default', () => {
      expect(defaultPermissions()).toEqual({
        canEditSupportManagement: false,
        canAdministerPlaceManagers: false,
      });
    });

    it('returns a fresh object each call (no shared mutable state)', () => {
      const permissions = defaultPermissions();
      permissions.canEditSupportManagement = true;
      expect(defaultPermissions().canEditSupportManagement).toBe(false);
    });
  });

  describe('getPermissions (internal roles)', () => {
    it('maps draken_superadmin to support edit and the place managers', () => {
      expect(getPermissions(['draken_superadmin'], true)).toEqual({
        canEditSupportManagement: true,
        canAdministerPlaceManagers: true,
      });
    });

    it('maps draken_developer to support edit only', () => {
      expect(getPermissions(['draken_developer'], true)).toEqual({
        canEditSupportManagement: true,
        canAdministerPlaceManagers: false,
      });
    });

    it('unions permissions across multiple roles', () => {
      // draken_admin contributes support edit; superadmin adds the place managers.
      expect(getPermissions(['draken_admin', 'draken_superadmin'], true)).toEqual({
        canEditSupportManagement: true,
        canAdministerPlaceManagers: true,
      });
    });

    it('ignores unknown roles', () => {
      expect(getPermissions(['not_a_role'], true)).toEqual(defaultPermissions());
    });
  });

  describe('getPermissions (external AD groups)', () => {
    it('resolves an AD group through roleADMapping before collecting permissions', () => {
      expect(getPermissions([MOCK_DEVELOPER_GROUP])).toEqual({
        canEditSupportManagement: true,
        canAdministerPlaceManagers: false,
      });
    });

    it('grants nothing to a user without any mapped group', () => {
      expect(getPermissions([])).toEqual(defaultPermissions());
    });
  });

  describe('getRole', () => {
    it('maps a single AD group directly to its internal role', () => {
      expect(getRole([MOCK_DEVELOPER_GROUP])).toBe('draken_developer');
    });

    it('resolves to the role with the lowest RoleOrderEnum index when several groups are present', () => {
      // getRole sorts matched roles by RoleOrderEnum ascending and takes the first;
      // draken_developer has index 0, so it wins over admin/superadmin here.
      expect(getRole([MOCK_ADMIN_GROUP, MOCK_SUPERADMIN_GROUP, MOCK_DEVELOPER_GROUP])).toBe('draken_developer');
    });
  });
});
