import assert from 'node:assert/strict';

import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { test } from 'vitest';

import { awaitsPrerequisiteDocument } from './saved-investigation-document';

const decision = { key: 'beslut-sol-lss', prerequisiteDocumentKey: 'utredning-sol-lss' };
const errandHolding = (...keys: string[]) =>
  ({
    jsonParameters: keys.map((key) => ({ key, schemaId: `2281_${key}_1.0`, value: {} })),
  } as unknown as SupportErrand);

test('a decision waits for the investigation it answers until that is saved on the errand', () => {
  assert.equal(awaitsPrerequisiteDocument(errandHolding(), decision), true);
  assert.equal(awaitsPrerequisiteDocument(errandHolding('utredning-enhetschef'), decision), true);
  assert.equal(awaitsPrerequisiteDocument(undefined, decision), true);
  assert.equal(awaitsPrerequisiteDocument(errandHolding('utredning-sol-lss'), decision), false);
});

// B4. LEX hands the errand back, and the unit manager reads the decision without being allowed to read the lex
// Sarah investigation: the errand they are given does not carry it, and the decision is made all the same.
test('a decision that is saved waits for nothing, whether or not the reader sees what it answers', () => {
  assert.equal(awaitsPrerequisiteDocument(errandHolding('beslut-sol-lss'), decision), false);
  assert.equal(awaitsPrerequisiteDocument(errandHolding('utredning-sol-lss', 'beslut-sol-lss'), decision), false);
});

test('a document that answers no other never waits', () => {
  assert.equal(awaitsPrerequisiteDocument(errandHolding(), { key: 'utredning-enhetschef' }), false);
});
