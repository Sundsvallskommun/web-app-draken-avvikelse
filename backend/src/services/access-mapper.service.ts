import { apiServiceName } from '@/config/api-config';
import { ACCESS_MAPPER_ROLE_TYPE } from '@/config/investigation-manager-roles';
import { AccessGroup, AccessUser } from '@/data-contracts/access-mapper/data-contracts';
import { User } from '@/interfaces/users.interface';
import { apiURL } from '@/utils/util';

import ApiService from './api.service';
import { placeAccessPattern } from './place-manager-assignments';

const SERVICE = apiServiceName('access-mapper');

/** The access type whose patterns are written against Support Management label resource paths. */
const LABEL_ACCESS_TYPE = 'label';

/**
 * Reads Support Management's access configuration.
 *
 * AccessMapper is not a register of managers - it is the label-pattern configuration that decides
 * who sees which errands. "Who is the manager for this place" is therefore answered in two halves:
 * the patterns say who reaches the place, and the roles say which of them is a manager. Neither
 * half is sufficient alone.
 */
export class AccessMapperService {
  private readonly apiService = new ApiService();

  /**
   * The AD accounts configured for a place.
   *
   * `pattern` is an exact match on the stored pattern, so this asks for the place's own pattern and
   * nothing else: a manager is configured on the place they manage.
   */
  async findLocationAccessCandidates(user: User, municipalityId: string, namespace: string, locationResourcePath: string): Promise<string[]> {
    const pattern = placeAccessPattern(locationResourcePath);
    const response = await this.apiService.get<AccessUser[]>(
      {
        url: `${municipalityId}/${namespace}/access-config/user`,
        baseURL: apiURL(SERVICE),
        params: { pattern },
        propagateClientError: true,
      },
      user,
    );

    const accounts = (response.data ?? [])
      .filter(hasLabelAccess)
      .map(accessUser => accessUser.userId?.trim())
      .filter((account): account is string => Boolean(account));

    return [...new Map(accounts.map(account => [account.toLowerCase(), account])).values()];
  }

  /**
   * The label patterns configured for one AD account - the other direction of the same
   * configuration: `findLocationAccessCandidates` asks which accounts reach a place, this asks which
   * places an account reaches.
   *
   * An unknown account answers 404 upstream. That is an account with no configured places rather
   * than a failure, so it comes back empty, the same way its roles do.
   */
  async findAccountLabelPatterns(user: User, municipalityId: string, namespace: string, adAccount: string): Promise<string[]> {
    const url = `${municipalityId}/${namespace}/access/ad/${encodeURIComponent(adAccount)}`;

    try {
      const response = await this.apiService.get<AccessGroup[]>(
        { url, baseURL: apiURL(SERVICE), params: { type: LABEL_ACCESS_TYPE }, propagateClientError: true },
        user,
      );
      return (response.data ?? [])
        .flatMap(group => group.accessByType ?? [])
        .filter(accessType => accessType.type?.trim().toLowerCase() === LABEL_ACCESS_TYPE)
        .flatMap(accessType => accessType.access ?? [])
        .map(access => access.pattern)
        .filter((pattern): pattern is string => typeof pattern === 'string');
    } catch (error) {
      if (hasStatus(error, 404)) return [];
      throw error;
    }
  }

  /** Every person's own access configuration in the namespace. A person's places are among their label patterns. */
  async listAccessUsers(user: User, municipalityId: string, namespace: string): Promise<AccessUser[]> {
    const response = await this.apiService.get<AccessUser[]>(
      { url: `${municipalityId}/${namespace}/access-config/user`, baseURL: apiURL(SERVICE), propagateClientError: true },
      user,
    );
    return response.data ?? [];
  }

  async createAccessUser(user: User, municipalityId: string, namespace: string, accessUser: AccessUser): Promise<void> {
    await this.apiService.post<void, AccessUser>(
      {
        url: `${municipalityId}/${namespace}/access-config/user`,
        baseURL: apiURL(SERVICE),
        data: accessUser,
        propagateClientError: true,
        // The created entry is not read back: the caller already holds what it wrote.
        followLocation: false,
      },
      user,
    );
  }

  /** Replaces a person's whole configuration: AccessMapper has no partial update, and no version to condition one on. */
  async updateAccessUser(user: User, municipalityId: string, namespace: string, id: string, accessUser: AccessUser): Promise<void> {
    await this.apiService.put<void, AccessUser>(
      {
        url: `${municipalityId}/${namespace}/access-config/user/${encodeURIComponent(id)}`,
        baseURL: apiURL(SERVICE),
        data: accessUser,
        propagateClientError: true,
      },
      user,
    );
  }

  async deleteAccessUser(user: User, municipalityId: string, namespace: string, id: string): Promise<void> {
    await this.apiService.delete<void>(
      { url: `${municipalityId}/${namespace}/access-config/user/${encodeURIComponent(id)}`, baseURL: apiURL(SERVICE), propagateClientError: true },
      user,
    );
  }
}

/**
 * The roles AccessMapper reports for one AD account.
 *
 * The role name is **not** the group's `groupId` - that is a UUID. It is carried the same way every
 * other kind of access is: an `accessByType` entry of type `role`, whose `access[].pattern` holds
 * the name, for example `UNIT_MANAGER`. `type=role` narrows which groups come back but not what each
 * one contains, so the role entries are picked out here.
 *
 * An unknown account answers 404 upstream; that is a user with no roles rather than a failure, so it
 * comes back as an empty list.
 */
export const readAccessMapperRoles = async (
  apiService: Pick<ApiService, 'get'>,
  user: User,
  municipalityId: string,
  namespace: string,
  adAccount: string,
): Promise<string[]> => {
  const url = `${municipalityId}/${namespace}/access/ad/${encodeURIComponent(adAccount)}`;

  try {
    const response = await apiService.get<AccessGroup[]>(
      { url, baseURL: apiURL(SERVICE), params: { type: ACCESS_MAPPER_ROLE_TYPE }, propagateClientError: true },
      user,
    );
    return (response.data ?? [])
      .flatMap(group => group.accessByType ?? [])
      .filter(accessType => accessType.type?.trim().toLowerCase() === ACCESS_MAPPER_ROLE_TYPE)
      .flatMap(accessType => accessType.access ?? [])
      .map(access => access.pattern)
      .filter((pattern): pattern is string => typeof pattern === 'string');
  } catch (error) {
    if (hasStatus(error, 404)) return [];
    throw error;
  }
};

const hasLabelAccess = (accessUser: AccessUser): boolean =>
  (accessUser.accessByType ?? []).some(accessType => accessType.type?.trim().toLowerCase() === LABEL_ACCESS_TYPE);

// routing-controllers' HttpError subclasses do not keep a reliable instanceof identity.
const hasStatus = (error: unknown, status: number): boolean =>
  typeof error === 'object' && error !== null && (error as { status?: unknown }).status === status;
