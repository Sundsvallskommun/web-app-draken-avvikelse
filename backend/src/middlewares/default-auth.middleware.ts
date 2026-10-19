import authMiddleware from '@middlewares/auth.middleware';
import { NextFunction, Request, Response } from 'express';

import { isPublicPath } from '@/config/public-paths';

/**
 * App-level default-deny authentication.
 *
 * Mounted once in app.ts before the routing-controllers routes are registered, so every
 * route is authenticated unless its path is on the PUBLIC_PATHS allow-list. This inverts
 * the previous per-controller `@UseBefore(authMiddleware)` model, where a forgotten
 * decorator silently produced an unauthenticated endpoint.
 *
 * The guard deliberately does no metadata introspection - it runs in the HTTP layer on
 * every request, so there is no detection step that can quietly stop working and leave a
 * route open. A mistake here makes a public route require auth (visible, harmless), never
 * the reverse.
 *
 * Authorization stays where it is: `hasPermissions`/`hasRoles` remain per route, since
 * this guard only answers "is there a logged-in user", not "may they do this".
 */
const defaultAuthGuard = (req: Request, res: Response, next: NextFunction) => {
  // CORS preflight carries no cookies, so authenticating it would 401 the preflight and
  // break the real request that follows.
  if (req.method === 'OPTIONS') {
    return next();
  }

  if (isPublicPath(req.path)) {
    return next();
  }

  return authMiddleware(req, res, next);
};

export default defaultAuthGuard;
