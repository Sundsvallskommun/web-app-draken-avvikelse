import assert from 'node:assert/strict';

import dayjs from 'dayjs';
import { test } from 'vitest';

import { defaultUnitFollowUpPeriod, describeUnitFollowUpPeriod } from './unit-follow-up-period';

const today = dayjs('2026-05-24');

test('opens on the last twelve months, today included', () => {
  assert.deepEqual(defaultUnitFollowUpPeriod(today), { from: '2025-05-24', to: '2026-05-24' });
});

test('says the period is the last twelve months only while it is', () => {
  assert.equal(
    describeUnitFollowUpPeriod({ from: '2025-05-24', to: '2026-05-24' }, today),
    'Visar de senaste 12 månaderna (2025-05-24 – 2026-05-24)'
  );
  assert.equal(
    describeUnitFollowUpPeriod({ from: '2026-01-01', to: '2026-03-31' }, today),
    'Visar perioden 2026-01-01 – 2026-03-31'
  );
});
