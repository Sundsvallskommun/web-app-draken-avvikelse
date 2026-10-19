import assert from 'node:assert/strict';

import { beforeEach, test, vi } from 'vitest';

import { apiService, withRequestGroup } from './api-service';

type SentHeaders = Record<string, string> | undefined;

/** The headers of every request axios was asked to send, in the order they were sent. */
const { sentHeaders } = vi.hoisted(() => ({ sentHeaders: [] as SentHeaders[] }));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  const withoutBody = (_url: string, config?: { headers?: SentHeaders }) => {
    sentHeaders.push(config?.headers);
    return Promise.resolve({ data: {} });
  };
  const withBody = (_url: string, _data: unknown, config?: { headers?: SentHeaders }) => withoutBody(_url, config);
  return {
    ...actual,
    default: {
      ...actual.default,
      get: withoutBody,
      delete: withoutBody,
      post: withBody,
      patch: withBody,
      put: withBody,
    },
  };
});

const groupIdsSent = (): (string | undefined)[] => sentHeaders.map((headers) => headers?.['X-Request-Group-Id']);

beforeEach(() => {
  sentHeaders.length = 0;
});

test('sends every request of one action with the same group id', async () => {
  await withRequestGroup(async () => {
    await apiService.patch('supporterrands/2281/errand-1', {});
    await apiService.put('supporterrands/2281/errand-1/parameters/street', { values: [] });
    await apiService.deleteRequest('supportsubscriptions/2281/subscription-1');
  });

  const groupIds = groupIdsSent();
  assert.equal(groupIds.length, 3);
  assert.ok(groupIds[0]);
  assert.equal(new Set(groupIds).size, 1);
});

test('gives the next action a group of its own, and sends none outside an action', async () => {
  await withRequestGroup(() => apiService.patch('supporterrands/2281/errand-1', {}));
  await withRequestGroup(() => apiService.patch('supporterrands/2281/errand-1', {}));
  await apiService.get('supporterrands/2281/errand-1');

  const [first, second, outside] = groupIdsSent();
  assert.ok(first && second);
  assert.notEqual(first, second);
  assert.equal(outside, undefined);
});

test('lets an action started inside another join it, and ends the group when the action fails', async () => {
  await withRequestGroup(async () => {
    await apiService.patch('supporterrands/2281/errand-1', {});
    await withRequestGroup(() => apiService.put('supporterrands/2281/errand-1/parameters/street', { values: [] }));
  });
  await assert.rejects(withRequestGroup(() => Promise.reject(new Error('save failed'))));
  await apiService.get('supporterrands/2281/errand-1');

  const [outer, nested, afterFailure] = groupIdsSent();
  assert.equal(nested, outer);
  assert.equal(afterFailure, undefined);
});
