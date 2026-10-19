import {
  findHandlerGroupRole,
  findUnauthorizedHandlerRoleGroups,
  resolveHandlerGroupRoles,
  resolveHeldHandlerRoleKeys,
} from '@/config/handler-group-roles';

const configured = JSON.stringify([
  {
    key: 'enhetschef',
    label: 'Enhetschef',
    group: 'MOCK_UNIT_MANAGERS',
    measures: { roleName: 'UNIT_MANAGER', measureGroup: 'UNIT_MANAGER', decides: true },
  },
  { key: 'lex-ansvarig', label: 'LEX-ansvarig', group: 'MOCK_LEX_MANAGERS' },
  { key: 'mas-mar', label: 'MAS/MAR', group: 'MOCK_MAS_MAR', measures: { roleName: 'MAR_MAS', measureGroup: 'HSL_MAS_MAR' } },
]);

describe('resolveHandlerGroupRoles', () => {
  it('reads the roles in display order, with measure registration only where a role carries it', () => {
    const roles = resolveHandlerGroupRoles(configured);

    expect(roles).toEqual([
      {
        key: 'enhetschef',
        label: 'Enhetschef',
        group: 'MOCK_UNIT_MANAGERS',
        measures: { roleName: 'UNIT_MANAGER', measureGroup: 'UNIT_MANAGER', decides: true },
      },
      { key: 'lex-ansvarig', label: 'LEX-ansvarig', group: 'MOCK_LEX_MANAGERS' },
      { key: 'mas-mar', label: 'MAS/MAR', group: 'MOCK_MAS_MAR', measures: { roleName: 'MAR_MAS', measureGroup: 'HSL_MAS_MAR', decides: false } },
    ]);
    expect(findHandlerGroupRole(roles, 'lex-ansvarig')?.group).toBe('MOCK_LEX_MANAGERS');
  });

  it('refuses a missing setting: the roles are required', () => {
    expect(() => resolveHandlerGroupRoles('')).toThrow('HEALTHCAREDEVIATION_HANDLER_ROLES must be set');
    expect(() => resolveHandlerGroupRoles('   ')).toThrow('HEALTHCAREDEVIATION_HANDLER_ROLES must be set');
  });

  const role = { key: 'enhetschef', label: 'Enhetschef', group: 'MOCK_UNIT_MANAGERS' };
  const measures = { roleName: 'UNIT_MANAGER', measureGroup: 'UNIT_MANAGER' };

  it.each([
    ['{', 'valid JSON'],
    ['{}', 'must be an array'],
    ['[]', 'at least one role'],
    [JSON.stringify([null]), 'must be an object'],
    [JSON.stringify([{ ...role, unknown: true }]), 'unknown keys'],
    [JSON.stringify([{ ...role, key: 'Enhetschef' }]), 'kebab-case'],
    [JSON.stringify([role, role]), 'duplicates role key'],
    [JSON.stringify([{ ...role, group: '' }]), '.group must be a non-empty string'],
    [JSON.stringify([{ ...role, measures: [] }]), 'measures must be an object'],
    [JSON.stringify([{ ...role, measures: { ...measures, measureTypeNames: ['EDUCATION'] } }]), 'unknown keys'],
    [JSON.stringify([{ ...role, measures: { ...measures, roleName: '' } }]), 'roleName must be a non-empty string'],
    [JSON.stringify([{ ...role, measures: { ...measures, measureGroup: '' } }]), 'measureGroup must be a non-empty string'],
    [JSON.stringify([{ ...role, measures: { ...measures, decides: 'yes' } }]), 'decides must be a boolean'],
    [
      JSON.stringify([
        { ...role, measures },
        { ...role, key: 'annan-roll', measures: { ...measures, measureGroup: 'OTHER' } },
      ]),
      'registers UNIT_MANAGER differently',
    ],
    [
      JSON.stringify([
        { ...role, measures },
        { ...role, key: 'annan-roll', measures: { ...measures, decides: true } },
      ]),
      'registers UNIT_MANAGER differently',
    ],
  ])('refuses %s', (value, message) => {
    expect(() => resolveHandlerGroupRoles(value)).toThrow(message);
  });

  // A LEX manager registers exactly as a LEX investigator does.
  it('lets several roles register as the same namespace role when they register alike', () => {
    const shared = resolveHandlerGroupRoles(
      JSON.stringify([
        { ...role, measures },
        { ...role, key: 'annan-roll', group: 'MOCK_OTHER_GROUP', measures },
      ]),
    );
    expect(shared?.map(entry => entry.measures?.roleName)).toEqual(['UNIT_MANAGER', 'UNIT_MANAGER']);
  });
});

describe('findUnauthorizedHandlerRoleGroups', () => {
  const roles = resolveHandlerGroupRoles(configured);

  it('names the role groups and the superadmin group that cannot log in', () => {
    expect(findUnauthorizedHandlerRoleGroups(roles, 'MOCK_SUPERADMINS', 'mock_unit_managers, MOCK_OTHER')).toEqual([
      'MOCK_LEX_MANAGERS',
      'MOCK_MAS_MAR',
      'MOCK_SUPERADMINS',
    ]);
    expect(
      findUnauthorizedHandlerRoleGroups(roles, 'MOCK_SUPERADMINS', 'MOCK_UNIT_MANAGERS,MOCK_LEX_MANAGERS,MOCK_MAS_MAR,MOCK_SUPERADMINS'),
    ).toEqual([]);
  });

  it('asks nothing of the superadmin group where no role registers measures', () => {
    expect(
      findUnauthorizedHandlerRoleGroups(
        [{ key: 'lex-ansvarig', label: 'LEX-ansvarig', group: 'MOCK_LEX_MANAGERS' }],
        'MOCK_SUPERADMINS',
        'MOCK_LEX_MANAGERS',
      ),
    ).toEqual([]);
  });
});

describe('resolveHeldHandlerRoleKeys', () => {
  it('names the roles whose groups the user is in, in catalogue order, whatever the case of the groups', () => {
    const roles = resolveHandlerGroupRoles(configured)!;

    expect(resolveHeldHandlerRoleKeys(roles, ['mock_mas_mar', ' MOCK_UNIT_MANAGERS ', 'mock_others'])).toEqual(['enhetschef', 'mas-mar']);
    expect(resolveHeldHandlerRoleKeys(roles, [])).toEqual([]);
  });
});
