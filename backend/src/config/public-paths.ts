// Single source of truth for what may be reached without an authenticated session.
// Everything not listed here is denied by defaultAuthGuard.
//
// Adding an entry makes something publicly reachable - it must be a deliberate, reviewed
// change. The auth tests import these lists, so an entry added without intent shows up as
// a diff in the allow-list rather than as a silently open endpoint.
//
// The SAML endpoints and the bare `/health` liveness probe are plain express handlers
// mounted before the guard in app.ts, so they never reach it and need no entry here.

/**
 * Controller routes (relative to BASE_URL_PREFIX) reachable without authentication.
 *
 * Matched exactly, and validated against routing-controllers' metadata by
 * default-auth.metadata.test.ts - every entry must correspond to a real route that really
 * has no authMiddleware, so a stale entry cannot linger and grant more than it needs to.
 */
export const PUBLIC_PATHS: readonly string[] = ['/', '/health/up'];

/**
 * Non-controller express mounts reachable without authentication.
 *
 * Separate from PUBLIC_PATHS for two reasons: these are not routing-controllers routes, so
 * the metadata test cannot validate them, and they need prefix matching. Swagger UI serves
 * its own assets (swagger-ui.css, swagger-ui-bundle.js, ...) beneath /api-docs, so an exact
 * match would return the HTML shell and 401 every asset it references.
 *
 * Keep this list minimal - prefix matching grants a whole subtree.
 */
const PUBLIC_PATH_PREFIXES: readonly string[] = ['/api-docs', '/swagger.json'];

/** Strips a single trailing slash so '/health/up/' matches '/health/up'. Keeps a bare '/'. */
const normalizePath = (path: string): string => (path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path);

/**
 * True when the path may be served without an authenticated session.
 *
 * PUBLIC_PATHS is matched exactly on purpose: a prefix match on '/' would make the entire
 * API public, and a prefix match on any other entry could expose sibling routes that merely
 * share a leading path segment. PUBLIC_PATH_PREFIXES opts in to subtree matching, and only
 * on a segment boundary - '/api-docs' must not match '/api-docsomething'.
 */
export const isPublicPath = (path: string): boolean => {
  const normalized = normalizePath(path);

  if (PUBLIC_PATHS.includes(normalized)) {
    return true;
  }

  return PUBLIC_PATH_PREFIXES.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`));
};
