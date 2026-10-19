import assert from 'node:assert/strict';

import { beforeEach, test, vi } from 'vitest';

import { handlerManagesStakeholderRole } from './support-contact-handler-managed-roles';

const variant = vi.hoisted(() => ({ managedRoles: undefined as readonly string[] | undefined }));
vi.mock('@supportmanagement/investigation/investigation-variant-registry', () => ({
  getInvestigationHandlerManagedStakeholderRoles: () => variant.managedRoles,
}));

beforeEach(() => {
  variant.managedRoles = undefined;
});

test('a variant with no say in it leaves the handler adding and removing every role', () => {
  for (const role of ['PRIMARY', 'CONTACT', 'REPORTER', undefined]) {
    assert.equal(handlerManagesStakeholderRole(role), true);
  }
});

// IAF/VOF: the handler looks up and removes the brukare alone; the other parties stay as the report brought them.
test('a variant that names its roles lets the handler add and remove those alone', () => {
  variant.managedRoles = ['PRIMARY'];

  assert.equal(handlerManagesStakeholderRole('PRIMARY'), true);
  assert.equal(handlerManagesStakeholderRole('CONTACT'), false);
  assert.equal(handlerManagesStakeholderRole('REPORTER'), false);
  assert.equal(handlerManagesStakeholderRole(undefined), false);
});
