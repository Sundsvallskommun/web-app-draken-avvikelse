import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { SupportInvestigationDocumentAccess, SupportInvestigationErrandAccessDto } from '@/dtos/support-investigation-profile.dto';
import { HttpException } from '@/exceptions/HttpException';
import { User } from '@/interfaces/users.interface';

import ApiService from './api.service';

export type SupportErrandAccessLevel = 'LR' | 'R' | 'RW';

/** The resource path the sprint /access contract names an errand's measures by. */
export const MEASURE_ACCESS_RESOURCE = 'errand/measure';

interface JsonParameterAccess {
  readonly errandLevel: SupportErrandAccessLevel;
  readonly resourceLevel: SupportErrandAccessLevel | undefined;
  readonly field:
    | {
        readonly allKeys: boolean;
        /** The field's own level, which every key follows when `allKeys` is set. */
        readonly level: SupportErrandAccessLevel | undefined;
        readonly keys: ReadonlyMap<string, SupportErrandAccessLevel>;
      }
    | undefined;
}

const invalidAccess = (): never => {
  throw new HttpException(502, 'Support Management returned invalid errand access');
};

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalidAccess();
  return value as Record<string, unknown>;
};

const level = (value: unknown): SupportErrandAccessLevel => {
  if (value !== 'LR' && value !== 'R' && value !== 'RW') return invalidAccess();
  return value;
};

/** Reject ambiguous duplicate grants; the upstream resolver, never this adapter, merges roles. */
const indexedRecords = (value: unknown, identity: string): ReadonlyMap<string, Record<string, unknown>> => {
  if (!Array.isArray(value)) return invalidAccess();
  const entries = new Map<string, Record<string, unknown>>();
  for (const candidate of value) {
    const entry = record(candidate);
    const key = entry[identity];
    if (typeof key !== 'string' || !key.trim() || entries.has(key)) return invalidAccess();
    entries.set(key, entry);
  }
  return entries;
};

/**
 * The sprint /access contract names fields by payload property and resources by path.
 * Only jsonParameters is interpreted here: ordinary fields and other keyed collections have
 * their own write flows. Unrelated future fields/resources do not widen document access.
 */
const parseJsonParameterAccess = (value: unknown): JsonParameterAccess => {
  const response = record(value);
  const errandLevel = level(response.level);
  const fields = indexedRecords(response.fields, 'field');
  const resources = indexedRecords(response.resources, 'resource');
  const resource = resources.get('errand/json-parameter');
  const field = fields.get('jsonParameters');
  const resourceLevel = resource ? level(resource.level) : undefined;
  if (!field) return { errandLevel, resourceLevel, field: undefined };
  if (typeof field.allKeys !== 'boolean') return invalidAccess();
  const keys = new Map<string, SupportErrandAccessLevel>();
  for (const [key, grant] of indexedRecords(field.keys, 'key')) keys.set(key, level(grant.level));
  if (field.allKeys && keys.size > 0) return invalidAccess();
  // Every key follows the field's level when it is unrestricted, so that level has to be there.
  const fieldLevel = field.allKeys ? level(field.level) : undefined;
  return { errandLevel, resourceLevel, field: { allKeys: field.allKeys, level: fieldLevel, keys } };
};

const documentAccess = (access: JsonParameterAccess, key: string): SupportInvestigationDocumentAccess => {
  if (!access.field || !access.resourceLevel) return 'hidden';
  // Neither the errand level nor anything else is a ceiling over a key: jsonParameters has a write endpoint
  // of its own, so the field and its keys may reach further than the errand, the way a writable directory
  // sits under a read-only parent. An unrestricted field lends every key its own level; a restricted one
  // grants each listed key on its own. A role may own one utredning without being allowed to handle the errand.
  const keyLevel = access.field.allKeys ? access.field.level : access.field.keys.get(key);
  if (!keyLevel) return 'hidden';
  // The key describes PATCH of the errand field; the dedicated document PUT must also be reachable.
  return access.resourceLevel === 'RW' && keyLevel === 'RW' ? 'edit' : 'read';
};

interface AccessServiceDependencies {
  readonly apiService?: Pick<ApiService, 'get'>;
  readonly namespace?: string;
  readonly service?: string;
}

/**
 * Projects Support Management's effective access to the investigation UI's three states.
 * No AD group interpretation or cache lives here. Every protected operation gets a fresh answer,
 * and the actual document endpoint remains authoritative if a grant changes after this read.
 */
export class SupportInvestigationAccessService {
  private readonly apiService: Pick<ApiService, 'get'>;
  private readonly namespace: string;
  private readonly service: string;

  constructor(dependencies: AccessServiceDependencies = {}) {
    this.apiService = dependencies.apiService ?? new ApiService();
    this.namespace = dependencies.namespace ?? SUPPORTMANAGEMENT_NAMESPACE ?? '';
    this.service = dependencies.service ?? apiServiceName('supportmanagement');
  }

  /** The user's effective access to one errand, as Support Management resolves it. */
  private async readErrandAccess(user: User, municipalityId: string, errandId: string): Promise<unknown> {
    if (!this.namespace.trim() || !municipalityId.trim() || !errandId.trim()) {
      throw new HttpException(503, 'Investigation access context is unavailable');
    }
    try {
      const response = await this.apiService.get<unknown>(
        {
          url: `${this.service}/${encodeURIComponent(municipalityId)}/${encodeURIComponent(this.namespace)}/errands/${encodeURIComponent(errandId)}/access`,
          timeout: 10_000,
          followLocation: false,
          includeResponseHeaders: true,
          propagateClientError: true,
          mapUnauthorizedToForbidden: true,
        },
        user,
      );
      if (response.status !== 200) return invalidAccess();
      return response.data;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof error.status === 'number' &&
        [403, 404, 502].includes(error.status)
      )
        throw error;
      throw new HttpException(503, 'Investigation access is temporarily unavailable');
    }
  }

  async getDocumentAccess(
    user: User,
    municipalityId: string,
    errandId: string,
    documentKeys: readonly string[],
  ): Promise<SupportInvestigationErrandAccessDto> {
    const access = parseJsonParameterAccess(await this.readErrandAccess(user, municipalityId, errandId));
    return {
      municipalityId,
      errandId,
      documents: documentKeys.map(key => ({ key, access: documentAccess(access, key) })),
    };
  }

  /**
   * What the user may do with the errand itself. LR is knowing of it without reading it: Support Management
   * then answers with a summary - number, title, status, channel and times - and nothing of its content.
   */
  async getErrandLevel(user: User, municipalityId: string, errandId: string): Promise<SupportErrandAccessLevel> {
    return level(record(await this.readErrandAccess(user, municipalityId, errandId)).level);
  }

  /** The level granted for one errand resource, or undefined when the user is granted nothing on it. */
  async getResourceLevel(user: User, municipalityId: string, errandId: string, resource: string): Promise<SupportErrandAccessLevel | undefined> {
    const response = record(await this.readErrandAccess(user, municipalityId, errandId));
    level(response.level);
    const grant = indexedRecords(response.resources, 'resource').get(resource);
    return grant ? level(grant.level) : undefined;
  }

  async assertCanReadDocument(user: User, municipalityId: string, errandId: string, key: string): Promise<void> {
    const result = await this.getDocumentAccess(user, municipalityId, errandId, [key]);
    if (result.documents[0].access === 'hidden') throw new HttpException(403, 'Missing permissions for this investigation document');
  }

  async assertCanWriteDocument(user: User, municipalityId: string, errandId: string, key: string): Promise<void> {
    const result = await this.getDocumentAccess(user, municipalityId, errandId, [key]);
    if (result.documents[0].access !== 'edit') throw new HttpException(403, 'Missing write permissions for this investigation document');
  }
}
