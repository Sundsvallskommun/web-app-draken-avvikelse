import assert from 'node:assert/strict';

import { beforeEach, test, vi } from 'vitest';

import { saveSupportAttachments } from './support-attachment-service';

/** The request group id of every upload axios was asked to send, in the order they were sent. */
const { sentGroupIds } = vi.hoisted(() => ({ sentGroupIds: [] as (string | undefined)[] }));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  const post = (_url: string, _data: unknown, config?: { headers?: Record<string, string> }) => {
    sentGroupIds.push(config?.headers?.['X-Request-Group-Id']);
    return Promise.resolve({ data: true });
  };
  return { ...actual, default: { ...actual.default, post } };
});
// Reading a file is the browser's work; here every file reads as the same few bytes.
vi.mock('@common/utils/toBase64', () => ({ toBase64: async () => Buffer.from('bilaga').toString('base64') }));
vi.mock('@common/components/file-upload/file-upload.component', () => ({ imageMimeTypes: [] }));

/** A file as the upload form holds it: the input's file list. */
const chosenFile = (name: string) => ({ file: [{ name, size: 6, type: 'text/plain' }] as unknown as File });

beforeEach(() => {
  sentGroupIds.length = 0;
});

// One request per file, and one notification for all of them: the upload is one action.
test('uploads several files in one request group', async () => {
  const results = await saveSupportAttachments('errand-1', '2281', [chosenFile('forsta.txt'), chosenFile('andra.txt')]);

  assert.deepEqual(
    results.map(({ status }) => status),
    ['fulfilled', 'fulfilled']
  );
  assert.equal(sentGroupIds.length, 2);
  assert.match(sentGroupIds[0] ?? '', /^[0-9a-f-]{36}$/u);
  assert.equal(new Set(sentGroupIds).size, 1);
});

test('gives the next upload a request group of its own', async () => {
  await saveSupportAttachments('errand-1', '2281', [chosenFile('forsta.txt')]);
  await saveSupportAttachments('errand-1', '2281', [chosenFile('andra.txt')]);

  const [first, second] = sentGroupIds;
  assert.ok(first && second);
  assert.notEqual(first, second);
});
