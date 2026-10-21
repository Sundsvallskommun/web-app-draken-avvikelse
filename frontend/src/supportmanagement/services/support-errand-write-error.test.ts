import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  isSupportErrandWriteConflict,
  SUPPORT_ERRAND_STATUS_AFTER_ASSIGNMENT_MESSAGE,
  SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE,
  SupportErrandStatusAfterAssignmentError,
  supportErrandWriteErrorMessage,
} from './support-errand-write-error';

test('treats the conditional-write rejections as conflicts', () => {
  for (const status of [409, 412]) {
    assert.equal(isSupportErrandWriteConflict({ response: { status } }), true);
  }
});

test('leaves every other failure to its own message', () => {
  for (const error of [
    undefined,
    null,
    new Error('Support errand was updated, but note could not be saved'),
    { response: { status: 400 } },
    { response: { status: 428 } },
    { response: { status: 500 } },
    { response: {} },
    { response: { status: '412' } },
    { status: 412 },
  ]) {
    assert.equal(isSupportErrandWriteConflict(error), false);
  }
});

test('replaces the message only for conflicts', () => {
  assert.equal(
    supportErrandWriteErrorMessage({ response: { status: 412 } }, 'fallback'),
    SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE
  );
  assert.equal(
    supportErrandWriteErrorMessage({ response: { status: 409 } }, 'fallback'),
    SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE
  );
  assert.equal(supportErrandWriteErrorMessage(new Error('boom'), 'fallback'), 'fallback');
});

// A 422 is the BFF refusing for a reason it can name - an errand whose measures are not all handled,
// for instance. Telling the handler to reload would be wrong: nothing changed under them.
test('shows what the BFF says when it refuses the write for a named reason', () => {
  const refusal = 'Ärendet kan inte avslutas förrän alla åtgärder är hanterade: 1 åtgärd väntar på beslut.';

  assert.equal(
    supportErrandWriteErrorMessage({ response: { status: 422, data: { message: refusal } } }, 'fallback'),
    refusal
  );
  // Without a message there is nothing better to show than the caller's own wording.
  assert.equal(supportErrandWriteErrorMessage({ response: { status: 422, data: {} } }, 'fallback'), 'fallback');
  assert.equal(
    supportErrandWriteErrorMessage({ response: { status: 422, data: { message: '  ' } } }, 'fallback'),
    'fallback'
  );
});

// The assignment landed, so "reload and redo the change" would be wrong advice however the status
// change failed - including when it failed with a conflict of its own.
test('says which half of taking an errand is missing', () => {
  for (const reason of [new Error('boom'), { response: { status: 409 } }, { response: { status: 400 } }]) {
    assert.equal(
      supportErrandWriteErrorMessage(new SupportErrandStatusAfterAssignmentError(reason), 'fallback'),
      SUPPORT_ERRAND_STATUS_AFTER_ASSIGNMENT_MESSAGE
    );
  }
});
