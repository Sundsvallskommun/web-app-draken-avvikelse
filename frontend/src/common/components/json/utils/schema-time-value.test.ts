import assert from 'node:assert/strict';

import dayjs from 'dayjs';
import { test } from 'vitest';

import { toSchemaTimeValue, toTimeInputValue } from './schema-time-value';

const browserOffset = () => dayjs().format('Z');

test('shows the time as written by katla-sm, offset and seconds dropped', () => {
  assert.equal(toTimeInputValue('10:57:00+02:00'), '10:57');
  assert.equal(toTimeInputValue('10:57:00Z'), '10:57');
  assert.equal(toTimeInputValue('10:57:00'), '10:57');
  assert.equal(toTimeInputValue('10:57'), '10:57');
});

test('shows an empty field for anything that is not a time', () => {
  assert.equal(toTimeInputValue(undefined), '');
  assert.equal(toTimeInputValue(null), '');
  assert.equal(toTimeInputValue(''), '');
  assert.equal(toTimeInputValue('kl. 10'), '');
});

test('completes a picked time to RFC 3339 full-time when the schema requires it', () => {
  assert.equal(toSchemaTimeValue('09:15', true), `09:15:00${browserOffset()}`);
  assert.equal(toSchemaTimeValue('09:15:30', true), `09:15:30${browserOffset()}`);
});

test('leaves a time that already carries an offset untouched', () => {
  assert.equal(toSchemaTimeValue('10:57:00+02:00', true), '10:57:00+02:00');
  assert.equal(toSchemaTimeValue('10:57:00Z', true), '10:57:00Z');
});

test('keeps the picked value as is when the schema has no time format', () => {
  assert.equal(toSchemaTimeValue('09:15', false), '09:15');
});

test('clears the value when the field is emptied', () => {
  assert.equal(toSchemaTimeValue('', true), undefined);
  assert.equal(toSchemaTimeValue('', false), undefined);
});
