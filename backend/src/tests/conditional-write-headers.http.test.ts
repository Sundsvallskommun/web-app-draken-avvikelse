// Conditional-write headers, exercised over a real HTTP request.
//
// This suite exists because of a bug that both other layers were structurally unable to see:
// the controller unit tests call handler methods directly, passing `ifMatch` as a plain
// argument, so routing-controllers' parameter binding never runs; and the Playwright specs
// mock every backend call in the browser, so the backend never runs at all. The defect lived
// exactly in the gap - `@HeaderParam('If-Match') ifMatch: string | undefined` reflects
// `design:type` as `Object`, which makes routing-controllers set `isTargetObject` and JSON.parse
// the header. `JSON.parse('"2"')` yields `2` without quotes, which then fails the strong-ETag
// pattern, and `JSON.parse('*')` throws outright. Every conditional write returned 400 in the
// browser while every unit test passed.
//
// So these tests must go through supertest. Asserting against the handler directly would
// reintroduce the blind spot.

import request from 'supertest';

const { apiGet, apiPatch, apiPut } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
}));

// Stubbed to a pass-through: the real one only asks passport whether the session is authenticated.
// `__esModule: true` keeps the SWC interop from handing `@UseBefore` the namespace object.
vi.mock('@/middlewares/auth.middleware', () => ({
  __esModule: true,
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('@/services/api.service', () => ({
  default: class {
    get = apiGet;
    patch = apiPatch;
    put = apiPut;
    post = vi.fn();
    delete = vi.fn();
  },
}));

describe('conditional-write headers (over HTTP)', () => {
  let server: import('express').Application;
  const errandId = 'f8f1c954-222d-469b-95a8-aa3747ce821f';
  const errandUrl = `/supporterrands/${errandId}`;

  beforeAll(async () => {
    const { default: express } = await import('express');
    const { useExpressServer } = await import('routing-controllers');
    const { default: errorMiddleware } = await import('@/middlewares/error.middleware');
    const { SupportErrandController } = await import('@/controllers/supportmanagement/support-errand.controller');
    const { SupportErrandJsonParameterController } = await import('@/controllers/supportmanagement/support-errand-json-parameter.controller');

    const app = express();
    app.use(express.json());
    // Production sets req.user from the passport session, before any route middleware runs.
    // Mirror that here rather than assigning it inside the auth stub, so the permission guard
    // sees a user regardless of the order routing-controllers applies @UseBefore middlewares in.
    app.use((req, _res, next) => {
      (req as any).user = {
        username: 'testuser',
        name: 'Test User',
        groups: [],
        permissions: { canEditSupportManagement: true },
      };
      next();
    });

    server = useExpressServer(app, {
      controllers: [SupportErrandController, SupportErrandJsonParameterController],
      validation: false,
      // Same as production: routing-controllers' own handler cannot read HttpException's status,
      // because the framework resets the prototype. The app's errorMiddleware duck-types it.
      defaultErrorHandler: false,
    });
    app.use(errorMiddleware);
    // Importing the controller graph pulls in the whole config/service tree, which is slow enough
    // to blow the default 10s hook budget on some machines.
  }, 60_000);

  beforeEach(() => {
    vi.clearAllMocks();
    // A current errand at version 2, with the ETag and body version agreeing.
    apiGet.mockResolvedValue({
      data: { id: errandId, status: 'ONGOING', version: 2 },
      headers: { etag: '"2"' },
    });
    apiPatch.mockResolvedValue({ data: { id: errandId, version: 3 } });
  });

  // An errand change is conditioned on what the handler saw of the fields it writes, sent in the body, and upstream
  // on the version the BFF read for that check - there is no errand If-Match to bind any more.
  const seenTitle = async (title: string) => {
    const { errandFacts } = await import('@/services/support-errand-facts');
    return { title: errandFacts({ id: errandId, title }).title };
  };

  it('writes a change of the fields the handler saw as they are, on the version just read', async () => {
    apiGet.mockResolvedValue({ data: { id: errandId, status: 'ONGOING', title: 'Titel', version: 2 }, headers: { etag: '"2"' } });

    const response = await request(server)
      .patch(errandUrl)
      .send({ title: 'Uppdaterad titel', seenFacts: await seenTitle('Titel') });

    expect(response.status).toBe(200);
    expect(apiPatch).toHaveBeenCalledTimes(1);
    expect(apiPatch.mock.calls[0][0]).toMatchObject({ data: { title: 'Uppdaterad titel' }, headers: { 'If-Match': '"2"' } });
  });

  it('refuses a change of a field somebody else changed since the handler saw it', async () => {
    apiGet.mockResolvedValue({ data: { id: errandId, status: 'ONGOING', title: 'Ändrad av någon annan', version: 3 }, headers: { etag: '"3"' } });

    const response = await request(server)
      .patch(errandUrl)
      .send({ title: 'Uppdaterad titel', seenFacts: await seenTitle('Titel') });

    expect(response.status).toBe(409);
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('demands what the handler saw of the fields a change writes', async () => {
    const response = await request(server).patch(errandUrl).send({ title: 'x', seenFacts: {} });

    expect(response.status).toBe(400);
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('does not try to JSON.parse the If-None-Match wildcard', async () => {
    const response = await request(server)
      .put(`${errandUrl}/json-parameters/utredning-enhetschef`)
      .set('If-None-Match', '*')
      .send({ schemaId: 'x', value: {} });

    // Whatever this endpoint decides about the key or the profile, the wildcard must reach the
    // handler intact rather than dying in parameter binding.
    expect(JSON.stringify(response.body)).not.toContain('cannot be parsed into JSON');
  });
});
