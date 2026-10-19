import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

/**
 * Support Management groups the events one user action produces under one request group id, so a save
 * that writes the errand, a parameter and a note becomes one notification rather than three.
 */
export const REQUEST_GROUP_HEADER = 'X-Request-Group-Id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestGroupStorage = new AsyncLocalStorage<string>();

/**
 * The group id the browser sent for its action, when it is a UUID; otherwise a fresh one, so every
 * call made while handling a single BFF request still belongs to one group.
 */
export const resolveRequestGroupId = (incoming: unknown): string =>
  typeof incoming === 'string' && UUID_PATTERN.test(incoming) ? incoming : randomUUID();

/** The group id of the request being handled, or undefined outside one. */
export const currentRequestGroupId = (): string | undefined => requestGroupStorage.getStore();

/** Runs the rest of the request inside its group, so every upstream call it makes can carry the id. */
export const requestGroupMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  requestGroupStorage.run(resolveRequestGroupId(req.header(REQUEST_GROUP_HEADER)), next);
};

/** Runs `work` inside the given group; for tests and for work started outside an HTTP request. */
export const runInRequestGroup = <T>(requestGroupId: string, work: () => T): T => requestGroupStorage.run(requestGroupId, work);
