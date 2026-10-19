import assert from 'node:assert/strict';

import dayjs from 'dayjs';
import { test } from 'vitest';

import { describeLexTransfer, findLexTransferAction } from './lex-transfer';

// Built from local time, so the expected text does not depend on the machine's time zone.
const executeAfter = dayjs('2026-09-21 11:30').toISOString();
const when = '2026-09-21 kl. 11:30';
const before = (hours: number) => new Date(dayjs('2026-09-21 11:30').subtract(hours, 'hour').valueOf());

const action = {
  actionConfigId: 'config-id',
  actionName: 'ADD_LABEL',
  displayValue: 'Missförhållande flyttas automatiskt till LEX',
  executeAfter,
  id: 'action-id',
};

test('finds the scheduled move to LEX only when it carries a readable time', () => {
  assert.equal(findLexTransferAction([{ actionName: 'OTHER', executeAfter }, action]), action);
  assert.equal(findLexTransferAction([{ ...action, executeAfter: undefined }]), undefined);
  assert.equal(findLexTransferAction([{ ...action, executeAfter: 'not a time' }]), undefined);
  assert.equal(findLexTransferAction(undefined), undefined);
});

test('counts whole days while at least a day remains', () => {
  assert.equal(
    describeLexTransfer(executeAfter, before(24 * 5 + 3)),
    `Ärendet skickas till en LEX-ansvarig om 5 dagar, ${when}.`
  );
  assert.equal(
    describeLexTransfer(executeAfter, before(24)),
    `Ärendet skickas till en LEX-ansvarig om 1 dag, ${when}.`
  );
});

test('counts hours on the last day, rounding up so it never reads as zero', () => {
  assert.equal(
    describeLexTransfer(executeAfter, before(5)),
    `Ärendet skickas till en LEX-ansvarig om 5 timmar, ${when}.`
  );
  assert.equal(
    describeLexTransfer(executeAfter, before(0.25)),
    `Ärendet skickas till en LEX-ansvarig om 1 timme, ${when}.`
  );
});

test('says the move is imminent once its time has passed', () => {
  assert.equal(
    describeLexTransfer(executeAfter, before(-1)),
    `Ärendet skulle skickas till en LEX-ansvarig ${when} och skickas inom kort.`
  );
});
