import assert from 'node:assert/strict';

import { test } from 'vitest';

import { buildSupportErrandStatusTransitionRequest } from './support-errand-status-transition';

const facts = { status: 'status-fingerprint', activePhase: 'phase-fingerprint', title: 'title-fingerprint' };

test('builds a status command from what the handler saw of the errand', () => {
  assert.deepEqual(
    buildSupportErrandStatusTransitionRequest({ status: 'SUSPENDED', facts }, 'ONGOING', {
      suspension: { suspendedFrom: undefined, suspendedTo: undefined },
    }),
    {
      seenFacts: facts,
      status: 'ONGOING',
      suspension: { suspendedFrom: undefined, suspendedTo: undefined },
    }
  );
});

test('keeps resolution changes inside the explicit status command', () => {
  assert.deepEqual(buildSupportErrandStatusTransitionRequest({ facts }, 'SOLVED', { resolution: 'CLOSED' }), {
    seenFacts: facts,
    status: 'SOLVED',
    resolution: 'CLOSED',
  });
});

test('fails before sending a command when the errand was loaded without its facts', () => {
  assert.throws(() => buildSupportErrandStatusTransitionRequest({ status: 'ONGOING' }, 'SOLVED'), /facts/u);
  assert.throws(() => buildSupportErrandStatusTransitionRequest({ facts }, ''), /Target status/u);
});
