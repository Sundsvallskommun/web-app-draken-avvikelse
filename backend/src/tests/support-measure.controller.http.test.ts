// Measure write handlers, exercised over a real HTTP request.
//
// The service tests call the class directly and the Playwright specs mock the BFF in the browser,
// so neither could see that routing-controllers turns an undefined handler result into
// NotFoundError unless @OnUndefined names the status. That error carries `httpCode` rather than
// `status` and no message, which the app's errorMiddleware renders as "500 Something went wrong"
// after the upstream write had already succeeded.

import request from 'supertest';

import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';

import { mockUser } from './helpers/http';

const { apiGet, apiPatch, apiPost, apiPut } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('@/middlewares/auth.middleware', () => ({
  __esModule: true,
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('@/services/api.service', () => ({
  default: class {
    get = apiGet;
    patch = apiPatch;
    post = apiPost;
    delete = vi.fn();
    put = apiPut;
  },
}));

const handlerRoles = JSON.stringify([
  { key: 'enhetschef', label: 'Enhetschef', group: 'ad-manager', measures: { roleName: 'MANAGER', measureGroup: 'PREVENTIVE', decides: true } },
]);
const typeId = 'dd000000-0000-4000-8000-000000000100';
const metadata = {
  measureTypes: [{ id: typeId, name: 'EDUCATION', displayName: 'Utbildning', measureGroups: ['PREVENTIVE'] }],
  roles: [{ name: 'MANAGER', displayName: 'Enhetschef' }],
};
const errand = { id: 'errand-1', status: 'ONGOING', version: 2 };
const measure = {
  id: 'measure-1',
  type: 'EDUCATION',
  version: 3,
  goal: 'Mål',
  description: 'Beskrivning',
  addedByRole: 'MANAGER',
  addedByUser: 'testuser',
};

describe('measure write handlers (over HTTP)', () => {
  let server: import('express').Application;
  const measuresUrl = '/supporterrands/2281/errand-1/measures';

  beforeAll(async () => {
    process.env.HEALTHCAREDEVIATION_HANDLER_ROLES = handlerRoles;
    const { default: express } = await import('express');
    const { useExpressServer } = await import('routing-controllers');
    const { default: errorMiddleware } = await import('@/middlewares/error.middleware');
    const { SupportMeasureController } = await import('@/controllers/supportmanagement/support-measure.controller');

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as RequestWithUser).user = mockUser({
        username: 'testuser',
        name: 'Test User',
        groups: ['ad-manager'],
        permissions: { canEditSupportManagement: true },
      });
      next();
    });
    server = useExpressServer(app, { controllers: [SupportMeasureController], validation: false, defaultErrorHandler: false });
    app.use(errorMiddleware);
  }, 60_000);

  beforeEach(() => {
    vi.clearAllMocks();
    apiGet.mockImplementation(async (config: { url?: string }) => {
      if (config.url?.includes('/json-parameters/')) throw new HttpException(404, 'Not found');
      if (config.url?.endsWith('/metadata')) return { data: metadata };
      if (config.url?.endsWith('/measures/measure-1')) return { data: measure };
      return { data: errand, headers: { etag: '"2"' } };
    });
    apiPatch.mockResolvedValue({ data: { ...measure, version: 4 } });
    apiPost.mockResolvedValue({ data: undefined });
  });

  it('answers 204 after a successful create', async () => {
    const response = await request(server)
      .post(measuresUrl)
      .send({ type: 'EDUCATION', addedByRole: 'MANAGER', goal: 'Mål', description: 'Beskrivning', executed: '2026-09-08T12:00:00+02:00' });
    expect(response.status).toBe(204);
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('answers 204 after a successful update even though upstream returns the measure body', async () => {
    const response = await request(server).patch(`${measuresUrl}/measure-1`).set('If-Match', '"3"').send({ goal: 'Nytt mål' });
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });

  it('saves the follow-up on the measure through its dedicated endpoint and preserves a negative answer', async () => {
    const approved = { ...measure, accept: 'TRUE', plannedStart: '2026-09-08T00:00:00Z' };
    const answers = { desiredEffectAchieved: false, followUpDescription: 'Ingen förbättring.' };
    apiGet.mockImplementation(async (config: { url?: string }) => ({
      data: config.url?.endsWith('/measures/measure-1') ? approved : errand,
      status: 200,
    }));
    apiPatch.mockImplementation(async ({ data }: { data: Record<string, string> }) => ({ data: { ...approved, ...data, version: 4 } }));
    const response = await request(server).patch(`${measuresUrl}/measure-1/follow-up`).set('If-Match', '"3"').send(answers);
    expect(response.status).toBe(204);
    expect(apiPut).not.toHaveBeenCalled();
    expect(apiPatch).toHaveBeenCalledTimes(1);
    expect(apiPatch.mock.calls[0][0]).toMatchObject({
      url: expect.stringMatching(/\/measures\/measure-1$/),
      data: { executed: expect.any(String), result: 'NOT_COMPLETED', resultText: 'Ingen förbättring.', completedAt: expect.any(String) },
      headers: { 'If-Match': '"3"' },
    });
  });

  it.each([{ desiredEffectAchieved: undefined }, { followUpDescription: '  ' }, { goal: 'Nytt mål' }, { executed: '2026-09-11T12:00:00Z' }])(
    'rejects incomplete follow-up or attempts to change other fields: %j',
    async fields => {
      const response = await request(server)
        .patch(`${measuresUrl}/measure-1/follow-up`)
        .set('If-Match', '"3"')
        .send({ desiredEffectAchieved: true, followUpDescription: 'Utbildning genomförd.', ...fields });
      expect(response.status).toBe(400);
      expect(apiPatch).not.toHaveBeenCalled();
    },
  );

  it('moves the end date through its own endpoint and forwards nothing else', async () => {
    const approved = { ...measure, accept: 'TRUE', plannedStart: '2026-09-08T00:00:00Z', plannedComplete: '2026-09-30T00:00:00Z' };
    apiGet.mockImplementation(async (config: { url?: string }) => ({
      data: config.url?.endsWith('/measures/measure-1') ? approved : errand,
      status: 200,
    }));
    const response = await request(server)
      .patch(`${measuresUrl}/measure-1/planned-complete`)
      .set('If-Match', '"3"')
      .send({ plannedComplete: '2026-10-15T00:00:00Z' });
    expect(response.status).toBe(204);
    expect(apiPatch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        url: expect.stringMatching(/\/measures\/measure-1$/),
        data: { plannedComplete: '2026-10-15T00:00:00Z' },
        headers: { 'If-Match': '"3"' },
      }),
      expect.anything(),
    );
  });

  it('takes a rewritten description with the end date, and refuses an emptied one', async () => {
    const approved = { ...measure, accept: 'TRUE', plannedStart: '2026-09-08T00:00:00Z', plannedComplete: '2026-09-30T00:00:00Z' };
    apiGet.mockImplementation(async (config: { url?: string }) => ({
      data: config.url?.endsWith('/measures/measure-1') ? approved : errand,
      status: 200,
    }));
    const move = (description: string) =>
      request(server)
        .patch(`${measuresUrl}/measure-1/planned-complete`)
        .set('If-Match', '"3"')
        .send({ plannedComplete: '2026-10-15T00:00:00Z', description });

    expect((await move('   ')).status).toBe(400);
    expect(apiPatch).not.toHaveBeenCalled();

    expect((await move('Flyttas: föreläsaren är sjuk.')).status).toBe(204);
    expect(apiPatch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: { plannedComplete: '2026-10-15T00:00:00Z', description: 'Flyttas: föreläsaren är sjuk.' } }),
      expect.anything(),
    );
  });

  it.each([{}, { plannedComplete: 'snart' }, { plannedComplete: '2026-10-15T00:00:00Z', plannedStart: '2026-10-01T00:00:00Z' }])(
    'rejects a missing end date or one sent with other fields: %j',
    async body => {
      const response = await request(server).patch(`${measuresUrl}/measure-1/planned-complete`).set('If-Match', '"3"').send(body);
      expect(response.status).toBe(400);
      expect(apiPatch).not.toHaveBeenCalled();
    },
  );

  it('still reports a stale version as 412 with its message', async () => {
    const response = await request(server).patch(`${measuresUrl}/measure-1`).set('If-Match', '"2"').send({ goal: 'x' });
    expect(response.status).toBe(412);
    expect(response.body.message).toContain('If-Match');
    expect(apiPatch).not.toHaveBeenCalled();
  });

  // An approval, whole or in part, says when the measure runs; the proposal left that open.
  const approvalDates = { plannedStart: '2026-10-12T00:00:00+02:00', plannedComplete: '2026-11-30T00:00:00+01:00' };

  it('answers 204 after a decision and forwards only the decision fields', async () => {
    const response = await request(server)
      .patch(`${measuresUrl}/measure-1/decision`)
      .set('If-Match', '"3"')
      .send({ accept: 'REWORK', acceptMotivation: '  Genomför endast utbildningen.  ', ...approvalDates });
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(apiPatch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        data: { accept: 'REWORK', acceptMotivation: 'Genomför endast utbildningen.', ...approvalDates },
        headers: { 'If-Match': '"3"' },
      }),
      expect.objectContaining({ username: 'testuser' }),
    );
  });

  it.each([
    { accept: 'REWORK' },
    { accept: 'TRUE' },
    { accept: 'REWORK', acceptMotivation: 'Genomför endast utbildningen.' },
    { accept: 'FALSE', acceptMotivation: '  ' },
    { accept: 'TRUE', addedByUser: 'forged' },
    { accept: 'TRUE', goal: 'Changed proposal' },
    { accept: 'TRUE', addedByRole: 'MANAGER' },
  ])('rejects invalid decision bodies before contacting the API: %j', async body => {
    const response = await request(server).patch(`${measuresUrl}/measure-1/decision`).set('If-Match', '"3"').send(body);
    expect(response.status).toBe(400);
    expect(apiGet).not.toHaveBeenCalled();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('requires the measure ETag for a decision', async () => {
    const response = await request(server)
      .patch(`${measuresUrl}/measure-1/decision`)
      .send({ accept: 'TRUE', ...approvalDates });
    expect(response.status).toBe(428);
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('cannot bypass the decision route through an ordinary edit', async () => {
    const response = await request(server).patch(`${measuresUrl}/measure-1`).set('If-Match', '"3"').send({ accept: 'TRUE' });
    expect(response.status).toBe(400);
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it('serves the planned overview under its own prefix, so the segment is not read as an errand id', async () => {
    const planned = { ...measure, accept: 'TRUE', plannedComplete: '2026-10-01T00:00:00Z' };
    apiGet.mockImplementation(async (config: { url?: string }) => {
      if (config.url?.endsWith('/metadata')) return { data: metadata };
      if (config.url?.includes('/errands?')) {
        return { data: { content: [{ ...errand, errandNumber: 'VOF-2026-0001', title: 'Fallskada', measures: [planned, measure] }], last: true } };
      }
      throw new HttpException(404, `Unexpected read ${config.url}`);
    });
    const response = await request(server).get('/supportmeasures/2281/planned');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      // The errand's title is left out: the overview does not show it.
      measures: [{ ...planned, errand: { id: 'errand-1', errandNumber: 'VOF-2026-0001', status: 'ONGOING' } }],
      metadata,
      truncated: false,
    });
  });
});
