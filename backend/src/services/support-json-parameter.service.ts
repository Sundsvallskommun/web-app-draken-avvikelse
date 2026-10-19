import { apiServiceName } from '@/config/api-config';
import { trimSupportManagementPath } from '@/config/supportmanagement-path';
import type { JsonSchema } from '@/data-contracts/jsonschema/data-contracts';
import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import type { User } from '@/interfaces/users.interface';
import { isBlankMarkup } from '@/utils/visible-markup-text';

import ApiService, { type ApiResponse } from './api.service';
import { isPendingInvestigationReport } from './investigation-report-publication.service';
import {
  isJsonObject,
  isRecord,
  type JsonObject,
  type JsonValue,
  requireResponseStatus,
  SchemaBoundJsonService,
  type SchemaBoundJsonServiceDependencies,
} from './schema-bound-json.service';
import { assertSupportErrandWritable, getErrandVersion } from './support-errand.service';

/**
 * The application profile injects this definition. The json-parameter service never
 * needs to know which application, role or concrete document it belongs to.
 */
interface JsonParameterDefinition<TKey extends string = string, TSchemaName extends string = string> {
  readonly key: TKey;
  readonly schemaName: TSchemaName;
  /** The role that answers for the document, where the profile names one. Recorded with whoever writes it first. */
  readonly ownerLabel?: string;
}

export interface SupportJsonParameter<TKey extends string = string> {
  readonly key: TKey;
  readonly schemaId: string;
  readonly value: JsonObject;
  readonly version?: number;
}

declare const strongVersionETagBrand: unique symbol;

/** A canonical, strong, numeric version ETag, for example `"7"`. */
export type StrongVersionETag = string & { readonly [strongVersionETagBrand]: true };

export interface JsonParameterRequest<TKey extends string = string, TSchemaName extends string = string> {
  readonly definition: JsonParameterDefinition<TKey, TSchemaName>;
  readonly municipalityId: string;
  readonly errandId: string;
  readonly user: User;
}

export interface VerifyReadableJsonParametersRequest {
  readonly definitions: readonly JsonParameterDefinition[];
  readonly municipalityId: string;
  readonly errandId: string;
  readonly user: User;
}

export interface VerifyReadableJsonParametersResult {
  readonly existingDocumentKeys: readonly string[];
}

export interface ReadJsonParameterResult<TKey extends string = string> {
  readonly document: SupportJsonParameter<TKey>;
  readonly etag: StrongVersionETag;
  readonly status: 200;
}

/** Raw client preconditions. Invalid combinations are rejected before a write. */
export interface JsonParameterWritePreconditions {
  readonly ifMatch?: string;
  readonly ifNoneMatch?: string;
  readonly parentErrandVersion?: string;
}

export interface WriteJsonParameterRequest<TKey extends string = string, TSchemaName extends string = string> extends JsonParameterRequest<
  TKey,
  TSchemaName
> {
  readonly data: {
    readonly schemaId: string;
    readonly value: JsonObject;
  };
  readonly preconditions: JsonParameterWritePreconditions;
  /**
   * For the BFF's own writes only, never a client's: values for server-owned properties, and
   * leave to write a document its completion has locked. The report endpoint appends a report
   * to a completed document this way.
   */
  readonly internal?: {
    readonly serverOwnedOverrides?: JsonObject;
    readonly allowLocked?: boolean;
    /** `false` for the BFF's own bookkeeping, which is no news to the errand's subscribers. */
    readonly notifySubscribers?: false;
  };
}

export interface WriteJsonParameterResult<TKey extends string = string> {
  readonly document: SupportJsonParameter<TKey>;
  readonly etag: StrongVersionETag;
  readonly status: 200 | 201;
  /** Fresh optimistic-locking version read from the parent errand after the document write. */
  readonly parentErrandVersion: number;
}

type JsonParameterApiService = Pick<ApiService, 'get' | 'put'>;

export interface SupportJsonParameterServiceDependencies extends SchemaBoundJsonServiceDependencies {
  readonly namespace: string;
  readonly apiService?: JsonParameterApiService;
  readonly supportManagementService?: string;
  readonly schemaService?: SchemaBoundJsonService;
  /** The server clock, replaceable in tests. */
  readonly clock?: () => Date;
}

interface ParsedStrongVersionETag {
  readonly etag: StrongVersionETag;
  readonly version: number;
}

type ValidatedWritePrecondition =
  | { readonly mode: 'create'; readonly headers: Readonly<{ 'If-Match': typeof CREATE_ONLY_UPSTREAM_ETAG }> }
  | { readonly mode: 'update'; readonly headers: Readonly<{ 'If-Match': StrongVersionETag }> };

interface ValidatedDocumentResponse<TKey extends string, TStatus extends 200 | 201> {
  readonly document: SupportJsonParameter<TKey>;
  readonly etag: StrongVersionETag;
  readonly status: TStatus;
}

const STRONG_VERSION_ETAG_PATTERN = /^"(0|[1-9]\d*)"$/u;
const VERSION_HEADER_PATTERN = /^(0|[1-9]\d*)$/u;

/**
 * Support Management 14.14 exposes no If-None-Match parameter. Its upsert does,
 * however, validate If-Match only when the key exists and all persisted
 * versions are non-negative. The impossible -1 tag therefore gives the BFF an
 * atomic create-only condition at the upstream transaction boundary: an absent
 * key is created, while a key that appeared after our preflight fails with 412.
 */
const CREATE_ONLY_UPSTREAM_ETAG = '"-1"' as const;

// routing-controllers' HttpError constructor returns an HttpError instance, so
// subclasses such as HttpException do not retain a reliable instanceof identity.
const hasHttpStatus = (error: unknown, status: number): boolean => isRecord(error) && error.status === status;

const requireNonEmpty = (value: string, name: string): string => {
  const normalized = trimSupportManagementPath(value);
  if (!normalized) throw new Error(`${name} must not be empty`);
  return normalized;
};

const readResponseHeader = (headers: unknown, name: string): unknown => {
  if (!isRecord(headers)) return undefined;

  const getter = (headers as { get?: (headerName: string) => unknown }).get;
  if (typeof getter === 'function') {
    const value = getter.call(headers, name);
    if (value !== undefined && value !== null) return value;
  }

  const matchingHeader = Object.entries(headers).find(([headerName]) => headerName.toLowerCase() === name.toLowerCase());
  return matchingHeader?.[1];
};

const parseStrongVersionETag = (value: unknown, invalidStatus: number, source: string): ParsedStrongVersionETag => {
  if (typeof value !== 'string') {
    throw new HttpException(invalidStatus, `${source} must contain one strong numeric ETag`);
  }

  const match = STRONG_VERSION_ETAG_PATTERN.exec(value);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!match || !Number.isSafeInteger(version)) {
    throw new HttpException(invalidStatus, `${source} must contain one strong numeric ETag`);
  }

  return { etag: value as StrongVersionETag, version };
};

const requireDocumentResponse = <TKey extends string, TStatus extends 200 | 201>(
  definition: JsonParameterDefinition<TKey>,
  response: ApiResponse<unknown>,
  expectedStatus: TStatus,
  operation: string,
): ValidatedDocumentResponse<TKey, TStatus> => {
  requireResponseStatus(response, expectedStatus, operation);
  if (!isRecord(response.data)) {
    throw new HttpException(502, 'Support Management returned an invalid JSON parameter');
  }

  const { key, schemaId, value, version } = response.data;
  if (key !== definition.key || typeof schemaId !== 'string' || !schemaId.trim() || !isJsonObject(value)) {
    throw new HttpException(502, 'Support Management returned an invalid JSON parameter');
  }
  if (version !== undefined && (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0)) {
    throw new HttpException(502, 'Support Management returned an invalid JSON parameter version');
  }

  const parsedETag = parseStrongVersionETag(readResponseHeader(response.headers, 'etag'), 502, 'Support Management response ETag');
  if (version !== undefined && version !== parsedETag.version) {
    throw new HttpException(502, 'Support Management returned inconsistent JSON parameter versions');
  }

  return {
    document: {
      key: definition.key,
      schemaId,
      value,
      ...(version !== undefined && { version }),
    },
    etag: parsedETag.etag,
    status: expectedStatus,
  };
};

const validateProvidedPreconditionSyntax = (preconditions: JsonParameterWritePreconditions): void => {
  const { ifMatch, ifNoneMatch, parentErrandVersion } = preconditions;
  if (ifMatch !== undefined && ifNoneMatch !== undefined) {
    throw new HttpException(400, 'If-Match and If-None-Match must not be combined');
  }
  if (ifMatch !== undefined) {
    parseStrongVersionETag(ifMatch, 400, 'If-Match');
  }
  if (ifNoneMatch !== undefined && ifNoneMatch !== '*') {
    throw new HttpException(400, 'If-None-Match must be exactly *');
  }
  // The parent errand's version is not a precondition for writing a document: version checks are
  // scoped to the resource being written, and the document's own ETag already covers that. Versions
  // roll up rather than down - changing this document moves the errand's version too, but the
  // errand's version moving says nothing about this document. Requiring them to match would reject
  // a save over an unrelated field somebody else changed, without protecting anything.
  //
  // The header is still accepted, and still validated when present, because the client sends the
  // version it loaded and a malformed one is worth reporting rather than ignoring.
  if (
    parentErrandVersion !== undefined &&
    (!VERSION_HEADER_PATTERN.test(parentErrandVersion) || !Number.isSafeInteger(Number(parentErrandVersion)))
  ) {
    throw new HttpException(400, 'X-Errand-Version must contain one canonical non-negative version');
  }
};

const resolveWritePrecondition = (
  existing: ReadJsonParameterResult<string> | undefined,
  preconditions: JsonParameterWritePreconditions,
): ValidatedWritePrecondition => {
  const { ifMatch, ifNoneMatch } = preconditions;

  if (existing) {
    if (ifNoneMatch !== undefined) {
      throw new HttpException(412, 'JSON parameter already exists');
    }
    if (ifMatch === undefined) {
      throw new HttpException(428, 'If-Match is required when updating a JSON parameter');
    }

    const requested = parseStrongVersionETag(ifMatch, 400, 'If-Match');
    if (requested.etag !== existing.etag) {
      throw new HttpException(412, 'If-Match does not match the current JSON parameter version');
    }
    return { mode: 'update', headers: { 'If-Match': requested.etag } };
  }

  if (ifMatch !== undefined) {
    throw new HttpException(412, 'JSON parameter does not exist');
  }
  if (ifNoneMatch === undefined) {
    throw new HttpException(428, 'If-None-Match: * is required when creating a JSON parameter');
  }

  return { mode: 'create', headers: { 'If-Match': CREATE_ONLY_UPSTREAM_ETAG } };
};

interface ServerStampContext {
  /** The document as Support Management holds it before this write, if it exists. */
  readonly existingValue: JsonObject | undefined;
  readonly now: Date;
  readonly savedBy: string;
  /** Who is writing, by name and in which role, for a document that records who it is by. */
  readonly author: JsonObject;
  /** Values the BFF itself supplies for `x-draken-server-owned` properties. */
  readonly serverOwnedOverrides?: JsonObject;
}

/**
 * A document whose schema declares `x-draken-completion` can be marked completed by its owner:
 * once the completion field is `yes`, the document is locked and the BFF refuses every write except
 * the one that sets it back to `no` without changing anything else. The reports field lists the
 * reports generated from it; it is server-owned.
 */
export interface DocumentCompletion {
  readonly field: string;
  readonly reportsField: string;
}

export const readDocumentCompletion = (schema: JsonSchema): DocumentCompletion | undefined => {
  const declaration = isRecord(schema.value) ? schema.value['x-draken-completion'] : undefined;
  if (!isRecord(declaration) || typeof declaration.field !== 'string' || typeof declaration.reportsField !== 'string') {
    return undefined;
  }
  return { field: declaration.field, reportsField: declaration.reportsField };
};

export const isDocumentCompleted = (schema: JsonSchema, value: JsonObject | undefined): boolean => {
  const completion = readDocumentCompletion(schema);
  return completion !== undefined && value?.[completion.field] === 'yes';
};

const schemaProperties = (schema: JsonSchema): Record<string, unknown> =>
  isRecord(schema.value) && isRecord(schema.value.properties) ? schema.value.properties : {};

/** The properties a client never writes: server stamps, server-owned values and the completion field. */
const serverControlledProperties = (schema: JsonSchema): Set<string> => {
  const controlled = new Set<string>();
  for (const [name, property] of Object.entries(schemaProperties(schema))) {
    if (!isRecord(property)) continue;
    if (
      property['x-draken-server-timestamp'] !== undefined ||
      property['x-draken-server-revisions'] === true ||
      property['x-draken-server-author'] !== undefined ||
      property['x-draken-server-owned'] === true
    ) {
      controlled.add(name);
    }
  }
  const completion = readDocumentCompletion(schema);
  if (completion) {
    controlled.add(completion.field);
    controlled.add(completion.reportsField);
  }
  return controlled;
};

const withoutProperties = (value: JsonObject, names: ReadonlySet<string>): JsonObject =>
  Object.fromEntries(Object.entries(value).filter(([name]) => !names.has(name)));

/**
 * A locked document accepts exactly one write from a client: the unlock, which sets the completion
 * field to `no` and leaves every other user-editable property as stored.
 */
const assertLockedDocumentWrite = (schema: JsonSchema, existingValue: JsonObject | undefined, value: JsonObject): void => {
  const completion = readDocumentCompletion(schema);
  if (!completion || !existingValue || existingValue[completion.field] !== 'yes') return;
  const reports = existingValue[completion.reportsField];
  if (Array.isArray(reports) && reports.some(isPendingInvestigationReport)) {
    throw new HttpException(409, 'Rapporten väntar på bekräftelse. Slutför rapporten innan utredningen låses upp.');
  }
  if (value[completion.field] === 'yes') {
    throw new HttpException(409, 'This investigation document is completed and locked; unlock it before changing it');
  }
  const controlled = serverControlledProperties(schema);
  if (JSON.stringify(withoutProperties(existingValue, controlled)) !== JSON.stringify(withoutProperties(value, controlled))) {
    throw new HttpException(409, 'Unlocking a completed investigation document may not change it');
  }
};

/**
 * Server-owned properties, declared on the schema and written by the BFF whatever the client sent:
 * when a decision was made and by whom is not the browser's to record. Only root properties the
 * schema declares are considered.
 *
 * - `x-draken-server-timestamp: 'created'` is stamped on the first write and then kept from the
 *   stored document.
 * - `x-draken-server-timestamp: 'updated'` is stamped on every write.
 * - `x-draken-server-revisions: true` names an array the BFF extends with `{ savedAt, savedBy }` on
 *   every write, starting from the stored array rather than the client's copy.
 * - `x-draken-server-author: 'created'` is stamped on the first write with `{ name, role }` - who wrote the
 *   document, and in the role that answers for it - and then kept from the stored document, whoever saves later.
 * - `x-draken-server-owned: true` names a value only the BFF writes, kept from the stored document
 *   unless the BFF's own caller overrides it.
 */
/**
 * A rich-text answer without words is no answer. An editor that was typed in and emptied leaves
 * `<p><br></p>`, which `required` and `minLength` would accept, so a required motivation could be
 * saved empty. Every rich-text field the investigation schemas declare is a root property.
 */
const dropBlankMarkup = (schema: JsonSchema, value: JsonObject): JsonObject => {
  const properties = isRecord(schema.value) && isRecord(schema.value.properties) ? schema.value.properties : {};
  const blank = Object.entries(properties)
    .filter(([name, property]) => isRecord(property) && property.contentMediaType === 'text/html' && isBlankMarkup(value[name]))
    .map(([name]) => name);
  if (blank.length === 0) return value;

  const answered: Record<string, JsonValue> = { ...value };
  for (const name of blank) delete answered[name];
  return answered;
};

const applyServerStamps = (schema: JsonSchema, value: JsonObject, context: ServerStampContext): JsonObject => {
  const properties = isRecord(schema.value) && isRecord(schema.value.properties) ? schema.value.properties : {};
  const timestamp = context.now.toISOString();
  const stamped: Record<string, JsonValue> = { ...value };
  let changed = false;

  for (const [name, property] of Object.entries(properties)) {
    if (!isRecord(property)) continue;
    const mode = property['x-draken-server-timestamp'];
    if (mode === 'created') {
      const existing = context.existingValue?.[name];
      stamped[name] = typeof existing === 'string' && existing.length > 0 ? existing : timestamp;
      changed = true;
    } else if (mode === 'updated') {
      stamped[name] = timestamp;
      changed = true;
    }
    if (property['x-draken-server-revisions'] === true) {
      const existing = context.existingValue?.[name];
      stamped[name] = [...(Array.isArray(existing) ? existing : []), { savedAt: timestamp, savedBy: context.savedBy }];
      changed = true;
    }
    if (property['x-draken-server-author'] === 'created') {
      const existing = context.existingValue?.[name];
      stamped[name] = isRecord(existing) ? existing : context.author;
      changed = true;
    }
    // A server-owned value is whatever the BFF says it is, else whatever is stored; a client's copy
    // is dropped either way.
    if (property['x-draken-server-owned'] === true) {
      const override = context.serverOwnedOverrides?.[name];
      const existing = context.existingValue?.[name];
      if (override !== undefined) stamped[name] = override;
      else if (existing !== undefined) stamped[name] = existing;
      else delete stamped[name];
      changed = true;
    }
  }

  return changed ? stamped : value;
};

export class SupportJsonParameterService {
  private readonly apiService: JsonParameterApiService;
  private readonly schemaService: SchemaBoundJsonService;
  private readonly namespace: string;
  private readonly supportManagementService: string;
  private readonly jsonSchemaService: string;
  private readonly clock: () => Date;

  constructor(dependencies: SupportJsonParameterServiceDependencies) {
    this.apiService = dependencies.apiService ?? new ApiService();
    this.clock = dependencies.clock ?? (() => new Date());
    this.jsonSchemaService = trimSupportManagementPath(dependencies.jsonSchemaService ?? apiServiceName('jsonschema'));
    this.schemaService =
      dependencies.schemaService ??
      new SchemaBoundJsonService({
        apiService: dependencies.apiService,
        jsonSchemaService: dependencies.jsonSchemaService,
      });
    this.namespace = requireNonEmpty(dependencies.namespace, 'Support Management namespace');
    this.supportManagementService = requireNonEmpty(
      dependencies.supportManagementService ?? apiServiceName('supportmanagement'),
      'Support Management service',
    );
  }

  async readJsonParameter<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
  ): Promise<ReadJsonParameterResult<TKey>> {
    const result = await this.readOptionalJsonParameter(request);
    if (!result) throw new HttpException(404, 'JSON parameter not found');
    return result;
  }

  /** Only a missing document is optional. A missing bound schema or denied read must still fail. */
  async readOptionalJsonParameter<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
  ): Promise<ReadJsonParameterResult<TKey> | undefined> {
    let result: ReadJsonParameterResult<TKey>;
    try {
      result = await this.readRawDocument(request);
    } catch (cause) {
      if (hasHttpStatus(cause, 404)) return undefined;
      throw cause;
    }
    await this.requireSchemaBinding(request, result.document.schemaId, 502);
    return result;
  }

  /**
   * The parent errand as Support Management holds it right now, for callers that decide whether a
   * document applies to the errand at all. Deliberately a read of the errand rather than of the
   * document, so the decision is made before any document is touched.
   */
  async readParentErrandSnapshot<TKey extends string, TSchemaName extends string>(request: JsonParameterRequest<TKey, TSchemaName>): Promise<Errand> {
    const response = await this.readParentErrand(request, 'parent errand applicability check');
    return response.data;
  }

  /** The parent errand together with its current optimistic-locking version. */
  async readParentErrandWithVersion<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
  ): Promise<{ errand: Errand; version: number }> {
    const response = await this.readParentErrand(request, 'parent errand report read');
    return { errand: response.data, version: getErrandVersion(response.data, readResponseHeader(response.headers, 'etag')) };
  }

  /** The bound schema of a stored document, for callers that render it rather than write it. */
  async readBoundSchema<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
    schemaId: string,
  ): Promise<JsonSchema> {
    return this.requireSchemaBinding(request, schemaId, 502);
  }

  /** The UI schema published for a schema id; an empty object when none is published. */
  async readUiSchema<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
    schemaId: string,
  ): Promise<JsonObject> {
    const response = await this.apiService.get<unknown>(
      {
        url: `${this.jsonSchemaService}/${encodeURIComponent(request.municipalityId)}/schemas/${encodeURIComponent(schemaId)}/ui-schema`,
        followLocation: false,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      request.user,
    );
    const payload = isRecord(response.data) && isJsonObject(response.data.value) ? response.data.value : response.data;
    return isJsonObject(payload) ? payload : {};
  }

  async verifyReadableDocuments(request: VerifyReadableJsonParametersRequest): Promise<VerifyReadableJsonParametersResult> {
    const keys = await Promise.all(
      request.definitions.map(async definition => {
        try {
          await this.readRawDocument({ ...request, definition });
          return definition.key;
        } catch (error) {
          if (hasHttpStatus(error, 404)) return undefined;
          throw error;
        }
      }),
    );

    return { existingDocumentKeys: keys.filter((key): key is string => key !== undefined) };
  }

  async writeJsonParameter<TKey extends string, TSchemaName extends string>(
    request: WriteJsonParameterRequest<TKey, TSchemaName>,
  ): Promise<WriteJsonParameterResult<TKey>> {
    validateProvidedPreconditionSyntax(request.preconditions);
    await this.assertWritableParent(request, 'parent errand preflight');
    const existing = await this.preflightDocument(request);
    const precondition = resolveWritePrecondition(existing, request.preconditions);

    if (existing && existing.document.schemaId !== request.data.schemaId) {
      throw new HttpException(409, 'A JSON parameter schemaId cannot be changed after creation');
    }
    const schema = await this.requireSchemaBinding(request, request.data.schemaId, existing ? 502 : 400);
    if (!request.internal?.allowLocked) assertLockedDocumentWrite(schema, existing?.document.value, request.data.value);
    const value = applyServerStamps(schema, dropBlankMarkup(schema, request.data.value), {
      existingValue: existing?.document.value,
      now: this.clock(),
      savedBy: request.user.username,
      author: {
        name: request.user.name || request.user.username,
        ...(request.definition.ownerLabel ? { role: request.definition.ownerLabel } : {}),
      },
      serverOwnedOverrides: request.internal?.serverOwnedOverrides,
    });
    this.schemaService.assertValueMatchesSchema(schema, value);
    // Schema/document preflight can involve several upstream reads. Recheck the
    // parent immediately before the child write to keep the unavoidable
    // non-atomic parent-status race as narrow as the upstream contract allows.
    await this.assertWritableParent(request, 'parent errand write guard');

    const expectedStatus = precondition.mode === 'create' ? 201 : 200;
    const writeResponse = await this.apiService.put<SupportJsonParameter<TKey>, SupportJsonParameter<TKey>>(
      {
        url: this.documentUrl(request, request.definition.key),
        data: {
          key: request.definition.key,
          schemaId: request.data.schemaId,
          value,
        },
        headers: precondition.headers,
        followLocation: false,
        includeResponseHeaders: true,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
        notifySubscribers: request.internal?.notifySubscribers,
      },
      request.user,
    );
    const written = requireDocumentResponse(request.definition, writeResponse, expectedStatus, 'JSON parameter write');
    if (written.document.schemaId !== request.data.schemaId) {
      throw new HttpException(502, 'Support Management returned a different JSON parameter schemaId');
    }

    const parentErrandVersion = await this.readFreshParentErrandVersion(request);
    return { ...written, parentErrandVersion };
  }

  /**
   * A document may only be written while its errand is open.
   *
   * The parent is read fresh for its *status*, not for its version: a locked or closed errand must
   * not accept document changes, but an errand whose version moved for some unrelated reason has
   * nothing to do with this document. Optimistic locking for the document itself is the document's
   * own ETag, which is what the write is conditioned on.
   */
  private async assertWritableParent<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
    operation: string,
  ): Promise<void> {
    const parent = await this.readParentErrand(request, operation);
    assertSupportErrandWritable(parent.data, 'JSON parameter changes');
  }

  private async preflightDocument<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
  ): Promise<ReadJsonParameterResult<TKey> | undefined> {
    try {
      return await this.readRawDocument(request);
    } catch (error) {
      if (hasHttpStatus(error, 404)) return undefined;
      throw error;
    }
  }

  private async readRawDocument<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
  ): Promise<ReadJsonParameterResult<TKey>> {
    const response = await this.apiService.get<SupportJsonParameter<TKey>>(
      {
        url: this.documentUrl(request, request.definition.key),
        followLocation: false,
        includeResponseHeaders: true,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      request.user,
    );
    return requireDocumentResponse(request.definition, response, 200, 'JSON parameter read');
  }

  private requireSchemaBinding<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
    schemaId: string,
    mismatchStatus: number,
  ): Promise<JsonSchema> {
    return this.schemaService.requireSchema({
      municipalityId: request.municipalityId,
      schemaId,
      expectedSchemaName: request.definition.schemaName,
      mismatchStatus,
      user: request.user,
    });
  }

  private async readFreshParentErrandVersion<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
  ): Promise<number> {
    const response = await this.readParentErrand(request, 'parent errand readback');
    return getErrandVersion(response.data, readResponseHeader(response.headers, 'etag'));
  }

  private async readParentErrand<TKey extends string, TSchemaName extends string>(
    request: JsonParameterRequest<TKey, TSchemaName>,
    operation: string,
  ): Promise<ApiResponse<Errand>> {
    const response = await this.apiService.get<Errand>(
      {
        url: this.errandUrl(request),
        followLocation: false,
        includeResponseHeaders: true,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      request.user,
    );
    requireResponseStatus(response, 200, operation);
    if (!isRecord(response.data)) throw new HttpException(502, 'Support Management returned an invalid parent errand');
    return response;
  }

  private documentUrl<TKey extends string, TSchemaName extends string>(request: JsonParameterRequest<TKey, TSchemaName>, key: TKey): string {
    return `${this.errandUrl(request)}/json-parameters/${encodeURIComponent(key)}`;
  }

  private errandUrl<TKey extends string, TSchemaName extends string>(request: JsonParameterRequest<TKey, TSchemaName>): string {
    return `${this.supportManagementService}/${encodeURIComponent(request.municipalityId)}/${encodeURIComponent(this.namespace)}/errands/${encodeURIComponent(request.errandId)}`;
  }
}
