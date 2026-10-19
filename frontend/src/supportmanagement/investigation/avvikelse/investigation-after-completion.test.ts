import assert from 'node:assert/strict';

import { test } from 'vitest';

import { investigationAfterCompletion } from './investigation-after-completion';

test('tells the unit manager to hand over to LEX-ansvarig only where a suspected misconduct is still to be handed over', () => {
  assert.equal(
    investigationAfterCompletion({ schemaName: 'utredning-enhetschef', needsLexAssignment: true }),
    'hand-over-to-lex-manager'
  );
  assert.equal(
    investigationAfterCompletion({ schemaName: 'utredning-enhetschef', needsLexAssignment: false }),
    'create-report'
  );
});

test('sends a finished LEX investigation on to LEX-ansvarig, and only saves the HSL investigation', () => {
  assert.equal(
    investigationAfterCompletion({ schemaName: 'utredning-sol-lss', needsLexAssignment: false }),
    'hand-over-to-lex-manager'
  );
  assert.equal(investigationAfterCompletion({ schemaName: 'utredning-hsl', needsLexAssignment: true }), 'save');
});
