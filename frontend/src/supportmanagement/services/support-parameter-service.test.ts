import assert from 'node:assert/strict';

import { withRequestGroup } from '@common/services/api-service';
import { beforeEach, test, vi } from 'vitest';

import { saveChangedErrandParameters } from './support-parameter-service';

interface SentWrite {
  readonly url: string;
  readonly headers: Record<string, string> | undefined;
}

/** Every parameter write axios was asked to send, in the order they were sent. */
const { sentWrites } = vi.hoisted(() => ({ sentWrites: [] as SentWrite[] }));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  const put = (url: string, _data: unknown, config?: { headers?: Record<string, string> }) => {
    sentWrites.push({ url, headers: config?.headers });
    return Promise.resolve({ data: {} });
  };
  return { ...actual, default: { ...actual.default, put } };
});

const current = [
  { key: 'street', values: ['Storgatan 1'], version: 3 },
  { key: 'districtname', values: ['Centrum'], version: 5 },
  { key: 'propertyDesignation', values: ['BALDER 1'], version: 2 },
];

const writtenKeys = (): string[] => sentWrites.map(({ url }) => decodeURIComponent(url.split('/parameters/')[1]));
const groupIdsSent = (): (string | undefined)[] => sentWrites.map(({ headers }) => headers?.['X-Request-Group-Id']);

beforeEach(() => {
  sentWrites.length = 0;
});

// One request per changed parameter, and one notification for all of them: they are one action.
test('writes the changed parameters, each on its own version, in one request group', async () => {
  await saveChangedErrandParameters('2281', 'errand-1', current, [
    { key: 'street', values: ['Storgatan 2'] },
    { key: 'districtname', values: ['Centrum'] },
    { key: 'propertyDesignation', values: ['BALDER 2'] },
    { key: 'masMarHandler', values: ['handler'] },
  ]);

  // The unchanged one is not rewritten.
  assert.deepEqual(writtenKeys(), ['street', 'propertyDesignation', 'masMarHandler']);
  assert.deepEqual(
    sentWrites.map(({ headers }) => headers?.['If-Match'] ?? headers?.['If-None-Match']),
    ['"3"', '"2"', '*']
  );
  const groupIds = groupIdsSent();
  assert.match(groupIds[0] ?? '', /^[0-9a-f-]{36}$/u);
  assert.equal(new Set(groupIds).size, 1);
});

test('gives the next save a request group of its own', async () => {
  await saveChangedErrandParameters('2281', 'errand-1', current, [{ key: 'street', values: ['Storgatan 2'] }]);
  await saveChangedErrandParameters('2281', 'errand-1', current, [{ key: 'street', values: ['Storgatan 3'] }]);

  const [first, second] = groupIdsSent();
  assert.ok(first && second);
  assert.notEqual(first, second);
});

// Spara ärende saves the errand's fields, its parameters and its documents in one group; the parameters join it.
test('joins the request group of the action it is part of', async () => {
  await withRequestGroup(async () => {
    await saveChangedErrandParameters('2281', 'errand-1', current, [{ key: 'street', values: ['Storgatan 2'] }]);
    await saveChangedErrandParameters('2281', 'errand-1', current, [{ key: 'districtname', values: ['Haga'] }]);
  });

  const groupIds = groupIdsSent();
  assert.equal(groupIds.length, 2);
  assert.ok(groupIds[0]);
  assert.equal(new Set(groupIds).size, 1);
});
