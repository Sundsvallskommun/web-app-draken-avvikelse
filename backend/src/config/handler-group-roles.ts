/**
 * Deployment-owned catalogue of the handler roles in the healthcare deviation (avvikelse) applications:
 * which AD group holds each role, and what the role may do with measures.
 *
 * One list serves three consumers, so a group is written once. The handler selector lists the members of
 * the role groups, grouped by role, the handover steps require a role of their assignee, and a role carrying
 * `measures` is a registration role for measures. Members of `SUPERADMIN_GROUP` hold every registration role on
 * top of that. The setting is required: without its roles there are no handovers and nobody registers measures.
 *
 * The catalogue grants nothing else: login stays with `AUTHORIZED_GROUPS`, application privileges with
 * the admin groups, and investigation document access with Support Management.
 */
export const HANDLER_ROLES_SETTING = 'HEALTHCAREDEVIATION_HANDLER_ROLES';

export interface HandlerRoleMeasureRegistration {
  /** The namespace metadata role (`Role.name`) the measures are registered for. */
  readonly roleName: string;
  /** The group in `MeasureType.measureGroups` whose types the role can choose from. */
  readonly measureGroup: string;
  /** A deciding role's own measures are accepted on creation; every other role registers proposals. */
  readonly decides: boolean;
}

export interface HandlerGroupRole {
  /** Stable client-facing identifier for the role. */
  readonly key: string;
  /** Presentation only: the group heading shown above the role's members. */
  readonly label: string;
  /** AD group name, kept verbatim so it survives the directory lookup unchanged. */
  readonly group: string;
  /** Present when the role registers measures. */
  readonly measures?: HandlerRoleMeasureRegistration;
}

const ROLE_KEYS = new Set(['key', 'label', 'group', 'measures']);
const MEASURE_KEYS = new Set(['roleName', 'measureGroup', 'decides']);
const ROLE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const readRequiredString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
};

const rejectUnknownKeys = (candidate: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void => {
  const unknownKeys = Object.keys(candidate).filter(key => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${path} contains unknown keys: ${unknownKeys.join(', ')}`);
  }
};

const readMeasureRegistration = (value: unknown, path: string): HandlerRoleMeasureRegistration | undefined => {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  rejectUnknownKeys(value, MEASURE_KEYS, path);
  if (value.decides !== undefined && typeof value.decides !== 'boolean') {
    throw new Error(`${path}.decides must be a boolean`);
  }

  return Object.freeze({
    roleName: readRequiredString(value.roleName, `${path}.roleName`),
    measureGroup: readRequiredString(value.measureGroup, `${path}.measureGroup`),
    decides: value.decides === true,
  });
};

/** Parses the catalogue, which is required. Array order is display order. */
export const resolveHandlerGroupRoles = (configuredRoles = process.env[HANDLER_ROLES_SETTING]): readonly HandlerGroupRole[] => {
  if (!configuredRoles?.trim()) throw new Error(`${HANDLER_ROLES_SETTING} must be set`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(configuredRoles);
  } catch {
    throw new SyntaxError(`${HANDLER_ROLES_SETTING} must contain valid JSON`);
  }

  if (!Array.isArray(parsed)) {
    throw new TypeError(`${HANDLER_ROLES_SETTING} must be an array`);
  }
  if (parsed.length === 0) {
    throw new Error(`${HANDLER_ROLES_SETTING} must name at least one role`);
  }

  const roleKeys = new Set<string>();
  const measureRegistrations = new Map<string, HandlerRoleMeasureRegistration>();
  const roles = parsed.map((candidate, index) => {
    const path = `${HANDLER_ROLES_SETTING}[${index}]`;
    if (!isRecord(candidate)) throw new Error(`${path} must be an object`);
    rejectUnknownKeys(candidate, ROLE_KEYS, path);

    const key = readRequiredString(candidate.key, `${path}.key`);
    if (!ROLE_KEY_PATTERN.test(key)) {
      throw new Error(`${path}.key must be a lowercase kebab-case identifier`);
    }
    if (roleKeys.has(key)) throw new Error(`${path} duplicates role key ${key}`);
    roleKeys.add(key);

    const measures = readMeasureRegistration(candidate.measures, `${path}.measures`);
    if (measures) {
      // Several handler roles may register as the same namespace role - a LEX manager exactly as a LEX
      // investigator - but one namespace role cannot choose from two type groups, nor both decide and propose.
      const shared = measureRegistrations.get(measures.roleName);
      if (shared && (shared.measureGroup !== measures.measureGroup || shared.decides !== measures.decides)) {
        throw new Error(`${path}.measures registers ${measures.roleName} differently from an earlier role`);
      }
      measureRegistrations.set(measures.roleName, measures);
    }

    return Object.freeze({
      key,
      label: readRequiredString(candidate.label, `${path}.label`),
      group: readRequiredString(candidate.group, `${path}.group`),
      ...(measures ? { measures } : {}),
    });
  });

  return Object.freeze(roles);
};

/**
 * The groups that hold something in the catalogue but cannot log in: a role group, or the superadmin
 * group where some role registers measures, missing from `AUTHORIZED_GROUPS`. Their members would hold
 * a role in Draken they can never reach.
 */
export const findUnauthorizedHandlerRoleGroups = (
  roles: readonly HandlerGroupRole[],
  superadminGroup: string | undefined,
  authorizedGroups: string | undefined,
): string[] => {
  const authorized = new Set(
    (authorizedGroups ?? '')
      .split(',')
      .map(group => group.trim().toLowerCase())
      .filter(Boolean),
  );
  const groups = roles.map(role => role.group);
  if (superadminGroup?.trim() && roles.some(role => role.measures)) groups.push(superadminGroup.trim());

  const unauthorized = new Map<string, string>();
  for (const group of groups) {
    const normalized = group.toLowerCase();
    if (!authorized.has(normalized) && !unauthorized.has(normalized)) unauthorized.set(normalized, group);
  }
  return [...unauthorized.values()];
};

/**
 * The roles a user holds through their own AD groups, by key and in catalogue order. Groups are compared
 * lowercased, the way the SAML groups are lowercased at login. The superadmin group is not a role here: it
 * holds every measure registration role, but it is nobody's unit, and callers that care ask for it apart.
 */
export const resolveHeldHandlerRoleKeys = (roles: readonly HandlerGroupRole[], userGroups: readonly string[]): string[] => {
  const groups = new Set(userGroups.map(group => group.trim().toLowerCase()));
  return roles.filter(role => groups.has(role.group.trim().toLowerCase())).map(role => role.key);
};

/**
 * Looks up one configured role. Callers requiring a role for a specific assignment step use this so
 * a missing or renamed role fails loudly instead of silently assigning to nobody.
 */
export const findHandlerGroupRole = (roles: readonly HandlerGroupRole[], key: string): HandlerGroupRole | undefined =>
  roles.find(role => role.key === key);
