import assert from 'node:assert/strict';

import { test } from 'vitest';

import { initialRegistrationLocationId, registrationLocationIsFixed } from './support-errand-registration-location';

const place = (labelId: string) => ({ labelId, displayName: labelId, resourcePath: `LOCATION/${labelId}` });
const options = (locationSource: 'employment' | 'access' | undefined, ...labelIds: string[]) => ({
  reportTypes: [],
  priorities: [],
  locations: labelIds.map(place),
  ...(locationSource ? { locationSource } : {}),
});

test('starts at the main employment, and asks nothing when there is only that one place', () => {
  assert.equal(initialRegistrationLocationId(options('employment', 'main', 'second')), 'main');
  assert.equal(registrationLocationIsFixed(options('employment', 'main')), true);
  assert.equal(registrationLocationIsFixed(options('employment', 'main', 'second')), false);
});

test('starts at the only configured place, and leaves several for the handler to choose among', () => {
  assert.equal(initialRegistrationLocationId(options('access', 'unit')), 'unit');
  assert.equal(initialRegistrationLocationId(options(undefined, 'unit')), 'unit');
  assert.equal(initialRegistrationLocationId(options('access', 'unit', 'other')), '');
  // Still a choice, so the handler sees which place it is and can search for another account's places.
  assert.equal(registrationLocationIsFixed(options('access', 'unit')), false);
  assert.equal(initialRegistrationLocationId(options('employment')), '');
});
