// Shared route enumeration for the default-deny auth tests.
//
// Both the metadata test and the runtime test build their expectations from this single
// walk of routing-controllers' metadata, so the two can never disagree about which routes
// exist or which of them declare authMiddleware.

import { getMetadataArgsStorage } from 'routing-controllers';

import { CONTROLLERS } from '@/controllers';
import authMiddleware from '@/middlewares/auth.middleware';

export interface RegisteredRoute {
  controllerName: string;
  handlerName: string;
  /** Lowercase express verb, e.g. 'get' | 'post'. */
  httpMethod: string;
  /** Route path as declared, may contain ':param' segments. */
  path: string;
  hasAuthMiddleware: boolean;
}

/** Joins a controller-level prefix with an action route. Controllers here use a bare
 *  `@Controller()`, so the prefix is normally empty, but handle it for future use. */
const buildPath = (controllerRoute: unknown, actionRoute: unknown): string => {
  const prefix = typeof controllerRoute === 'string' ? controllerRoute : '';
  const route = typeof actionRoute === 'string' ? actionRoute : String(actionRoute ?? '');
  return `${prefix}${route}` || '/';
};

/**
 * Every route registered by the controllers the app actually mounts.
 *
 * Middleware is matched by reference (`use.middleware === authMiddleware`) rather than by
 * reading decorator source text: @UseBefore is applied both at class and method level, and
 * both alone and alongside hasPermissions()/validationMiddleware(), so text matching would
 * produce false negatives.
 */
export const collectRegisteredRoutes = (): RegisteredRoute[] => {
  const storage = getMetadataArgsStorage();
  const mounted = new Set<unknown>(CONTROLLERS);
  const controllerRouteByTarget = new Map<unknown, unknown>(storage.controllers.map(controller => [controller.target, controller.route]));

  return storage.actions
    .filter(action => mounted.has(action.target))
    .map(action => ({
      controllerName: (action.target as { name?: string }).name ?? 'unknown',
      handlerName: String(action.method),
      httpMethod: String(action.type).toLowerCase(),
      path: buildPath(controllerRouteByTarget.get(action.target), action.route),
      // Method-level @UseBefore on this action, or a class-level one covering all actions.
      hasAuthMiddleware: storage.uses.some(
        use => use.target === action.target && (use.method === undefined || use.method === action.method) && use.middleware === authMiddleware,
      ),
    }));
};

/** Replaces ':param' segments with a concrete value so express can match the route. */
export const toConcretePath = (path: string): string => path.replace(/:[^/]+/g, '1');
