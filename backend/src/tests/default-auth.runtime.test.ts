// Runtime guard for the default-deny auth model.
//
// Boots the real App (same middleware order as production, in-memory session store) and
// sends an unauthenticated request to every registered route. Everything must answer 401
// except the PUBLIC_PATHS allow-list.
//
// This is the assertion that actually matters: it proves the app-level guard denies by
// default, independently of what any decorator claims. The metadata test covers declared
// intent; this one covers behaviour.

import session from 'express-session';
import request from 'supertest';

import { BASE_URL_PREFIX } from '@/config';
import { PUBLIC_PATHS } from '@/config/public-paths';

import { collectRegisteredRoutes, toConcretePath } from './helpers/routes';

// Controllers construct an ApiService at module load and handlers call out over the network.
// No authenticated route should reach its handler, but stub the transport so a regression
// fails as a 200 instead of hanging on DNS.
vi.mock('@/services/api.service', () => {
  const stub = vi.fn(async () => ({ data: {} }));
  return {
    default: class {
      get = stub;
      post = stub;
      patch = stub;
      put = stub;
      delete = stub;
    },
  };
});

describe('default-deny auth (runtime)', () => {
  let server: import('express').Application;

  // Importing the whole app is slow on a loaded machine; the default hook timeout skips the suite there.
  beforeAll(async () => {
    const { default: App } = await import('@/app');
    const { CONTROLLERS } = await import('@/controllers');

    server = new App(CONTROLLERS, new session.MemoryStore()).getServer();
  }, 60_000);

  const routes = collectRegisteredRoutes();
  const protectedRoutes = routes.filter(route => !PUBLIC_PATHS.includes(route.path));
  const publicRoutes = routes.filter(route => PUBLIC_PATHS.includes(route.path));

  const send = (httpMethod: string, path: string) => {
    const url = `${BASE_URL_PREFIX}${toConcretePath(path)}`;
    return (request(server) as unknown as Record<string, (u: string) => request.Test>)[httpMethod](url);
  };

  it('enumerates the routes it is about to probe', () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
    expect(publicRoutes.length).toBe(PUBLIC_PATHS.length);
  });

  it.each(protectedRoutes.map(route => [`${route.httpMethod.toUpperCase()} ${route.path}`, route]))(
    'denies %s without a session',
    async (_label, route) => {
      const response = await send(route.httpMethod, route.path);
      expect(response.status).toBe(401);
    },
  );

  it.each(publicRoutes.map(route => [`${route.httpMethod.toUpperCase()} ${route.path}`, route]))(
    'allows %s without a session',
    async (_label, route) => {
      const response = await send(route.httpMethod, route.path);
      expect(response.status).not.toBe(401);
    },
  );

  it('lets CORS preflight through so the real request is not blocked', async () => {
    const target = protectedRoutes[0];
    const response = await send('options', target.path);

    expect(response.status).not.toBe(401);
  });

  it('denies an unknown path under the prefix rather than falling through', async () => {
    const response = await request(server).get(`${BASE_URL_PREFIX}/definitely-not-a-route`);

    expect(response.status).toBe(401);
  });
});
