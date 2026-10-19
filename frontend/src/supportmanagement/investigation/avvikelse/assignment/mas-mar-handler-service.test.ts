import assert from 'node:assert/strict';

import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { saveChangedErrandParameters } from '@supportmanagement/services/support-parameter-service';
import { beforeEach, test, vi } from 'vitest';

import { saveMasMarHandler } from './mas-mar-handler-service';

vi.mock('@supportmanagement/services/support-parameter-service', () => ({ saveChangedErrandParameters: vi.fn() }));

beforeEach(() => {
  vi.mocked(saveChangedErrandParameters).mockReset();
});

test('records the MAS/MAR handler in masMarHandler, on the parameters the errand has', async () => {
  const parameters = [{ key: 'masMarHandler', values: ['other.mas.mar'], version: 3 }];

  await saveMasMarHandler('2281', { id: 'errand-id', parameters } as unknown as SupportErrand, 'mas.mar');

  assert.deepEqual(vi.mocked(saveChangedErrandParameters).mock.calls, [
    ['2281', 'errand-id', parameters, [{ key: 'masMarHandler', displayName: 'MAS/MAR', values: ['mas.mar'] }]],
  ]);
});

test('an errand without an id records no MAS/MAR handler', async () => {
  await assert.rejects(saveMasMarHandler('2281', { parameters: [] } as unknown as SupportErrand, 'mas.mar'));
  assert.equal(vi.mocked(saveChangedErrandParameters).mock.calls.length, 0);
});
