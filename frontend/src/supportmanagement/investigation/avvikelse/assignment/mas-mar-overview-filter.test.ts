import assert from 'node:assert/strict';

import { test } from 'vitest';

import { masMarOverviewFilter } from './mas-mar-overview-filter';

test('MAS/MAR-ärenden is offered to MAS/MAR alone', () => {
  assert.equal(masMarOverviewFilter.isOfferedTo({ roleKeys: ['mas-mar'] }), true);
  assert.equal(masMarOverviewFilter.isOfferedTo({ roleKeys: ['enhetschef', 'mas-mar'] }), true);
  assert.equal(masMarOverviewFilter.isOfferedTo({ roleKeys: [], superadmin: true }), false);
  assert.equal(masMarOverviewFilter.isOfferedTo({ roleKeys: ['verksamhetschef'] }), false);
  assert.equal(masMarOverviewFilter.isOfferedTo({}), false);
});

// The group and field are the BFF profile's `risk` label filter, which it validates the selection against.
test('MAS/MAR-ärenden selects the errands with a high HSL risk', () => {
  assert.equal(masMarOverviewFilter.label, 'MAS/MAR-ärenden');
  assert.deepEqual(masMarOverviewFilter.selection, {
    groupKey: 'risk',
    fieldKey: 'risk',
    resourcePath: 'RISK/HIGH_HSL',
  });
});
