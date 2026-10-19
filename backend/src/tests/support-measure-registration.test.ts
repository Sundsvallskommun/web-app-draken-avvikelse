import { HandlerGroupRole, HandlerRoleMeasureRegistration } from '@/config/handler-group-roles';
import { MetadataResponse } from '@/data-contracts/supportmanagement/data-contracts';
import {
  assertMeasureRegistration,
  assertMeasureTypeForRole,
  measureRoleDecides,
  resolveSupportMeasureRegistration,
} from '@/services/support-measure-registration';
import { logger } from '@/utils/logger';

const metadata: MetadataResponse = {
  roles: [
    { name: 'MANAGER', displayName: 'Enhetschef', sortOrder: 1 },
    { name: 'NURSE', displayName: 'HSL', sortOrder: 2 },
    { name: 'RETIRED', deprecated: true },
  ],
  measureTypes: [
    { id: 'education-id', name: 'EDUCATION', displayName: 'Utbildning', measureGroups: ['MANAGERS', 'CLINICAL'] },
    { id: 'supervision-id', name: 'SUPERVISION', measureGroups: ['MANAGERS'] },
    { id: 'old-id', name: 'OLD', measureGroups: ['MANAGERS'], deprecated: true },
  ],
};
const roles: HandlerGroupRole[] = [
  { key: 'manager', label: 'Enhetschef', group: 'AD-MANAGER', measures: { roleName: 'MANAGER', measureGroup: 'MANAGERS', decides: false } },
  { key: 'nurse', label: 'HSL', group: 'AD-NURSE', measures: { roleName: 'NURSE', measureGroup: 'CLINICAL', decides: false } },
  { key: 'retired', label: 'Utgången', group: 'AD-RETIRED', measures: { roleName: 'RETIRED', measureGroup: 'CLINICAL', decides: false } },
];
const lexManager: HandlerGroupRole = { key: 'lex-ansvarig', label: 'LEX-ansvarig', group: 'AD-LEX' };
const SUPERADMINS = 'AD-SUPERADMINS';

/** The first role with its registration changed, for the cases that turn one knob. */
const withManagerMeasures = (measures: Partial<HandlerRoleMeasureRegistration>): HandlerGroupRole[] => [
  { ...roles[0], measures: { ...roles[0].measures!, ...measures } },
];

beforeEach(() => vi.spyOn(logger, 'error').mockImplementation(() => logger));
afterEach(() => vi.restoreAllMocks());

test('resolves exact metadata identities from the role groups and exposes only presentation data', () => {
  const resolved = resolveSupportMeasureRegistration(metadata, ['ad-manager', 'Ad-Nurse', 'AD-RETIRED'], roles, SUPERADMINS);
  expect(resolved.creationRoles.map(role => role.name)).toEqual(['MANAGER', 'NURSE']);
  expect(resolved.creationRoles.map(role => role.displayName)).toEqual(['Enhetschef', 'HSL']);
  expect(resolved.registration).toEqual({
    status: 'ready',
    roleTypes: [
      { roleName: 'MANAGER', measureTypes: ['EDUCATION', 'SUPERVISION'], decides: false },
      { roleName: 'NURSE', measureTypes: ['EDUCATION'], decides: false },
    ],
  });
  expect(JSON.stringify(resolved)).not.toContain('AD-MANAGER');
  expect(metadata.measureTypes).toHaveLength(3);
});

test('does not turn matching labels, namespace role names or partial group names into membership', () => {
  const resolved = resolveSupportMeasureRegistration(metadata, ['MANAGER', 'Enhetschef', 'AD-MANAGER-OTHER'], roles, SUPERADMINS);
  expect(resolved.registration.status).toBe('ready');
  expect(resolved.creationRoles).toEqual([]);
});

// The superadmin group is written once in SUPERADMIN_GROUP instead of into every registration role.
test('the superadmin group holds every registration role that is still active', () => {
  const resolved = resolveSupportMeasureRegistration(metadata, ['ad-superadmins'], roles, SUPERADMINS);
  expect(resolved.creationRoles.map(role => role.name)).toEqual(['MANAGER', 'NURSE']);
  expect(resolveSupportMeasureRegistration(metadata, ['AD-SUPERADMINS'], roles, undefined).creationRoles).toEqual([]);
  expect(resolveSupportMeasureRegistration(metadata, ['', 'AD-SUPERADMINS'], roles, '   ').creationRoles).toEqual([]);
});

// SUPERADMIN_GROUP may list several groups, as every role setting may: membership in any one of them is enough.
test('a member of any one of several listed superadmin groups registers in every role', () => {
  const resolved = resolveSupportMeasureRegistration(metadata, ['AD-SECOND-SUPERADMINS'], roles, 'AD-SUPERADMINS, AD-SECOND-SUPERADMINS');
  expect(resolved.creationRoles.map(role => role.name)).toEqual(['MANAGER', 'NURSE']);
  expect(() => assertMeasureRegistration(resolved, 'NURSE', 'EDUCATION')).not.toThrow();
  expect(resolveSupportMeasureRegistration(metadata, ['AD-OTHER'], roles, 'AD-SUPERADMINS, AD-SECOND-SUPERADMINS').creationRoles).toEqual([]);
});

test('is unconfigured when no handler role registers measures', () => {
  expect(resolveSupportMeasureRegistration(metadata, ['AD-MANAGER'], [], SUPERADMINS).registration.status).toBe('unconfigured');
  expect(resolveSupportMeasureRegistration(metadata, ['AD-LEX'], [lexManager], SUPERADMINS)).toEqual({
    creationRoles: [],
    registration: { status: 'unconfigured', roleTypes: [] },
  });
});

// A LEX manager registers exactly as a LEX investigator does: one namespace role, reached through either group.
test('a namespace role shared by several handler roles is listed once and held through any of their groups', () => {
  const sharing: HandlerGroupRole[] = [roles[0], { ...roles[0], key: 'deputy', group: 'AD-DEPUTY' }];
  const resolved = resolveSupportMeasureRegistration(metadata, ['ad-deputy'], sharing, SUPERADMINS);
  expect(resolved.registration.roleTypes.map(rule => rule.roleName)).toEqual(['MANAGER']);
  expect(resolved.creationRoles.map(role => role.name)).toEqual(['MANAGER']);
});

test('a handler role without measures takes no part in registration', () => {
  const resolved = resolveSupportMeasureRegistration(metadata, ['AD-LEX', 'AD-MANAGER'], [lexManager, roles[0]], SUPERADMINS);
  expect(resolved.registration.roleTypes.map(rule => rule.roleName)).toEqual(['MANAGER']);
  expect(resolved.creationRoles.map(role => role.name)).toEqual(['MANAGER']);
});

test('a registration role missing from the namespace metadata invalidates the policy without interrupting history reads', () => {
  expect(resolveSupportMeasureRegistration(metadata, ['AD-MANAGER'], withManagerMeasures({ roleName: 'UNKNOWN' }), SUPERADMINS)).toEqual({
    creationRoles: [],
    registration: { status: 'invalid', roleTypes: [] },
  });
});

test('checks both group membership and type choices when saving', () => {
  const resolved = resolveSupportMeasureRegistration(metadata, ['AD-NURSE'], roles, SUPERADMINS);
  expect(() => assertMeasureRegistration(resolved, 'NURSE', 'EDUCATION')).not.toThrow();
  expect(() => assertMeasureRegistration(resolved, 'MANAGER', 'EDUCATION')).toThrow('saknar');
  expect(() => assertMeasureRegistration(resolved, 'NURSE', 'SUPERVISION')).toThrow('inte tillgänglig');
  expect(() => assertMeasureRegistration(resolved, 'NURSE', 'OLD')).toThrow('inte tillgänglig');
  expect(() => assertMeasureRegistration(resolved, 'NURSE', 'Utbildning')).toThrow('inte tillgänglig');
});

test('changing a historical type uses the saved role while leaving editor authorization to the protected resource', () => {
  const resolved = resolveSupportMeasureRegistration(metadata, [], roles, SUPERADMINS);
  expect(resolved.creationRoles).toEqual([]);
  expect(() => assertMeasureTypeForRole(resolved.registration, 'MANAGER', 'SUPERVISION')).not.toThrow();
  expect(() => assertMeasureTypeForRole(resolved.registration, 'NURSE', 'SUPERVISION')).toThrow('inte tillgänglig');
});

test('empty type choices never expand to all active metadata types', () => {
  const resolved = resolveSupportMeasureRegistration(metadata, ['AD-MANAGER'], withManagerMeasures({ measureGroup: 'NO_TYPES' }), SUPERADMINS);
  expect(resolved.creationRoles.map(role => role.name)).toEqual(['MANAGER']);
  expect(resolved.registration.roleTypes[0].measureTypes).toEqual([]);
  expect(() => assertMeasureRegistration(resolved, 'MANAGER', 'EDUCATION')).toThrow('inte tillgänglig');
});

test('new and reassigned metadata types change choices without changing local configuration', () => {
  const changed: MetadataResponse = {
    ...metadata,
    measureTypes: [
      { id: 'new-id', name: 'NEW_TYPE', measureGroups: ['MANAGERS', 'CLINICAL'] },
      { id: 'education-id', name: 'EDUCATION', measureGroups: ['CLINICAL'] },
      { id: 'empty-id', name: 'EMPTY', measureGroups: [] },
      { id: 'similar-id', name: 'SIMILAR', measureGroups: ['MANAGERS_OTHER'] },
    ],
  };
  const resolved = resolveSupportMeasureRegistration(changed, ['AD-MANAGER', 'AD-NURSE'], roles, SUPERADMINS);
  expect(resolved.registration.roleTypes).toEqual([
    { roleName: 'MANAGER', measureTypes: ['NEW_TYPE'], decides: false },
    { roleName: 'NURSE', measureTypes: ['NEW_TYPE', 'EDUCATION'], decides: false },
  ]);
  expect(() => assertMeasureRegistration(resolved, 'MANAGER', 'EDUCATION')).toThrow('inte tillgänglig');
  expect(() => assertMeasureRegistration(resolved, 'NURSE', 'NEW_TYPE')).not.toThrow();
});

test('a matching type without a name prevents registration but preserves history access', () => {
  const resolved = resolveSupportMeasureRegistration(
    { ...metadata, measureTypes: [{ name: ' ', measureGroups: ['MANAGERS'] }] },
    ['AD-MANAGER'],
    roles,
    SUPERADMINS,
  );
  expect(resolved.registration.status).toBe('invalid');
  expect(resolved.creationRoles).toEqual([]);
});

test('reads the deciding flag per role', () => {
  const withDecider: HandlerGroupRole[] = [{ ...roles[0], measures: { ...roles[0].measures!, decides: true } }, roles[1]];
  const resolved = resolveSupportMeasureRegistration(metadata, ['ad-manager', 'ad-nurse'], withDecider, SUPERADMINS);
  expect(resolved.registration.roleTypes.map(rule => [rule.roleName, rule.decides])).toEqual([
    ['MANAGER', true],
    ['NURSE', false],
  ]);
  expect(measureRoleDecides(resolved.registration, 'MANAGER')).toBe(true);
  expect(measureRoleDecides(resolved.registration, 'NURSE')).toBe(false);
  expect(measureRoleDecides(resolved.registration, 'UNKNOWN')).toBe(false);
});
