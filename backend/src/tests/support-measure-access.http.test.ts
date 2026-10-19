import axios, { type AxiosAdapter, AxiosError } from 'axios';
import express from 'express';
import { useExpressServer } from 'routing-controllers';
import request from 'supertest';

import { SupportMeasureController } from '@/controllers/supportmanagement/support-measure.controller';
import type { RequestWithUser } from '@/interfaces/auth.interface';
import errorMiddleware from '@/middlewares/error.middleware';
import ApiTokenService from '@/services/api-token.service';

import { mockUser } from './helpers/http';

vi.mock('@/middlewares/auth.middleware', () => ({ default: (_req: unknown, _res: unknown, next: () => void) => next() }));

const originalAdapter = axios.defaults.adapter;
afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
});

// Real controller, service and Axios error mapping. Only the upstream transport is replaced.
it.each(['errand', 'measure-list', 'measure', 'write'])('returns 403 for upstream 401 at %s without expiring the session', async denial => {
  vi.spyOn(ApiTokenService.prototype, 'getToken').mockResolvedValue('test-token');
  const adapter: AxiosAdapter = async config => {
    const isMeasure = config.url?.endsWith('/measures/measure-1');
    const isList = config.url?.endsWith('/measures');
    if (
      (denial === 'errand' && !isMeasure && !isList) ||
      (denial === 'measure-list' && isList) ||
      (denial === 'measure' && isMeasure) ||
      (denial === 'write' && config.method === 'patch')
    ) {
      throw new AxiosError('Denied', undefined, config, undefined, {
        config,
        data: { detail: 'Resource denied' },
        headers: {},
        status: 401,
        statusText: 'Unauthorized',
      });
    }
    const data = isMeasure ? { id: 'measure-1', version: 3, addedByUser: 'testuser' } : { id: 'errand-1', version: 2, status: 'ONGOING' };
    return { config, data, headers: {}, status: 200, statusText: 'OK' };
  };
  axios.defaults.adapter = adapter;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as RequestWithUser).user = mockUser({ username: 'testuser', permissions: { canEditSupportManagement: true } });
    next();
  });
  useExpressServer(app, { controllers: [SupportMeasureController], validation: false, defaultErrorHandler: false });
  app.use(errorMiddleware);
  const url = '/supporterrands/2281/errand-1/measures';
  const response =
    denial === 'measure-list' || denial === 'errand'
      ? await request(app).get(url)
      : await request(app).patch(`${url}/measure-1`).set('If-Match', '"3"').send({ description: 'Updated' });
  expect(response.status).toBe(403);
  expect(response.body.message).toBe('Resource denied');
  expect(response.headers.location).toBeUndefined();
  expect(response.headers['set-cookie']).toBeUndefined();
});
