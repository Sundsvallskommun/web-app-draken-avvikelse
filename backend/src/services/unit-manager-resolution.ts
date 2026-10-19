import { findInvestigationManagerRole, INVESTIGATION_MANAGER_ROLES } from '@/config/investigation-manager-roles';

export interface ManagerCandidate {
  readonly adAccount: string;
  readonly displayName: string;
  /** The AccessMapper role, e.g. `UNIT_MANAGER`. The client groups the picker by it. */
  readonly roleKey: string;
}

/** One role heading in the client's picker, in the order the roles are configured. */
export interface ManagerRoleOption {
  readonly key: string;
  readonly label: string;
}

export const managerRoleOptions = (): ManagerRoleOption[] => INVESTIGATION_MANAGER_ROLES.map(({ key, label }) => ({ key, label }));

interface ResolveManagersInput {
  /** The AD accounts AccessMapper has configured for the place. */
  readonly locationAccounts: readonly string[];
  /** The AccessMapper roles each account holds, keyed by lowercased AD account. */
  readonly rolesByAccount: ReadonlyMap<string, readonly string[]>;
  /** Display names by lowercased AD account. Missing names fall back to the account itself. */
  readonly displayNames: ReadonlyMap<string, string>;
}

/**
 * The managers who can receive an errand for a place.
 *
 * Two sources, and neither is sufficient alone: AccessMapper's patterns say who is configured for
 * the place, and AccessMapper's roles say who is a manager. An account holding several manager roles
 * is offered under each of them, because they answer different questions - the unit's own manager
 * and the manager of the operation it sits in are both legitimate recipients, and which one applies
 * is a judgement that belongs to a person rather than to a tie-break rule.
 */
export const resolveLocationManagers = ({ locationAccounts, rolesByAccount, displayNames }: ResolveManagersInput): ManagerCandidate[] => {
  const managers: ManagerCandidate[] = [];
  const seen = new Set<string>();

  for (const adAccount of locationAccounts) {
    const account = adAccount.trim().toLowerCase();
    for (const roleName of rolesByAccount.get(account) ?? []) {
      const role = findInvestigationManagerRole(roleName);
      if (!role) continue;

      const identity = `${account}:${role.key}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      managers.push({ adAccount, displayName: displayNames.get(account) || adAccount, roleKey: role.key });
    }
  }

  return managers;
};
