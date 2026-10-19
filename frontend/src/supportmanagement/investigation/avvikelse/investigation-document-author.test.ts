import assert from 'node:assert/strict';

import type { RJSFSchema } from '@rjsf/utils';
import { test } from 'vitest';

import { resolveInvestigationDocumentAuthor } from './investigation-document-author';
import assessmentRequest from './schemas/bedomning-sol-lss.schema-request.json';
import decisionRequest from './schemas/beslut-sol-lss.schema-request.json';

const decisionSchema = decisionRequest.value as RJSFSchema;
const writer = { name: 'Lena Lex', role: 'LEX-ansvarig' };

test('a saved decision is by whoever the server recorded, whoever looks at it', () => {
  const stored = { decisionMaker: { name: 'Johanna Wissing', role: 'LEX-ansvarig' } };

  const expected = {
    field: 'decisionMaker',
    title: 'Beslutsfattare',
    details: [
      { label: 'Namn', value: 'Johanna Wissing' },
      { label: 'Roll', value: 'LEX-ansvarig' },
    ],
  };
  assert.deepEqual(resolveInvestigationDocumentAuthor(decisionSchema, stored, writer), expected);
  assert.deepEqual(resolveInvestigationDocumentAuthor(decisionSchema, stored, undefined), expected);
});

test('a decision nobody has saved is shown as it will be recorded, to somebody who may write it', () => {
  assert.deepEqual(resolveInvestigationDocumentAuthor(decisionSchema, {}, writer)?.details, [
    { label: 'Namn', value: 'Lena Lex' },
    { label: 'Roll', value: 'LEX-ansvarig' },
  ]);
});

test('a decision nobody has saved is by nobody, for somebody who cannot write it', () => {
  assert.equal(resolveInvestigationDocumentAuthor(decisionSchema, {}, undefined), undefined);
});

test('a recorded author without a role is shown by name alone', () => {
  const stored = { decisionMaker: { name: 'Johanna Wissing' } };

  assert.deepEqual(resolveInvestigationDocumentAuthor(decisionSchema, stored, writer)?.details, [
    { label: 'Namn', value: 'Johanna Wissing' },
  ]);
});

test('a schema that records no author shows none', () => {
  const assessmentSchema = assessmentRequest.value as unknown as RJSFSchema;

  assert.equal(resolveInvestigationDocumentAuthor(assessmentSchema, {}, writer), undefined);
  assert.equal(resolveInvestigationDocumentAuthor({ type: 'object' }, { decisionMaker: writer }, writer), undefined);
});
