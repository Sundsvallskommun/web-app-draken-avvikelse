import { HANDLER_ROLES_SETTING, HandlerGroupRole, HandlerRoleMeasureRegistration } from '@/config/handler-group-roles';
import { MetadataResponse, Role } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { logger } from '@/utils/logger';

import { readRoleGroups } from './ad-role.service';

export interface MeasureRegistrationPolicy {
  status: 'ready' | 'unconfigured' | 'invalid';
  /** The measure types each role registers, by the metadata name a measure's `type` carries. */
  roleTypes: { roleName: string; measureTypes: string[]; decides: boolean }[];
}

export interface ResolvedMeasureRegistration {
  creationRoles: Role[];
  registration: MeasureRegistrationPolicy;
}

/**
 * Draken owns who registers in which role; metadata owns type group membership, identities and display
 * names. The registration roles are the handler roles carrying `measures`: a user holds one through the
 * role's AD group, or through a superadmin group, which holds every one of them. `superadminSetting` is the
 * SUPERADMIN_GROUP setting: one group or a comma-separated list, read as every other role setting is.
 */
export function resolveSupportMeasureRegistration(
  metadata: Pick<MetadataResponse, 'roles' | 'measureTypes'>,
  userGroups: readonly string[],
  handlerRoles: readonly HandlerGroupRole[],
  superadminSetting: string | undefined,
): ResolvedMeasureRegistration {
  const registrationRoles = handlerRoles.filter(
    (role): role is HandlerGroupRole & { measures: HandlerRoleMeasureRegistration } => role.measures !== undefined,
  );
  if (registrationRoles.length === 0) return { creationRoles: [], registration: { status: 'unconfigured', roleTypes: [] } };
  try {
    const groups = new Set(userGroups.map(group => group.trim().toLowerCase()));
    const holdsEveryRole = readRoleGroups(superadminSetting).some(superadminGroup => groups.has(superadminGroup));
    const creationRoles: Role[] = [];
    const roleTypes: MeasureRegistrationPolicy['roleTypes'] = [];
    // Several handler roles can register as one namespace role - a LEX manager exactly as a LEX investigator.
    // It is listed once, and held through the group of any of them.
    const byRoleName = new Map<string, { measures: HandlerRoleMeasureRegistration; adGroups: string[] }>();
    for (const { group, measures } of registrationRoles) {
      const shared = byRoleName.get(measures.roleName);
      if (shared) shared.adGroups.push(group);
      else byRoleName.set(measures.roleName, { measures, adGroups: [group] });
    }
    for (const { measures, adGroups } of byRoleName.values()) {
      const role = metadata.roles?.find(candidate => candidate.name === measures.roleName);
      if (!role) throw new Error(`${HANDLER_ROLES_SETTING}: role ${measures.roleName} is missing from namespace metadata`);
      if (role.deprecated) continue;
      const types = (metadata.measureTypes ?? []).filter(
        type => !type.deprecated && Array.isArray(type.measureGroups) && type.measureGroups.includes(measures.measureGroup),
      );
      const measureTypes = types.map(type => {
        if (!type.name?.trim()) throw new Error(`${HANDLER_ROLES_SETTING}: a type in group ${measures.measureGroup} is missing its metadata name`);
        return type.name;
      });
      roleTypes.push({ roleName: role.name, measureTypes, decides: measures.decides });
      if (holdsEveryRole || adGroups.some(adGroup => groups.has(adGroup.trim().toLowerCase()))) creationRoles.push(role);
    }
    creationRoles.sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        (a.displayName || a.name).localeCompare(b.displayName || b.name, 'sv'),
    );
    return { creationRoles, registration: { status: 'ready', roleTypes } };
  } catch (cause) {
    // Configuration details stay in backend logs; reading existing measures remains available.
    logger.error(`${HANDLER_ROLES_SETTING}: ${cause instanceof Error ? cause.message : 'Invalid configuration'}`);
    return { creationRoles: [], registration: { status: 'invalid', roleTypes: [] } };
  }
}

export function assertMeasureTypeForRole(policy: MeasureRegistrationPolicy, roleName: string | undefined, measureType: string): void {
  if (policy.status !== 'ready')
    throw new HttpException(503, 'Åtgärdernas roll- och typval behöver konfigureras i Draken. Kontakta administratören.');
  if (!policy.roleTypes.some(rule => rule.roleName === roleName && rule.measureTypes.includes(measureType))) {
    throw new HttpException(400, 'Åtgärdstypen är inte tillgänglig för registreringsrollen i Draken. Ladda om åtgärderna och välj igen.');
  }
}

export function assertMeasureRegistration(resolved: ResolvedMeasureRegistration, roleName: string, measureType: string): void {
  if (resolved.registration.status !== 'ready')
    throw new HttpException(503, 'Åtgärdernas roll- och typval behöver konfigureras i Draken. Kontakta administratören.');
  if (!resolved.creationRoles.some(role => role.name === roleName)) throw new HttpException(403, 'Du saknar den valda registreringsrollen i Draken.');
  assertMeasureTypeForRole(resolved.registration, roleName, measureType);
}

/** Whether measures registered in this role are accepted on creation rather than proposed. */
export function measureRoleDecides(policy: MeasureRegistrationPolicy, roleName: string): boolean {
  return policy.roleTypes.some(rule => rule.roleName === roleName && rule.decides);
}
