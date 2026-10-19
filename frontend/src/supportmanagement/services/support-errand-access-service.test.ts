import assert from 'node:assert/strict';

import { beforeEach, test, vi } from 'vitest';

import { markLimitedSupportErrandAccess } from './support-errand-access-service';
import type { SupportErrand } from './support-errand-service';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@common/services/api-service', () => ({ apiService: { get } }));

const errand = { id: 'errand-1', errandNumber: 'VOF-26100016' } as SupportErrand;

beforeEach(() => get.mockReset());

test('marks an errand the user may only know of, which locks it', async () => {
  get.mockResolvedValue({ data: { level: 'LR' } });

  assert.deepEqual(await markLimitedSupportErrandAccess('2281', errand), { ...errand, limitedAccess: true });
  assert.equal(get.mock.calls[0][0], 'supporterrands/2281/errand-1/errand-access');
});

test('leaves an errand the user may read as it was read', async () => {
  get.mockResolvedValue({ data: { level: 'R' } });

  assert.equal(await markLimitedSupportErrandAccess('2281', errand), errand);
});

// Support Management refuses what the user may not do either way; a failed lookup costs a clearer page.
test('leaves the errand as it was read when the level cannot be had', async () => {
  // An answer without a body fails the lookup the way a refused request does, through the same catch.
  get.mockResolvedValue({});

  assert.equal(await markLimitedSupportErrandAccess('2281', errand), errand);
});

test('asks nothing for an errand that was never read', async () => {
  const missing = undefined as unknown as SupportErrand;

  assert.equal(await markLimitedSupportErrandAccess('2281', missing), missing);
  assert.equal(get.mock.calls.length, 0);
});
