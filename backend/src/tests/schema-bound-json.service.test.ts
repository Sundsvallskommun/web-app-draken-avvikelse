import { HttpException } from '@/exceptions/HttpException';
import type { User } from '@/interfaces/users.interface';
import ApiService, { type ApiRequestConfig, type ApiResponse } from '@/services/api.service';
import { isJsonObject, type JsonObject, SchemaBoundJsonService } from '@/services/schema-bound-json.service';

import { mockUser } from './helpers/http';

const JSON_SCHEMA_SERVICE = 'jsonschema/1.0';
const MUNICIPALITY_ID = '2281';
const SCHEMA_ID = '2281_custom-schema_1.0';
const SCHEMA_NAME = 'custom-schema';
const USER = mockUser({ username: 'writer' });
const SCHEMA_URL = `${JSON_SCHEMA_SERVICE}/${MUNICIPALITY_ID}/schemas/${SCHEMA_ID}`;

type QueuedResponse = ApiResponse<unknown> | Error;

class FakeApiService extends ApiService {
  readonly getCalls: ApiRequestConfig<unknown>[] = [];
  private readonly getQueue: QueuedResponse[];

  constructor(getQueue: readonly QueuedResponse[]) {
    super();
    this.getQueue = [...getQueue];
  }

  override async get<T>(config: ApiRequestConfig, _user: User): Promise<ApiResponse<T>> {
    this.getCalls.push(config as ApiRequestConfig<unknown>);
    const next = this.getQueue.shift();
    if (!next) throw new Error('Unexpected GET call');
    if (next instanceof Error) throw next;
    return next as ApiResponse<T>;
  }
}

const response = <T>(data: T, status: number): ApiResponse<T> => ({ data, message: 'success', status });

const schema = (name: string = SCHEMA_NAME, id: string | undefined = SCHEMA_ID, value: object = { type: 'object' }) => ({
  id,
  name,
  version: '1.0',
  value,
});

const makeSubject = (getQueue: readonly QueuedResponse[]) => {
  const api = new FakeApiService(getQueue);
  const service = new SchemaBoundJsonService({ apiService: api, jsonSchemaService: JSON_SCHEMA_SERVICE });
  return { api, service };
};

const schemaRequest = (mismatchStatus = 400) => ({
  municipalityId: MUNICIPALITY_ID,
  schemaId: SCHEMA_ID,
  expectedSchemaName: SCHEMA_NAME,
  mismatchStatus,
  user: USER,
});

describe('SchemaBoundJsonService', () => {
  describe('requireSchema', () => {
    it('resolves the schema by id and returns it when the name binding holds', async () => {
      const { api, service } = makeSubject([response(schema(), 200)]);

      await expect(service.requireSchema(schemaRequest())).resolves.toMatchObject({ id: SCHEMA_ID, name: SCHEMA_NAME });
      expect(api.getCalls.map(call => call.url)).toEqual([SCHEMA_URL]);
    });

    it('percent-encodes the municipality and schema id in the lookup url', async () => {
      const { api, service } = makeSubject([response(schema(SCHEMA_NAME, 'weird/id'), 200)]);

      await service.requireSchema({ ...schemaRequest(), schemaId: 'weird/id' });

      expect(api.getCalls[0].url).toBe(`${JSON_SCHEMA_SERVICE}/${MUNICIPALITY_ID}/schemas/weird%2Fid`);
    });

    it('uses the caller-supplied status when the schemaId is bound to another schemaName', async () => {
      const { service } = makeSubject([response(schema('another-schema'), 200)]);

      await expect(service.requireSchema(schemaRequest(400))).rejects.toMatchObject({
        status: 400,
        message: 'Document schemaId does not match its configured schemaName',
      });
    });

    it('reports a persisted binding mismatch as an upstream contract failure when the caller says so', async () => {
      const { service } = makeSubject([response(schema('another-schema'), 200)]);

      await expect(service.requireSchema(schemaRequest(502))).rejects.toMatchObject({ status: 502 });
    });

    it('rejects metadata returned for a different schemaId', async () => {
      const { service } = makeSubject([response(schema(SCHEMA_NAME, 'different-id'), 200)]);

      await expect(service.requireSchema(schemaRequest())).rejects.toMatchObject({
        status: 502,
        message: 'JSON Schema returned metadata for a different schemaId',
      });
    });

    it('accepts metadata that omits the id rather than inventing a mismatch', async () => {
      const { id: _id, ...withoutId } = schema();
      const { service } = makeSubject([response(withoutId, 200)]);

      await expect(service.requireSchema(schemaRequest())).resolves.toMatchObject({ name: SCHEMA_NAME });
    });

    it('rejects metadata without a name', async () => {
      const { service } = makeSubject([response({ id: SCHEMA_ID, value: { type: 'object' } }, 200)]);

      await expect(service.requireSchema(schemaRequest())).rejects.toMatchObject({
        status: 502,
        message: 'JSON Schema returned invalid schema metadata',
      });
    });

    it('treats an unexpected upstream status as a contract failure', async () => {
      const { service } = makeSubject([response(schema(), 204)]);

      await expect(service.requireSchema(schemaRequest())).rejects.toMatchObject({ status: 502 });
    });

    it('propagates an upstream lookup failure unchanged', async () => {
      const { service } = makeSubject([new HttpException(404, 'Not found')]);

      await expect(service.requireSchema(schemaRequest())).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('assertValueMatchesSchema', () => {
    const service = new SchemaBoundJsonService({ jsonSchemaService: JSON_SCHEMA_SERVICE });

    it('accepts an instance that satisfies the schema', () => {
      const bound = schema(SCHEMA_NAME, SCHEMA_ID, { type: 'object', required: ['decision'], properties: { decision: { type: 'string' } } });

      expect(() => service.assertValueMatchesSchema(bound, { decision: 'approved' })).not.toThrow();
    });

    it('rejects an instance missing a required property and names it', () => {
      const bound = schema(SCHEMA_NAME, SCHEMA_ID, { type: 'object', required: ['decision'], properties: { decision: { type: 'string' } } });

      expect(() => service.assertValueMatchesSchema(bound, {})).toThrowError(expect.objectContaining({ status: 400 }));
      expect(() => service.assertValueMatchesSchema(bound, {})).toThrowError(/must have required property 'decision'/u);
    });

    it('enforces standard formats at the trust boundary', () => {
      const bound = schema(SCHEMA_NAME, SCHEMA_ID, {
        type: 'object',
        required: ['decisionDate'],
        properties: { decisionDate: { type: 'string', format: 'date' } },
      });

      expect(() => service.assertValueMatchesSchema(bound, { decisionDate: 'not-a-date' })).toThrowError(/must match format "date"/u);
    });

    it('reports every violation rather than only the first', () => {
      const bound = schema(SCHEMA_NAME, SCHEMA_ID, { type: 'object', required: ['a', 'b'], properties: { a: { type: 'string' } } });

      expect(() => service.assertValueMatchesSchema(bound, {})).toThrowError(/'a'.*'b'/su);
    });

    it('treats an uncompilable schema as an upstream contract failure', () => {
      const bound = schema(SCHEMA_NAME, SCHEMA_ID, { type: 'object', properties: { decision: { type: 'unsupported-type' } } });

      expect(() => service.assertValueMatchesSchema(bound, {})).toThrowError(
        expect.objectContaining({ status: 502, message: 'JSON Schema returned a schema that could not be compiled' }),
      );
    });

    it('treats metadata without a schema document as an upstream contract failure', () => {
      expect(() => service.assertValueMatchesSchema({ id: SCHEMA_ID, name: SCHEMA_NAME }, {})).toThrowError(
        expect.objectContaining({ status: 502, message: 'JSON Schema returned a schema without a schema document' }),
      );
    });
  });

  describe('validate', () => {
    it('resolves the binding before validating the instance', async () => {
      const bound = schema(SCHEMA_NAME, SCHEMA_ID, { type: 'object', required: ['decision'], properties: { decision: { type: 'string' } } });
      const { api, service } = makeSubject([response(bound, 200)]);

      await expect(service.validate({ ...schemaRequest(), value: { decision: 'approved' } })).resolves.toMatchObject({ name: SCHEMA_NAME });
      expect(api.getCalls.map(call => call.url)).toEqual([SCHEMA_URL]);
    });

    it('fails on the binding without ever validating the instance', async () => {
      const { service } = makeSubject([response(schema('another-schema'), 200)]);

      await expect(service.validate({ ...schemaRequest(400), value: {} })).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('isJsonObject', () => {
    it('accepts a nested plain JSON object', () => {
      expect(isJsonObject({ a: [1, 'two', null, { b: true }] })).toBe(true);
    });

    it.each([
      ['an array', [] as unknown],
      ['null', null],
      ['a string', 'text'],
      ['a non-finite number holder', { a: Number.POSITIVE_INFINITY }],
      ['a function holder', { a: () => undefined }],
      ['an undefined holder', { a: undefined }],
    ])('rejects %s', (_label, value) => {
      expect(isJsonObject(value)).toBe(false);
    });

    it('rejects a cyclic structure instead of recursing forever', () => {
      const cyclic: Record<string, unknown> = { name: 'loop' };
      cyclic.self = cyclic;

      expect(isJsonObject(cyclic)).toBe(false);
    });

    it('accepts a value that repeats a shared child without being cyclic', () => {
      const shared = { flag: true };

      expect(isJsonObject({ first: shared, second: shared } satisfies Record<string, JsonObject>)).toBe(true);
    });
  });
});
