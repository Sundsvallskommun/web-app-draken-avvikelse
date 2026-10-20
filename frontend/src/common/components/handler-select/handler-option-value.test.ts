import assert from 'node:assert/strict';

import type { Admin } from '@common/services/user-service';
import { test } from 'vitest';

import {
  findHandlerForOption,
  handlerOptionValue,
  optionValueForHandler,
  parseHandlerOptionValue,
} from './handler-option-value';

const handler = (overrides: Partial<Admin>): Admin => ({
  displayName: 'Nora Chef',
  firstName: 'Nora',
  lastName: 'Chef',
  adAccount: 'nora.chef',
  id: 'nora',
  roleKeys: [],
  ...overrides,
});

// Waiting for the handover to LEX, a manager who is also LEX-ansvarig is offered twice: as a manager, and as the
// handover.
const asManager = handler({ roleKeys: ['verksamhetschef'] });
const asLexManager = handler({ roleKeys: ['lex-ansvarig'], handoverStep: 'assign-lex' });
const roles = [
  { key: 'verksamhetschef', label: 'Verksamhetschef' },
  { key: 'lex-ansvarig', label: 'LEX-ansvarig' },
];

test('names the role and the account, and reads them back', () => {
  const value = handlerOptionValue('lex-ansvarig', 'nora.chef');

  assert.deepEqual(parseHandlerOptionValue(value), { roleKey: 'lex-ansvarig', adAccount: 'nora.chef' });
  assert.equal(parseHandlerOptionValue('Nora Chef'), undefined);
  assert.equal(parseHandlerOptionValue(':nora.chef'), undefined);
  assert.equal(parseHandlerOptionValue(undefined), undefined);
});

test('tells the same person under two headings apart', () => {
  const offered = [asManager, asLexManager];

  assert.equal(findHandlerForOption(offered, handlerOptionValue('verksamhetschef', 'nora.chef')), asManager);
  assert.equal(findHandlerForOption(offered, handlerOptionValue('lex-ansvarig', 'NORA.CHEF')), asLexManager);
  assert.equal(findHandlerForOption(offered, handlerOptionValue('lex-utredare', 'nora.chef')), undefined);
  assert.equal(findHandlerForOption(offered, 'Nora Chef'), undefined);
});

test('shows the handler who has the errand under their first heading that is not a handover', () => {
  assert.equal(
    optionValueForHandler([asLexManager, asManager], roles, 'Nora.Chef'),
    handlerOptionValue('verksamhetschef', 'nora.chef')
  );
  assert.equal(
    optionValueForHandler([handler({ roleKeys: ['lex-ansvarig', 'verksamhetschef'] })], roles, 'nora.chef'),
    handlerOptionValue('verksamhetschef', 'nora.chef')
  );
  assert.equal(optionValueForHandler([asManager], roles, 'someone.else'), undefined);
});
