import { buildRoleADMapping, readRoleGroups } from '@/services/ad-role.service';

describe('readRoleGroups', () => {
  it('reads one group or a comma-separated list, trimmed and lowercased', () => {
    expect(readRoleGroups('MOCK_ADMINS')).toEqual(['mock_admins']);
    expect(readRoleGroups(' MOCK_UNIT_MANAGERS, MOCK_LEX_MANAGERS ,,MOCK_MAS_MAR ')).toEqual([
      'mock_unit_managers',
      'mock_lex_managers',
      'mock_mas_mar',
    ]);
    expect(readRoleGroups(undefined)).toEqual([]);
    expect(readRoleGroups('  ')).toEqual([]);
  });
});

describe('buildRoleADMapping', () => {
  it('gives every group of a listed setting the role of that setting', () => {
    expect(
      buildRoleADMapping([
        ['MOCK_DEVELOPERS', 'draken_developer'],
        ['MOCK_UNIT_MANAGERS,MOCK_LEX_MANAGERS', 'draken_admin'],
        ['MOCK_SUPERADMINS', 'draken_superadmin'],
      ]),
    ).toEqual({
      mock_developers: 'draken_developer',
      mock_unit_managers: 'draken_admin',
      mock_lex_managers: 'draken_admin',
      mock_superadmins: 'draken_superadmin',
    });
  });

  it('lets the later setting win for a group named in more than one, and skips an unset setting', () => {
    expect(
      buildRoleADMapping([
        ['MOCK_SHARED', 'draken_admin'],
        [undefined, 'draken_developer'],
        ['mock_shared', 'draken_superadmin'],
      ]),
    ).toEqual({ mock_shared: 'draken_superadmin' });
  });
});
