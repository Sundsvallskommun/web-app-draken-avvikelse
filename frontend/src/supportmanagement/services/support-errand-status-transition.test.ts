import assert from 'node:assert/strict';

import { test } from 'vitest';

import { buildSupportErrandStatusTransitionRequest } from './support-errand-status-transition';

test('builds a status command with exact source status and version', () => {
  assert.deepEqual(
    buildSupportErrandStatusTransitionRequest({ status: 'SUSPENDED', version: 7 }, 'ONGOING', {
      suspension: { suspendedFrom: undefined, suspendedTo: undefined },
    }),
    {
      expectedVersion: 7,
      expectedStatus: 'SUSPENDED',
      status: 'ONGOING',
      suspension: { suspendedFrom: undefined, suspendedTo: undefined },
    }
  );
});

test('keeps resolution changes inside the explicit status command', () => {
  assert.deepEqual(
    buildSupportErrandStatusTransitionRequest({ status: 'ONGOING', version: 8 }, 'SOLVED', { resolution: 'CLOSED' }),
    {
      expectedVersion: 8,
      expectedStatus: 'ONGOING',
      status: 'SOLVED',
      resolution: 'CLOSED',
    }
  );
});

test('fails before sending a command when the fresh snapshot lacks concurrency state', () => {
  assert.throws(() => buildSupportErrandStatusTransitionRequest({ status: 'ONGOING' }, 'SOLVED'), /valid version/u);
  assert.throws(() => buildSupportErrandStatusTransitionRequest({ version: 2 }, 'SOLVED'), /current status/u);
  assert.throws(
    () => buildSupportErrandStatusTransitionRequest({ status: 'ONGOING', version: 2 }, ''),
    /Target status/u
  );
});
