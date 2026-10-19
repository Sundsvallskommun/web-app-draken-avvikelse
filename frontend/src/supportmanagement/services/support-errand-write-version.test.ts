import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  assertSupportErrandUnchangedSinceSeen,
  isSoleSupportErrandVersionChange,
  isSupportErrandWriteConflict,
  latestKnownSupportErrandVersion,
  resolveOwnErrandWriteAdvance,
  SUPPORT_ERRAND_STATUS_AFTER_ASSIGNMENT_MESSAGE,
  SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE,
  SupportErrandChangedElsewhereError,
  SupportErrandStatusAfterAssignmentError,
  supportErrandWriteErrorMessage,
  toStrongSupportErrandETag,
} from './support-errand-write-version';

test('creates canonical strong ETags from valid support errand versions', () => {
  assert.equal(toStrongSupportErrandETag(0), '"0"');
  assert.equal(toStrongSupportErrandETag(7), '"7"');
  assert.equal(toStrongSupportErrandETag(Number.MAX_SAFE_INTEGER), `"${Number.MAX_SAFE_INTEGER}"`);
});

test('rejects absent or non-canonical support errand versions before a write', () => {
  for (const version of [
    undefined,
    null,
    '',
    '7',
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(() => toStrongSupportErrandETag(version), /valid support errand version/u);
  }
});

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

test('a read confirms the errand is the version last seen, and a change elsewhere is a conflict', () => {
  assert.doesNotThrow(() => assertSupportErrandUnchangedSinceSeen(4, 4));
  for (const [seen, current] of [
    [4, 5],
    [4, 3],
    [undefined, 4],
    [4, undefined],
  ]) {
    assert.throws(() => assertSupportErrandUnchangedSinceSeen(seen, current), SupportErrandChangedElsewhereError);
  }
  assert.equal(
    supportErrandWriteErrorMessage(new SupportErrandChangedElsewhereError(), 'fallback'),
    SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE
  );
});

test('only a sole child write can advance a partially loaded parent version', () => {
  assert.equal(isSoleSupportErrandVersionChange(3, 4), true);
  for (const [expected, received] of [
    [3, 3],
    [3, 5],
    [undefined, 1],
    [NaN, 2],
    [-1, 0],
    [3, '4'],
  ]) {
    assert.equal(isSoleSupportErrandVersionChange(expected, received), false);
  }
});

// Saving a completed investigation can also set the risk label: two writes, both the caller's own.
test('a save that made two errand writes advances the parent by exactly two', () => {
  assert.equal(isSoleSupportErrandVersionChange(3, 5, 2), true);
  assert.equal(isSoleSupportErrandVersionChange(3, 4, 2), false);
  assert.equal(isSoleSupportErrandVersionChange(3, 6, 2), false);
});

// A handover button can be pressed long after the page loaded: the store knows what every load saw, a
// readback after the document's own writes knows what those left, and the later of the two is current.
test('takes the later of the store version and the one read after own writes', () => {
  assert.equal(latestKnownSupportErrandVersion(7, 9), 9);
  assert.equal(latestKnownSupportErrandVersion(11, 9), 11);
  assert.equal(latestKnownSupportErrandVersion(7, undefined), 7);
  assert.equal(latestKnownSupportErrandVersion(undefined, 9), 9);
  assert.equal(latestKnownSupportErrandVersion(undefined, undefined), undefined);
  assert.equal(latestKnownSupportErrandVersion(-1, '8'), undefined);
});

// Resuming an errand, or adding an attachment, shows the errand's new version without resetting the form. The next
// document save must still move the errand on, or the classification after it is refused as somebody else's change.
test('an own write moves the errand on even when the form was left behind by an earlier refresh', () => {
  assert.deepEqual(resolveOwnErrandWriteAdvance({ errandVersion: 13, formVersion: 11 }, 13, 14), {
    errandVersion: 14,
    advancesErrand: true,
    advancesForm: false,
  });
});

test('an own write moves the form with the errand when the form was showing the same version', () => {
  assert.deepEqual(resolveOwnErrandWriteAdvance({ errandVersion: 13, formVersion: 13 }, 13, 15, 2), {
    errandVersion: 15,
    advancesErrand: true,
    advancesForm: true,
  });
});

test('a move beyond the own writes, or from another version than the errand is known at, moves nothing', () => {
  const unmoved = { errandVersion: 13, advancesErrand: false, advancesForm: false };
  assert.deepEqual(resolveOwnErrandWriteAdvance({ errandVersion: 13, formVersion: 13 }, 13, 15), unmoved);
  // The errand is already known further on than the write started from; it is never moved back.
  assert.deepEqual(resolveOwnErrandWriteAdvance({ errandVersion: 14, formVersion: 13 }, 13, 14), unmoved);
  assert.deepEqual(resolveOwnErrandWriteAdvance({ errandVersion: undefined, formVersion: undefined }, undefined, 1), {
    errandVersion: undefined,
    advancesErrand: false,
    advancesForm: false,
  });
});
