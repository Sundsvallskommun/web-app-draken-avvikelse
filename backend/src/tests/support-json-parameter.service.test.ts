import { HttpException } from '@/exceptions/HttpException';
import type { User } from '@/interfaces/users.interface';
import ApiService, { type ApiRequestConfig, type ApiResponse } from '@/services/api.service';
import type { JsonObject } from '@/services/schema-bound-json.service';
import { type JsonParameterWritePreconditions, SupportJsonParameterService } from '@/services/support-json-parameter.service';

import { mockUser } from './helpers/http';

const SUPPORT_MANAGEMENT_SERVICE = 'supportmanagement-sprint/14.14';
const JSON_SCHEMA_SERVICE = 'jsonschema/1.0';
const MUNICIPALITY_ID = '2281';
const NAMESPACE = 'MY_NAMESPACE';
const ERRAND_ID = 'errand/with spaces';
const SCHEMA_ID = '2281_custom-schema_1.0';
const DEFINITION = { key: 'custom-document', schemaName: 'custom-schema' } as const;
const USER = mockUser({ username: 'writer' });
const DOCUMENT_URL = `${SUPPORT_MANAGEMENT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands/errand%2Fwith%20spaces/json-parameters/custom-document`;
const ERRAND_URL = `${SUPPORT_MANAGEMENT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands/errand%2Fwith%20spaces`;
const SCHEMA_URL = `${JSON_SCHEMA_SERVICE}/${MUNICIPALITY_ID}/schemas/${SCHEMA_ID}`;

type QueuedResponse = ApiResponse<unknown> | Error;

class FakeApiService extends ApiService {
  readonly getCalls: ApiRequestConfig<unknown>[] = [];
  readonly getUsers: User[] = [];
  readonly putCalls: ApiRequestConfig<unknown>[] = [];
  readonly putUsers: User[] = [];
  private readonly getQueue: QueuedResponse[];
  private readonly putQueue: QueuedResponse[];

  constructor(getQueue: readonly QueuedResponse[], putQueue: readonly QueuedResponse[] = []) {
    super();
    this.getQueue = [...getQueue];
    this.putQueue = [...putQueue];
  }

  override async get<T>(config: ApiRequestConfig, user: User): Promise<ApiResponse<T>> {
    this.getCalls.push(config as ApiRequestConfig<unknown>);
    this.getUsers.push(user);
    return this.next<T>(this.getQueue, 'GET');
  }

  override async put<T, D>(config: ApiRequestConfig<D>, user: User): Promise<ApiResponse<T>> {
    this.putCalls.push(config as ApiRequestConfig<unknown>);
    this.putUsers.push(user);
    return this.next<T>(this.putQueue, 'PUT');
  }

  private next<T>(queue: QueuedResponse[], method: string): ApiResponse<T> {
    const response = queue.shift();
    if (!response) throw new Error(`Unexpected ${method} call`);
    if (response instanceof Error) throw response;
    return response as ApiResponse<T>;
  }
}

const response = <T>(data: T, status: number, etag?: string): ApiResponse<T> => ({
  data,
  message: 'success',
  status,
  ...(etag !== undefined && { headers: { etag } }),
});

const document = (version: number, schemaId = SCHEMA_ID) => ({
  key: DEFINITION.key,
  schemaId,
  value: { assessment: `version-${version}` },
  version,
});

const schema = (name: string = DEFINITION.schemaName, id = SCHEMA_ID, value: object = { type: 'object' }) => ({
  id,
  name,
  version: '1.0',
  value,
});
const parentErrand = (version: number) => ({ id: ERRAND_ID, version });
const writableParentResponse = (version: number = 10) => response(parentErrand(version), 200, `"${version}"`);

const makeSubject = (getQueue: readonly QueuedResponse[], putQueue: readonly QueuedResponse[] = []) => {
  const api = new FakeApiService(getQueue, putQueue);
  const service = new SupportJsonParameterService({
    apiService: api,
    namespace: NAMESPACE,
    supportManagementService: SUPPORT_MANAGEMENT_SERVICE,
    jsonSchemaService: JSON_SCHEMA_SERVICE,
  });
  return { api, service };
};

const request = {
  definition: DEFINITION,
  municipalityId: MUNICIPALITY_ID,
  errandId: ERRAND_ID,
  user: USER,
};

const writeRequest = (preconditions: JsonParameterWritePreconditions, schemaId = SCHEMA_ID, value: JsonObject = { assessment: 'saved' }) => ({
  ...request,
  data: { schemaId, value },
  preconditions: { parentErrandVersion: '10', ...preconditions },
});

describe('SupportJsonParameterService', () => {
  it('reads a document only after binding the injected schemaName to schema metadata', async () => {
    const { api, service } = makeSubject([response(document(7), 200, '"7"'), response(schema(), 200)]);

    await expect(service.readJsonParameter(request)).resolves.toEqual({
      document: document(7),
      etag: '"7"',
      status: 200,
    });

    expect(api.getCalls).toHaveLength(2);
    expect(api.getCalls[0]).toMatchObject({
      url: DOCUMENT_URL,
      followLocation: false,
      includeResponseHeaders: true,
      propagateClientError: true,
    });
    expect(api.getCalls[1]).toMatchObject({
      url: SCHEMA_URL,
      followLocation: false,
      includeResponseHeaders: true,
      propagateClientError: true,
    });
    expect(api.getUsers).toEqual([USER, USER]);
  });

  it('exposes the parent errand for applicability decisions without touching the document', async () => {
    const { api, service } = makeSubject([writableParentResponse(3)]);

    await expect(service.readParentErrandSnapshot(request)).resolves.toEqual(parentErrand(3));

    expect(api.getCalls).toHaveLength(1);
    expect(api.getCalls[0]).toMatchObject({ url: ERRAND_URL, followLocation: false, includeResponseHeaders: true, propagateClientError: true });
    expect(api.getUsers).toEqual([USER]);
  });

  it('verifies configured document reads through Support Management without loading schemas', async () => {
    const missingDefinition = { key: 'missing-document', schemaName: 'other-schema' } as const;
    const { api, service } = makeSubject([response(document(7), 200, '"7"'), new HttpException(404, 'Not found')]);

    await expect(
      service.verifyReadableDocuments({
        definitions: [DEFINITION, missingDefinition],
        municipalityId: MUNICIPALITY_ID,
        errandId: ERRAND_ID,
        user: USER,
      }),
    ).resolves.toEqual({ existingDocumentKeys: [DEFINITION.key] });

    expect(api.getCalls.map(call => call.url)).toEqual([DOCUMENT_URL, `${ERRAND_URL}/json-parameters/missing-document`]);
    expect(api.getCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ followLocation: false, includeResponseHeaders: true, propagateClientError: true })]),
    );
    expect(api.getCalls.some(call => call.url?.startsWith(JSON_SCHEMA_SERVICE))).toBe(false);
  });

  it('propagates Support Management authorization decisions while verifying document reads', async () => {
    const forbidden = new HttpException(403, 'Forbidden');
    const { service } = makeSubject([forbidden]);

    await expect(
      service.verifyReadableDocuments({
        definitions: [DEFINITION],
        municipalityId: MUNICIPALITY_ID,
        errandId: ERRAND_ID,
        user: USER,
      }),
    ).rejects.toBe(forbidden);
  });

  it('updates with the exact preflight ETag and returns the upstream status, ETag and fresh parent version', async () => {
    const { api, service } = makeSubject(
      [
        writableParentResponse(11),
        response(document(7), 200, '"7"'),
        response(schema(), 200),
        writableParentResponse(11),
        writableParentResponse(12),
      ],
      [response(document(8), 200, '"8"')],
    );

    await expect(service.writeJsonParameter(writeRequest({ ifMatch: '"7"', parentErrandVersion: '11' }))).resolves.toEqual({
      document: document(8),
      etag: '"8"',
      status: 200,
      parentErrandVersion: 12,
    });

    expect(api.getCalls.map(call => call.url)).toEqual([ERRAND_URL, DOCUMENT_URL, SCHEMA_URL, ERRAND_URL, ERRAND_URL]);
    expect(api.putCalls).toHaveLength(1);
    expect(api.putCalls[0]).toMatchObject({
      url: DOCUMENT_URL,
      data: { key: DEFINITION.key, schemaId: SCHEMA_ID, value: { assessment: 'saved' } },
      headers: { 'If-Match': '"7"' },
      followLocation: false,
      includeResponseHeaders: true,
      propagateClientError: true,
    });
    expect(api.putUsers).toEqual([USER]);
  });

  it('translates the client create-only condition to an impossible upstream If-Match and keeps 201 and ETag', async () => {
    const { api, service } = makeSubject(
      [writableParentResponse(3), new HttpException(404, 'Not found'), response(schema(), 200), writableParentResponse(3), writableParentResponse(4)],
      [response(document(0), 201, '"0"')],
    );

    await expect(service.writeJsonParameter(writeRequest({ ifNoneMatch: '*', parentErrandVersion: '3' }))).resolves.toEqual({
      document: document(0),
      etag: '"0"',
      status: 201,
      parentErrandVersion: 4,
    });

    expect(api.putCalls).toHaveLength(1);
    expect(api.putCalls[0]).toMatchObject({
      url: DOCUMENT_URL,
      headers: { 'If-Match': '"-1"' },
      followLocation: false,
      includeResponseHeaders: true,
      propagateClientError: true,
    });
  });

  it.each([
    { name: 'a malformed parent version', preconditions: { ifMatch: '"7"', parentErrandVersion: '01' }, status: 400, getCalls: 0 },
    { name: 'a missing precondition', preconditions: {}, status: 428, getCalls: 2 },
    { name: 'a wildcard If-Match', preconditions: { ifMatch: '*' }, status: 400, getCalls: 0 },
    { name: 'a weak If-Match', preconditions: { ifMatch: 'W/"7"' }, status: 400, getCalls: 0 },
    { name: 'a non-canonical If-Match', preconditions: { ifMatch: '"07"' }, status: 400, getCalls: 0 },
    { name: 'an ETag list', preconditions: { ifMatch: '"7", "8"' }, status: 400, getCalls: 0 },
    { name: 'both conditional headers', preconditions: { ifMatch: '"7"', ifNoneMatch: '*' }, status: 400, getCalls: 0 },
    { name: 'a stale If-Match', preconditions: { ifMatch: '"6"' }, status: 412, getCalls: 2 },
    { name: 'If-None-Match for an existing resource', preconditions: { ifNoneMatch: '*' }, status: 412, getCalls: 2 },
  ])('rejects update with $name before PUT', async ({ preconditions, status, getCalls }) => {
    const { api, service } = makeSubject([writableParentResponse(), response(document(7), 200, '"7"')]);

    await expect(service.writeJsonParameter(writeRequest(preconditions))).rejects.toMatchObject({ status });

    expect(api.getCalls).toHaveLength(getCalls);
    expect(api.putCalls).toHaveLength(0);
  });

  it.each([
    { name: 'a missing precondition', preconditions: {}, status: 428, getCalls: 2 },
    { name: 'If-Match for an absent resource', preconditions: { ifMatch: '"0"' }, status: 412, getCalls: 2 },
    { name: 'a quoted If-None-Match', preconditions: { ifNoneMatch: '"*"' }, status: 400, getCalls: 0 },
    { name: 'a weak If-None-Match', preconditions: { ifNoneMatch: 'W/"0"' }, status: 400, getCalls: 0 },
  ])('rejects create with $name before PUT', async ({ preconditions, status, getCalls }) => {
    const { api, service } = makeSubject([writableParentResponse(), new HttpException(404, 'Not found')]);

    await expect(service.writeJsonParameter(writeRequest(preconditions))).rejects.toMatchObject({ status });

    expect(api.getCalls).toHaveLength(getCalls);
    expect(api.putCalls).toHaveLength(0);
  });

  it('freezes schemaId after creation before reading schema metadata or writing', async () => {
    const changedSchemaId = '2281_custom-schema_2.0';
    const { api, service } = makeSubject([writableParentResponse(), response(document(7), 200, '"7"')]);

    await expect(service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }, changedSchemaId))).rejects.toMatchObject({
      status: 409,
      message: 'A JSON parameter schemaId cannot be changed after creation',
    });

    expect(api.getCalls).toHaveLength(2);
    expect(api.putCalls).toHaveLength(0);
  });

  it.each(['SOLVED', 'SUSPENDED', 'ASSIGNED', 'REOPENED'])('rejects writes when the parent errand status is %s', async status => {
    const { api, service } = makeSubject([response({ ...parentErrand(10), status }, 200, '"10"')]);

    await expect(service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }))).rejects.toMatchObject({
      status: 409,
      message: 'Support errand status does not allow JSON parameter changes',
    });

    expect(api.getCalls.map(call => call.url)).toEqual([ERRAND_URL]);
    expect(api.putCalls).toHaveLength(0);
  });

  it('rejects a create when schema metadata does not match the injected schemaName', async () => {
    const { api, service } = makeSubject([writableParentResponse(), new HttpException(404, 'Not found'), response(schema('another-schema'), 200)]);

    await expect(service.writeJsonParameter(writeRequest({ ifNoneMatch: '*' }))).rejects.toMatchObject({
      status: 400,
      message: 'Document schemaId does not match its configured schemaName',
    });

    expect(api.getCalls.map(call => call.url)).toEqual([ERRAND_URL, DOCUMENT_URL, SCHEMA_URL]);
    expect(api.putCalls).toHaveLength(0);
  });

  it('rejects a document that omits fields required by its bound JSON Schema', async () => {
    const requiredSchema = schema(DEFINITION.schemaName, SCHEMA_ID, {
      type: 'object',
      required: ['decision'],
      properties: { decision: { type: 'string' } },
    });
    const { api, service } = makeSubject([writableParentResponse(), new HttpException(404, 'Not found'), response(requiredSchema, 200)]);

    await expect(service.writeJsonParameter(writeRequest({ ifNoneMatch: '*' }))).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("must have required property 'decision'"),
    });

    expect(api.putCalls).toHaveLength(0);
  });

  // An emptied rich-text editor leaves `<p><br></p>` behind, which a plain required or minLength
  // check would take for an answer - the way Beslut SoL/LSS could be saved without a motivation.
  it('treats a rich-text answer without words as missing', async () => {
    const motivatedSchema = schema(DEFINITION.schemaName, SCHEMA_ID, {
      type: 'object',
      required: ['motivation'],
      properties: { motivation: { type: 'string', minLength: 1, contentMediaType: 'text/html' } },
    });
    const { api, service } = makeSubject([writableParentResponse(), new HttpException(404, 'Not found'), response(motivatedSchema, 200)]);

    await expect(service.writeJsonParameter(writeRequest({ ifNoneMatch: '*' }, SCHEMA_ID, { motivation: '<p><br></p>' }))).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("must have required property 'motivation'"),
    });

    expect(api.putCalls).toHaveLength(0);
  });

  const stampedSchema = () =>
    schema(DEFINITION.schemaName, SCHEMA_ID, {
      type: 'object',
      additionalProperties: false,
      properties: {
        assessment: { type: 'string' },
        decidedAt: { type: 'string', format: 'date-time', 'x-draken-server-timestamp': 'created' },
        updatedAt: { type: 'string', format: 'date-time', 'x-draken-server-timestamp': 'updated' },
        revisions: {
          type: 'array',
          'x-draken-server-revisions': true,
          items: { type: 'object', required: ['savedAt', 'savedBy'], properties: { savedAt: { type: 'string' }, savedBy: { type: 'string' } } },
        },
        other: { type: 'string', 'x-draken-server-timestamp': false },
      },
    });
  const stampedSubject = (getQueue: readonly QueuedResponse[], putQueue: readonly QueuedResponse[], now: string) => {
    const api = new FakeApiService(getQueue, putQueue);
    const service = new SupportJsonParameterService({
      apiService: api,
      namespace: NAMESPACE,
      supportManagementService: SUPPORT_MANAGEMENT_SERVICE,
      jsonSchemaService: JSON_SCHEMA_SERVICE,
      clock: () => new Date(now),
    });
    return { api, service };
  };

  it('stamps the created and updated timestamps and the first revision on a create, whatever the client sent', async () => {
    const { api, service } = stampedSubject(
      [
        writableParentResponse(),
        new HttpException(404, 'Not found'),
        response(stampedSchema(), 200),
        writableParentResponse(),
        writableParentResponse(11),
      ],
      [response(document(1), 201, '"1"')],
      '2026-09-11T12:30:00.000Z',
    );

    await expect(
      service.writeJsonParameter(
        writeRequest({ ifNoneMatch: '*' }, SCHEMA_ID, {
          assessment: 'saved',
          decidedAt: '2001-01-01T00:00:00Z',
          revisions: [{ savedAt: '2001-01-01T00:00:00Z', savedBy: 'forged' }],
          other: 'kept',
        }),
      ),
    ).resolves.toMatchObject({ status: 201 });

    expect(api.putCalls[0]).toMatchObject({
      data: {
        value: {
          assessment: 'saved',
          decidedAt: '2026-09-11T12:30:00.000Z',
          updatedAt: '2026-09-11T12:30:00.000Z',
          revisions: [{ savedAt: '2026-09-11T12:30:00.000Z', savedBy: USER.username }],
          other: 'kept',
        },
      },
    });
  });

  it('keeps the stored created timestamp and extends the stored revisions on an update', async () => {
    const stored = {
      ...document(7),
      value: {
        assessment: 'version-7',
        decidedAt: '2026-09-11T12:30:00.000Z',
        updatedAt: '2026-09-11T12:30:00.000Z',
        revisions: [{ savedAt: '2026-09-11T12:30:00.000Z', savedBy: 'first' }],
      },
    };
    const { api, service } = stampedSubject(
      [writableParentResponse(), response(stored, 200, '"7"'), response(stampedSchema(), 200), writableParentResponse(), writableParentResponse(11)],
      [response(document(8), 200, '"8"')],
      '2026-09-12T08:00:00.000Z',
    );

    await service.writeJsonParameter(
      writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'changed', decidedAt: '1999-01-01T00:00:00Z', revisions: [] }),
    );

    expect(api.putCalls[0]).toMatchObject({
      data: {
        value: {
          assessment: 'changed',
          decidedAt: '2026-09-11T12:30:00.000Z',
          updatedAt: '2026-09-12T08:00:00.000Z',
          revisions: [
            { savedAt: '2026-09-11T12:30:00.000Z', savedBy: 'first' },
            { savedAt: '2026-09-12T08:00:00.000Z', savedBy: USER.username },
          ],
        },
      },
    });
  });

  const authoredSchema = () =>
    schema(DEFINITION.schemaName, SCHEMA_ID, {
      type: 'object',
      additionalProperties: false,
      properties: {
        assessment: { type: 'string' },
        decisionMaker: {
          type: 'object',
          'x-draken-server-author': 'created',
          additionalProperties: false,
          required: ['name'],
          properties: { name: { type: 'string' }, role: { type: 'string' } },
        },
      },
    });

  it('records who first writes a document, by name and in the role that answers for it, whatever the client sent', async () => {
    const { api, service } = makeSubject(
      [
        writableParentResponse(),
        new HttpException(404, 'Not found'),
        response(authoredSchema(), 200),
        writableParentResponse(),
        writableParentResponse(11),
      ],
      [response(document(1), 201, '"1"')],
    );

    await service.writeJsonParameter({
      ...writeRequest({ ifNoneMatch: '*' }, SCHEMA_ID, { assessment: 'saved', decisionMaker: { name: 'Forged', role: 'Anybody' } }),
      definition: { ...DEFINITION, ownerLabel: 'LEX-ansvarig' },
    });

    expect(api.putCalls[0]).toMatchObject({
      data: { value: { assessment: 'saved', decisionMaker: { name: USER.name, role: 'LEX-ansvarig' } } },
    });
  });

  it('keeps who first wrote the document when somebody else saves it later', async () => {
    const stored = { ...document(7), value: { assessment: 'version-7', decisionMaker: { name: 'First Decider', role: 'LEX-ansvarig' } } };
    const { api, service } = makeSubject(
      [writableParentResponse(), response(stored, 200, '"7"'), response(authoredSchema(), 200), writableParentResponse(), writableParentResponse(11)],
      [response(document(8), 200, '"8"')],
    );

    await service.writeJsonParameter({
      ...writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'changed' }),
      definition: { ...DEFINITION, ownerLabel: 'LEX-ansvarig' },
    });

    expect(api.putCalls[0]).toMatchObject({
      data: { value: { assessment: 'changed', decisionMaker: { name: 'First Decider', role: 'LEX-ansvarig' } } },
    });
  });

  it('records the writer without a role where the profile names none', async () => {
    const { api, service } = makeSubject(
      [
        writableParentResponse(),
        new HttpException(404, 'Not found'),
        response(authoredSchema(), 200),
        writableParentResponse(),
        writableParentResponse(11),
      ],
      [response(document(1), 201, '"1"')],
    );

    await service.writeJsonParameter(writeRequest({ ifNoneMatch: '*' }, SCHEMA_ID, { assessment: 'saved' }));

    expect((api.putCalls[0].data as { value: JsonObject }).value.decisionMaker).toEqual({ name: USER.name });
  });

  it('leaves documents whose schema declares no server stamps exactly as sent', async () => {
    const plainSchema = schema(DEFINITION.schemaName, SCHEMA_ID, { type: 'object', properties: { decidedAt: { type: 'string' } } });
    const { api, service } = makeSubject(
      [
        writableParentResponse(),
        new HttpException(404, 'Not found'),
        response(plainSchema, 200),
        writableParentResponse(),
        writableParentResponse(11),
      ],
      [response(document(1), 201, '"1"')],
    );

    await service.writeJsonParameter(writeRequest({ ifNoneMatch: '*' }, SCHEMA_ID, { decidedAt: 'client-value' }));

    expect(api.putCalls[0]).toMatchObject({ data: { value: { decidedAt: 'client-value' } } });
  });

  it('enforces standard date formats at the backend trust boundary', async () => {
    const dateSchema = schema(DEFINITION.schemaName, SCHEMA_ID, {
      type: 'object',
      required: ['decisionDate'],
      properties: { decisionDate: { type: 'string', format: 'date' } },
    });
    const { api, service } = makeSubject([writableParentResponse(), new HttpException(404, 'Not found'), response(dateSchema, 200)]);

    await expect(service.writeJsonParameter(writeRequest({ ifNoneMatch: '*' }, SCHEMA_ID, { decisionDate: 'not-a-date' }))).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('must match format "date"'),
    });

    expect(api.putCalls).toHaveLength(0);
  });

  it('treats an uncompilable bound schema as an upstream contract failure', async () => {
    const invalidSchema = schema(DEFINITION.schemaName, SCHEMA_ID, {
      type: 'object',
      properties: { decision: { type: 'unsupported-type' } },
    });
    const { api, service } = makeSubject([writableParentResponse(), new HttpException(404, 'Not found'), response(invalidSchema, 200)]);

    await expect(service.writeJsonParameter(writeRequest({ ifNoneMatch: '*' }))).rejects.toMatchObject({
      status: 502,
      message: 'JSON Schema returned a schema that could not be compiled',
    });

    expect(api.putCalls).toHaveLength(0);
  });

  it('treats a persisted key-to-schema mismatch as an upstream contract failure', async () => {
    const { api, service } = makeSubject([response(document(7), 200, '"7"'), response(schema('another-schema'), 200)]);

    await expect(service.readJsonParameter(request)).rejects.toMatchObject({
      status: 502,
      message: 'Document schemaId does not match its configured schemaName',
    });

    expect(api.putCalls).toHaveLength(0);
  });

  it('rejects schema metadata returned for another schemaId', async () => {
    const { service } = makeSubject([response(document(7), 200, '"7"'), response(schema(DEFINITION.schemaName, 'different-id'), 200)]);

    await expect(service.readJsonParameter(request)).rejects.toMatchObject({
      status: 502,
      message: 'JSON Schema returned metadata for a different schemaId',
    });
  });

  it('propagates an upstream conditional write failure without attempting the parent readback', async () => {
    const upstreamFailure = new HttpException(412, 'Concurrent update');
    const { api, service } = makeSubject(
      [writableParentResponse(), response(document(7), 200, '"7"'), response(schema(), 200), writableParentResponse()],
      [upstreamFailure],
    );

    await expect(service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }))).rejects.toBe(upstreamFailure);

    expect(api.getCalls.map(call => call.url)).toEqual([ERRAND_URL, DOCUMENT_URL, SCHEMA_URL, ERRAND_URL]);
  });

  // Version checks are scoped to the resource being written. The errand's version moving means
  // somebody changed some other part of the errand, which this document write neither reads nor
  // overwrites - the document's own ETag is what protects it.
  it.each([
    { name: 'moved between load and write', preconditions: { ifMatch: '"7"', parentErrandVersion: '3' } },
    { name: 'was never sent', preconditions: { ifMatch: '"7"', parentErrandVersion: undefined } },
  ])('writes the document when the parent errand version $name', async ({ preconditions }) => {
    const { api, service } = makeSubject(
      [
        writableParentResponse(10),
        response(document(7), 200, '"7"'),
        response(schema(), 200),
        writableParentResponse(11),
        writableParentResponse(12),
      ],
      [response(document(8), 200, '"8"')],
    );

    await expect(service.writeJsonParameter(writeRequest(preconditions))).resolves.toMatchObject({
      status: 200,
      etag: '"8"',
      parentErrandVersion: 12,
    });

    expect(api.putCalls).toHaveLength(1);
    expect(api.putCalls[0]).toMatchObject({ url: DOCUMENT_URL, headers: { 'If-Match': '"7"' } });
  });

  it('still rechecks parent status immediately before the child write', async () => {
    const { api, service } = makeSubject([
      writableParentResponse(10),
      response(document(7), 200, '"7"'),
      response(schema(), 200),
      response({ ...parentErrand(11), status: 'SOLVED' }, 200, '"11"'),
    ]);

    await expect(service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }))).rejects.toMatchObject({ status: 409 });
    expect(api.getCalls.map(call => call.url)).toEqual([ERRAND_URL, DOCUMENT_URL, SCHEMA_URL, ERRAND_URL]);
    expect(api.putCalls).toHaveLength(0);
  });

  it('rejects when the parent becomes locked during document preflight', async () => {
    const { api, service } = makeSubject([
      writableParentResponse(10),
      response(document(7), 200, '"7"'),
      response(schema(), 200),
      response({ ...parentErrand(10), status: 'SOLVED' }, 200, '"10"'),
    ]);

    await expect(service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }))).rejects.toMatchObject({
      status: 409,
      message: 'Support errand status does not allow JSON parameter changes',
    });
    expect(api.getCalls.map(call => call.url)).toEqual([ERRAND_URL, DOCUMENT_URL, SCHEMA_URL, ERRAND_URL]);
    expect(api.putCalls).toHaveLength(0);
  });

  it('fails a create race when the key appears between preflight and the upstream transaction', async () => {
    const concurrentCreate = new HttpException(412, 'If-Match version does not match current resource version');
    const { api, service } = makeSubject(
      [writableParentResponse(), new HttpException(404, 'Not found'), response(schema(), 200), writableParentResponse()],
      [concurrentCreate],
    );

    await expect(service.writeJsonParameter(writeRequest({ ifNoneMatch: '*' }))).rejects.toBe(concurrentCreate);

    expect(api.putCalls[0]?.headers).toEqual({ 'If-Match': '"-1"' });
    expect(api.getCalls.map(call => call.url)).toEqual([ERRAND_URL, DOCUMENT_URL, SCHEMA_URL, ERRAND_URL]);
  });

  it.each(['W/"7"', '*', '"7", "8"', '7'])('rejects malformed upstream document ETag %s', async etag => {
    const { api, service } = makeSubject([response(document(7), 200, etag)]);

    await expect(service.readJsonParameter(request)).rejects.toMatchObject({ status: 502 });

    expect(api.getCalls).toHaveLength(1);
  });

  it('rejects an upstream body version that disagrees with its strong ETag', async () => {
    const { api, service } = makeSubject([response(document(7), 200, '"8"')]);

    await expect(service.readJsonParameter(request)).rejects.toMatchObject({
      status: 502,
      message: 'Support Management returned inconsistent JSON parameter versions',
    });

    expect(api.getCalls).toHaveLength(1);
  });
});

describe('server-owned values and completion locks', () => {
  const completionSchema = () =>
    schema(DEFINITION.schemaName, SCHEMA_ID, {
      type: 'object',
      additionalProperties: false,
      'x-draken-completion': { field: 'completed', reportsField: 'reports' },
      properties: {
        assessment: { type: 'string' },
        completed: { type: 'string', enum: ['yes', 'no'] },
        reports: { type: 'array', 'x-draken-server-owned': true },
      },
    });
  const stored = (value: JsonObject) => ({ ...document(7), value });
  const subject = (storedValue: JsonObject) =>
    makeSubject(
      [
        writableParentResponse(),
        response(stored(storedValue), 200, '"7"'),
        response(completionSchema(), 200),
        writableParentResponse(),
        writableParentResponse(11),
      ],
      [response(document(8), 200, '"8"')],
    );

  it('keeps a server-owned value from the stored document and drops the client copy', async () => {
    const { api, service } = subject({ assessment: 'a', completed: 'no', reports: [{ fileName: 'kept' }] });

    await service.writeJsonParameter(
      writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'b', completed: 'no', reports: [{ fileName: 'forged' }] }),
    );

    expect(api.putCalls[0]).toMatchObject({ data: { value: { assessment: 'b', completed: 'no', reports: [{ fileName: 'kept' }] } } });
  });

  it('lets the BFF override a server-owned value and write a locked document', async () => {
    const { api, service } = subject({ assessment: 'a', completed: 'yes', reports: [] });

    await service.writeJsonParameter({
      ...writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'a', completed: 'yes' }),
      internal: { serverOwnedOverrides: { reports: [{ fileName: 'new' }] }, allowLocked: true },
    });

    expect(api.putCalls[0]).toMatchObject({ data: { value: { assessment: 'a', completed: 'yes', reports: [{ fileName: 'new' }] } } });
  });

  it('writes what the BFF says a server-owned value is, also when that is false and the stored one was true', async () => {
    const factSchema = schema(DEFINITION.schemaName, SCHEMA_ID, {
      type: 'object',
      additionalProperties: false,
      properties: { assessment: { type: 'string' }, reportedMisconduct: { type: 'boolean', 'x-draken-server-owned': true } },
    });
    const { api, service } = makeSubject(
      [
        writableParentResponse(),
        response({ ...document(7), value: { assessment: 'a', reportedMisconduct: true } }, 200, '"7"'),
        response(factSchema, 200),
        writableParentResponse(),
        writableParentResponse(11),
      ],
      [response(document(8), 200, '"8"')],
    );

    await service.writeJsonParameter({
      ...writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'b', reportedMisconduct: true }),
      internal: { serverOwnedOverrides: { reportedMisconduct: false } },
    });

    expect(api.putCalls[0]).toMatchObject({ data: { value: { assessment: 'b', reportedMisconduct: false } } });
  });

  it('refuses every client write to a completed document except the unlock that changes nothing else', async () => {
    const locked = { assessment: 'a', completed: 'yes', reports: [] };

    await expect(
      subject(locked).service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'b', completed: 'yes' })),
    ).rejects.toMatchObject({
      status: 409,
      message: 'This investigation document is completed and locked; unlock it before changing it',
    });
    await expect(
      subject(locked).service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'b', completed: 'no' })),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Unlocking a completed investigation document may not change it',
    });

    const { api, service } = subject(locked);
    await service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'a', completed: 'no', reports: [] }));
    expect(api.putCalls[0]).toMatchObject({ data: { value: { assessment: 'a', completed: 'no', reports: [] } } });
  });

  it('cannot unlock and change the content of an unconfirmed publication', async () => {
    const { api, service } = subject({
      assessment: 'a',
      completed: 'yes',
      reports: [{ fileName: 'Report_1_f0000000-0000-4000-8000-000000000001.pdf' }],
    });
    await expect(service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'a', completed: 'no' }))).rejects.toMatchObject(
      { status: 409 },
    );
    expect(api.putCalls).toHaveLength(0);
  });

  it('leaves an unlocked document free to change, completion included', async () => {
    const { api, service } = subject({ assessment: 'a', completed: 'no' });

    await service.writeJsonParameter(writeRequest({ ifMatch: '"7"' }, SCHEMA_ID, { assessment: 'b', completed: 'yes' }));

    expect(api.putCalls[0]).toMatchObject({ data: { value: { assessment: 'b', completed: 'yes' } } });
  });
});
