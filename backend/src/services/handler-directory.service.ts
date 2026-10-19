import { MUNICIPALITY_ID } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { HandlerGroupRole, resolveHandlerGroupRoles } from '@/config/handler-group-roles';
import { HttpException } from '@/exceptions/HttpException';
import { User } from '@/interfaces/users.interface';

import ApiService from './api.service';

export interface AdUser {
  description?: string;
  displayName: string;
  domain?: string;
  guid?: string;
  isLinked?: string;
  name: string;
  ouPath?: string;
  personId?: string;
  schemaClassName?: string;
}

export interface AssignableHandler extends Pick<AdUser, 'displayName' | 'name' | 'guid'> {
  /** The handler roles the person holds, in no particular order. */
  roleKeys: string[];
  /**
   * The named investigation handover that giving this person the errand is - the handover to LEX, say - rather
   * than an ordinary change of handler. Absent for an ordinary assignee.
   */
  handoverStep?: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** One directory group to read, and the role it stands for. */
interface DirectoryLookup {
  readonly group: string;
  readonly roleKey: string;
}

/**
 * Reads the AD groups whose members can be assigned an errand, and remembers which role each member
 * holds.
 *
 * The membership is the same answer for every caller, so it is cached for an hour and only complete
 * results are published: a failed group lookup must not silently omit handlers, because the two
 * consumers - the handler selector and the assignment guard - would both then be wrong in the
 * direction that loses people.
 */
export class HandlerDirectoryService {
  private readonly apiService = new ApiService();
  private readonly configuredRoles = resolveHandlerGroupRoles();
  private readonly lookups: readonly DirectoryLookup[];
  private cachedHandlers?: AssignableHandler[];
  private cacheTimestamp = 0;

  constructor() {
    this.lookups = this.configuredRoles.map(role => ({ group: role.group, roleKey: role.key }));
  }

  /** The configured roles in display order. */
  get roles(): readonly HandlerGroupRole[] {
    return this.configuredRoles;
  }

  async listHandlers(user: User): Promise<AssignableHandler[]> {
    const now = Date.now();
    if (this.cachedHandlers && now - this.cacheTimestamp < CACHE_TTL_MS) return this.cachedHandlers;

    const baseUrl = `${apiServiceName('activedirectory')}/${MUNICIPALITY_ID}/groupmembers/${encodeURIComponent(process.env.DOMAIN ?? '')}`;
    const responses = await Promise.all(
      this.lookups.map(lookup => this.apiService.get<AdUser[]>({ url: `${baseUrl}/${encodeURIComponent(lookup.group)}` }, user)),
    );

    const handlers = new Map<string, AssignableHandler>();
    for (const [index, response] of responses.entries()) {
      const { roleKey } = this.lookups[index];
      for (const member of response.data) {
        const account = member.name.toLowerCase();
        let handler = handlers.get(account);
        if (!handler) {
          handler = {
            displayName: member.displayName,
            name: member.name,
            guid: member.guid,
            roleKeys: [],
          };
          handlers.set(account, handler);
        }
        // One account can hold several roles; the selector shows it under each of them.
        if (!handler.roleKeys.includes(roleKey)) handler.roleKeys.push(roleKey);
      }
    }

    this.cachedHandlers = [...handlers.values()];
    this.cacheTimestamp = Date.now();
    return this.cachedHandlers;
  }

  /** The members of one configured role, for a selector that offers only that role. */
  async listHandlersByRole(user: User, roleKey: string): Promise<AssignableHandler[]> {
    this.requireRole(roleKey);
    const handlers = await this.listHandlers(user);
    return handlers.filter(handler => handler.roleKeys.includes(roleKey));
  }

  /**
   * Refuses an assignment to somebody who does not hold the role the step requires. The client picks
   * from a filtered list, so this is the guard against a hand-written request rather than a
   * duplicated UI rule.
   */
  async assertHandlerHoldsRole(user: User, assignedUserId: string, roleKey: string): Promise<AssignableHandler> {
    const role = this.requireRole(roleKey);
    const account = assignedUserId.trim().toLowerCase();
    const handler = (await this.listHandlers(user)).find(candidate => candidate.name.toLowerCase() === account);
    if (!handler?.roleKeys.includes(roleKey)) {
      throw new HttpException(400, `The selected handler is not a member of ${role.label}`);
    }
    return handler;
  }

  /**
   * Display names for AD accounts that are not necessarily assignable handlers.
   *
   * The handler cache answers for free where it can. Anyone else - an operations manager who holds
   * no configured handler role, say - is looked up in the directory by account name.
   *
   * Best effort by design: a name is presentation, and an account whose lookup fails comes back
   * without one so the caller can fall back to the account itself. Failing the whole operation
   * because somebody has no display name would block a handover over a cosmetic detail.
   */
  async lookupDisplayNames(user: User, adAccounts: readonly string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const wanted = [...new Set(adAccounts.map(account => account.trim()).filter(Boolean))];
    if (wanted.length === 0) return names;

    const cached = await this.listHandlers(user).catch(() => [] as AssignableHandler[]);
    for (const handler of cached) names.set(handler.name.toLowerCase(), handler.displayName);

    const missing = wanted.filter(account => !names.has(account.toLowerCase()));
    if (missing.length === 0) return names;

    const searchUrl = `${apiServiceName('activedirectory')}/${MUNICIPALITY_ID}/search/${encodeURIComponent(process.env.DOMAIN ?? '')}`;
    const results = await Promise.all(
      missing.map(account =>
        this.apiService
          .get<AdUser[]>({ url: searchUrl, params: { objectName: account, objectClass: 'User' } }, user)
          .then(response => ({ account, data: response.data ?? [] }))
          .catch(() => ({ account, data: [] as AdUser[] })),
      ),
    );

    for (const { account, data } of results) {
      const match = data.find(candidate => candidate.name?.toLowerCase() === account.toLowerCase());
      if (match?.displayName) names.set(account.toLowerCase(), match.displayName);
    }

    return names;
  }

  private requireRole(roleKey: string): HandlerGroupRole {
    const role = this.configuredRoles.find(candidate => candidate.key === roleKey);
    if (!role) {
      throw new HttpException(409, `This deployment has no handler role ${roleKey} configured`);
    }
    return role;
  }
}
