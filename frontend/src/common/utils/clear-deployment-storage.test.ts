import assert from 'node:assert/strict';

import { afterEach, beforeEach, test } from 'vitest';

import { clearDeploymentStorageOnLogout } from './clear-deployment-storage';

/** A browser storage held in memory, with the key order a real one gives. */
const memoryStorage = (entries: Record<string, string>) => {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    keys: () => [...values.keys()].sort(),
  };
};

const originalBasePath = process.env.NEXT_PUBLIC_BASEPATH;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BASEPATH = '/iaf';
});

afterEach(() => {
  // process.env turns an assigned undefined into the string "undefined".
  if (originalBasePath === undefined) delete process.env.NEXT_PUBLIC_BASEPATH;
  else process.env.NEXT_PUBLIC_BASEPATH = originalBasePath;
});

test("clears this deployment's stores and keeps the color scheme", () => {
  const local = memoryStorage({
    '/iaf-ui-settings': '{}',
    '/iaf-metadata-store': '{}',
    '/iaf-color-scheme': '{"state":{"colorScheme":"dark"}}',
  });

  clearDeploymentStorageOnLogout([local]);

  assert.deepEqual(local.keys(), ['/iaf-color-scheme']);
});

test("leaves another deployment's keys and the rest of the origin alone", () => {
  const local = memoryStorage({
    '/iaf-ui-settings': '{}',
    '/vof-ui-settings': '{}',
    '/vof-color-scheme': '{}',
    'draken:investigation-schema-lab:supportmanagement-labels': '{}',
  });

  clearDeploymentStorageOnLogout([local]);

  assert.deepEqual(local.keys(), [
    '/vof-color-scheme',
    '/vof-ui-settings',
    'draken:investigation-schema-lab:supportmanagement-labels',
  ]);
});

test("clears this deployment's session keys too", () => {
  const local = memoryStorage({ '/iaf-ui-settings': '{}' });
  const session = memoryStorage({
    '/iaf-investigation-report:errand-1:utredning-hsl': 'operation-1',
    '/vof-investigation-report:errand-2:utredning-hsl': 'operation-2',
  });

  clearDeploymentStorageOnLogout([local, session]);

  assert.deepEqual(local.keys(), []);
  assert.deepEqual(session.keys(), ['/vof-investigation-report:errand-2:utredning-hsl']);
});
