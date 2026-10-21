import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  CLASSIFICATION_FACTS,
  LABEL_FACTS,
  seenSupportErrandFacts,
  takeSupportErrandFacts,
} from './support-errand-facts';

const seen = {
  title: 'seen-title',
  labels: 'seen-labels',
  routingLabels: 'seen-routing',
  classification: 'seen-class',
};
const received = {
  title: 'their-title',
  labels: 'new-labels',
  routingLabels: 'new-routing',
  classification: 'new-class',
};

test('sends the facts the errand was handed out with', () => {
  assert.equal(seenSupportErrandFacts({ facts: seen, status: 'ONGOING' }), seen);
});

test('refuses a command for an errand loaded without its facts', () => {
  assert.throws(() => seenSupportErrandFacts(undefined), /without its facts/u);
  assert.throws(() => seenSupportErrandFacts({ status: 'ONGOING' }), /without its facts/u);
});

// The page takes some fields from what its own write answered with; what it has seen follows those fields, and only
// them - a change somebody else made to a field the page still shows as it was is theirs to find out about.
test('takes the named facts from an own write and keeps the others as the handler saw them', () => {
  assert.deepEqual(takeSupportErrandFacts(seen, received, LABEL_FACTS), {
    title: 'seen-title',
    labels: 'new-labels',
    routingLabels: 'new-routing',
    classification: 'seen-class',
  });
  assert.deepEqual(takeSupportErrandFacts(seen, received, CLASSIFICATION_FACTS), {
    ...received,
    title: 'seen-title',
  });
});

test('keeps what was seen when there is nothing to take', () => {
  assert.equal(takeSupportErrandFacts(seen, undefined, LABEL_FACTS), seen);
  assert.equal(takeSupportErrandFacts(undefined, received, LABEL_FACTS), undefined);
  assert.deepEqual(takeSupportErrandFacts(seen, { title: 'their-title' }, LABEL_FACTS), seen);
});
