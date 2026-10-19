import assert from 'node:assert/strict';

import { test } from 'vitest';

import { defaultSupportContactMeans } from './support-message-contact-means';

const none = { internalWebmessage: false, katla: false };

test('answers an e-service errand through Katla', () => {
  assert.equal(defaultSupportContactMeans({ ...none, katla: true }), 'katla');
});

test('keeps the web message where the form offers one', () => {
  assert.equal(defaultSupportContactMeans({ ...none, internalWebmessage: true, katla: true }), 'webmessage');
  assert.equal(defaultSupportContactMeans({ ...none, internalWebmessage: true }), 'webmessage');
});

test('starts every other errand on e-mail', () => {
  assert.equal(defaultSupportContactMeans(none), 'email');
});
