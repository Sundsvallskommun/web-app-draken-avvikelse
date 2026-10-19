import assert from 'node:assert/strict';

import { test } from 'vitest';

import { contactMeansCarriesAttachments } from './support-message-attachments';

test('a Katla message carries attachments like the other conversations', () => {
  for (const contactMeans of ['katla', 'draken', 'minasidor'] as const) {
    assert.equal(contactMeansCarriesAttachments(contactMeans), true, contactMeans);
  }
});

test('e-mail and the e-service web message carry attachments, SMS and no choice do not', () => {
  assert.equal(contactMeansCarriesAttachments('email'), true);
  assert.equal(contactMeansCarriesAttachments('webmessage'), true);
  assert.equal(contactMeansCarriesAttachments('sms'), false);
  assert.equal(contactMeansCarriesAttachments(undefined), false);
});
