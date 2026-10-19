import { NextFunction, Request, Response } from 'express';

import { currentRequestGroupId, REQUEST_GROUP_HEADER, requestGroupMiddleware, resolveRequestGroupId, runInRequestGroup } from '@/utils/request-group';

const BROWSER_GROUP_ID = '3f2b8c1e-5d4a-4c7b-9e2f-1a6d8b0c4e7a';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestWithGroupHeader = (value?: string): Request =>
  ({ header: (name: string) => (name === REQUEST_GROUP_HEADER ? value : undefined) }) as Request;

describe('request group', () => {
  it('keeps the group id the browser sent for its action', () => {
    expect(resolveRequestGroupId(BROWSER_GROUP_ID)).toBe(BROWSER_GROUP_ID);
  });

  it.each([undefined, '', 'not-a-uuid', `${BROWSER_GROUP_ID}; DROP`])('gives the request a group of its own for %s', incoming => {
    const resolved = resolveRequestGroupId(incoming);

    expect(resolved).toMatch(UUID);
    expect(resolved).not.toBe(incoming);
  });

  it('is undefined outside a request', () => {
    expect(currentRequestGroupId()).toBeUndefined();
  });

  it('carries the group through everything the request awaits', async () => {
    let seenAfterAwait: string | undefined;
    const next: NextFunction = () => {
      void (async () => {
        await Promise.resolve();
        seenAfterAwait = currentRequestGroupId();
      })();
    };

    requestGroupMiddleware(requestWithGroupHeader(BROWSER_GROUP_ID), {} as Response, next);
    await new Promise(resolve => setImmediate(resolve));

    expect(seenAfterAwait).toBe(BROWSER_GROUP_ID);
  });

  it('keeps concurrent requests in their own groups', async () => {
    const seen = await Promise.all(
      ['group-a', 'group-b'].map(groupId =>
        runInRequestGroup(groupId, async () => {
          await new Promise(resolve => setImmediate(resolve));
          return currentRequestGroupId();
        }),
      ),
    );

    expect(seen).toEqual(['group-a', 'group-b']);
  });
});
