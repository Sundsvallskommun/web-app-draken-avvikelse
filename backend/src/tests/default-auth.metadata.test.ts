// Source-level guard for the default-deny auth model.
//
// Walks every route routing-controllers has registered and asserts that it either declares
// authMiddleware or is on the PUBLIC_PATHS allow-list. This catches a new unauthenticated
// route at the point it is added, without booting the app.
//
// This test is about declared intent. The runtime counterpart
// (default-auth.runtime.test.ts) proves the app-level guard actually denies these requests.

import { PUBLIC_PATHS } from '@/config/public-paths';
import { CONTROLLERS } from '@/controllers';

import { collectRegisteredRoutes } from './helpers/routes';

describe('default-deny auth (metadata)', () => {
  const routes = collectRegisteredRoutes();

  it('registers routes for every mounted controller', () => {
    expect(routes.length).toBeGreaterThan(0);

    const controllersWithRoutes = new Set(routes.map(route => route.controllerName));
    expect(controllersWithRoutes.size).toBe(CONTROLLERS.length);
  });

  it('has no route that is both unauthenticated and missing from the allow-list', () => {
    const unguarded = routes
      .filter(route => !route.hasAuthMiddleware && !PUBLIC_PATHS.includes(route.path))
      .map(route => `${route.httpMethod.toUpperCase()} ${route.path} (${route.controllerName}.${route.handlerName})`);

    // The app-level guard already denies these at runtime, so a failure here does not mean
    // the route is exposed - it means the route is unauthenticated by design without being
    // declared as such. Add authMiddleware, or add the path to PUBLIC_PATHS deliberately.
    expect(unguarded).toEqual([]);
  });

  it('keeps the allow-list to routes that really exist and really are unauthenticated', () => {
    // A stale entry (route deleted, or since given auth) must be removed, so the allow-list
    // never grants more than it needs to.
    const declaredButNotFound = PUBLIC_PATHS.filter(path => !routes.some(route => route.path === path));
    expect(declaredButNotFound).toEqual([]);

    const declaredButAuthenticated = routes.filter(route => PUBLIC_PATHS.includes(route.path) && route.hasAuthMiddleware).map(route => route.path);
    expect(declaredButAuthenticated).toEqual([]);
  });

  it('pins the set of unauthenticated routes', () => {
    // Snapshot-style assertion: widening the public surface must show up as an explicit
    // diff here, reviewed on its own merits.
    const publicSurface = routes
      .filter(route => !route.hasAuthMiddleware)
      .map(route => `${route.httpMethod.toUpperCase()} ${route.path}`)
      .sort();

    expect(publicSurface).toEqual(['GET /', 'GET /health/up']);
  });
});
