import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { apiServiceName } from '@/config/api-config';
import type { JsonSchema } from '@/data-contracts/jsonschema/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import type { User } from '@/interfaces/users.interface';

import ApiService, { type ApiResponse } from './api.service';

export interface JsonObject {
  readonly [property: string]: JsonValue;
}

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isJsonValue = (value: unknown, ancestors: ReadonlySet<object> = new Set()): value is JsonValue => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, nextAncestors));
  return Object.values(value).every(item => isJsonValue(item, nextAncestors));
};

export const isJsonObject = (value: unknown): value is JsonObject => isRecord(value) && isJsonValue(value);

export const requireResponseStatus = <TStatus extends number>(response: ApiResponse<unknown>, expected: TStatus, operation: string): TStatus => {
  if (response.status !== expected) {
    throw new HttpException(502, `Support Management returned unexpected status for ${operation}`);
  }
  return expected;
};

/** Local so this module stays free of any caller-specific config import. */
const trimServicePath = (value: string): string => {
  const trimmedValue = value.trim();
  let start = 0;
  while (trimmedValue[start] === '/') start += 1;

  let end = trimmedValue.length;
  while (end > start && trimmedValue[end - 1] === '/') end -= 1;
  return trimmedValue.slice(start, end);
};

type SchemaApiService = Pick<ApiService, 'get'>;

export interface SchemaBoundJsonServiceDependencies {
  readonly apiService?: SchemaApiService;
  readonly jsonSchemaService?: string;
}

export interface RequireSchemaRequest {
  readonly municipalityId: string;
  readonly schemaId: string;
  /** The schema `name` the caller has bound this schemaId to. */
  readonly expectedSchemaName: string;
  /**
   * Status thrown when the schemaId resolves to a schema with a different name. Callers use 400
   * when the client chose the schemaId and 502 when it was already persisted upstream.
   */
  readonly mismatchStatus: number;
  readonly user: User;
}

export interface ValidateJsonRequest extends RequireSchemaRequest {
  readonly value: JsonObject;
}

/**
 * Fetches a JSON Schema by id, verifies it is the schema the caller expects, and validates an
 * instance against it. Deliberately knows nothing about errands, ETags or any single API, so any
 * feature storing a schema-validated JSON document can reuse it.
 */
export class SchemaBoundJsonService {
  private readonly apiService: SchemaApiService;
  private readonly jsonSchemaService: string;

  constructor(dependencies: SchemaBoundJsonServiceDependencies = {}) {
    this.apiService = dependencies.apiService ?? new ApiService();
    const service = trimServicePath(dependencies.jsonSchemaService ?? apiServiceName('jsonschema'));
    if (!service) throw new Error('JSON Schema service must not be empty');
    this.jsonSchemaService = service;
  }

  /** Resolves a schemaId and asserts it is bound to `expectedSchemaName`. */
  async requireSchema(request: RequireSchemaRequest): Promise<JsonSchema> {
    const response = await this.apiService.get<JsonSchema>(
      {
        url: `${this.jsonSchemaService}/${encodeURIComponent(request.municipalityId)}/schemas/${encodeURIComponent(request.schemaId)}`,
        followLocation: false,
        includeResponseHeaders: true,
        propagateClientError: true,
      },
      request.user,
    );
    requireResponseStatus(response, 200, 'schema read');
    if (!isRecord(response.data) || typeof response.data.name !== 'string') {
      throw new HttpException(502, 'JSON Schema returned invalid schema metadata');
    }
    if (response.data.id !== undefined && response.data.id !== request.schemaId) {
      throw new HttpException(502, 'JSON Schema returned metadata for a different schemaId');
    }
    if (response.data.name !== request.expectedSchemaName) {
      throw new HttpException(request.mismatchStatus, 'Document schemaId does not match its configured schemaName');
    }
    return response.data;
  }

  /**
   * Validates the instance against an already-fetched schema. A client-side form usually validates
   * the same schema, but the BFF is the trust boundary for these documents: without this, a direct
   * call persists a legally significant document with required fields absent.
   */
  assertValueMatchesSchema(schema: JsonSchema, value: JsonObject): void {
    if (!isRecord(schema.value)) {
      throw new HttpException(502, 'JSON Schema returned a schema without a schema document');
    }

    let validate: ReturnType<Ajv2020['compile']>;
    try {
      const ajv = new Ajv2020({ allErrors: true, strict: false });
      addFormats(ajv);
      validate = ajv.compile(schema.value);
    } catch {
      throw new HttpException(502, 'JSON Schema returned a schema that could not be compiled');
    }

    if (!validate(value)) {
      const details = (validate.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`).join('; ');
      throw new HttpException(400, `Document does not match its JSON Schema: ${details}`);
    }
  }

  /** Resolves the bound schema and validates the instance against it. */
  async validate(request: ValidateJsonRequest): Promise<JsonSchema> {
    const schema = await this.requireSchema(request);
    this.assertValueMatchesSchema(schema, request.value);
    return schema;
  }
}
