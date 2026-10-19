import assert from 'node:assert/strict';

import { test } from 'vitest';

import { unitFollowUpHeading, unitFollowUpMenuLabel } from './unit-follow-up-scope';

test('names the entry for how much of the organisation the role follows up', () => {
  assert.equal(unitFollowUpMenuLabel({ roleKeys: ['enhetschef'] }), 'Enhet');
  assert.equal(unitFollowUpMenuLabel({ roleKeys: ['verksamhetschef'] }), 'Enheter');
  assert.equal(unitFollowUpMenuLabel({ roleKeys: ['lex-ansvarig'] }), 'Verksamhetsområde');
  assert.equal(unitFollowUpMenuLabel({ roleKeys: ['lex-utredare'] }), 'Verksamhetsområde');
  assert.equal(unitFollowUpMenuLabel({ roleKeys: ['mas-mar'] }), 'Verksamhetsområde');
});

test('an administrator follows up the whole area, and the widest of several roles wins', () => {
  assert.equal(unitFollowUpMenuLabel({ roleKeys: [], superadmin: true }), 'Verksamhetsområde');
  assert.equal(unitFollowUpMenuLabel({ roleKeys: ['enhetschef', 'verksamhetschef'] }), 'Enheter');
  assert.equal(unitFollowUpMenuLabel({ roleKeys: ['enhetschef', 'mas-mar'] }), 'Verksamhetsområde');
});

test('someone holding none of the roles keeps the name the follow-up always had', () => {
  assert.equal(unitFollowUpMenuLabel({}), 'Enheter');
  assert.equal(unitFollowUpMenuLabel({ roleKeys: ['handlaggare'] }), 'Enheter');
});

test("a unit manager's heading says units once the errands they reach span more than one", () => {
  assert.equal(unitFollowUpHeading({ roleKeys: ['enhetschef'] }, 1), 'Enhet');
  assert.equal(unitFollowUpHeading({ roleKeys: ['enhetschef'] }, 2), 'Enheter');
  assert.equal(unitFollowUpHeading({ roleKeys: ['lex-ansvarig'] }, 1), 'Verksamhetsområde');
  assert.equal(unitFollowUpHeading({ roleKeys: ['verksamhetschef'] }, 0), 'Enheter');
});
