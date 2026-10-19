import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import {
  findPlaceEmploymentMatch,
  findPlaceNode,
  getEmploymentPrefillNode,
  getFacilityPlaceInfo,
  getPlaceNodes,
} from './place-structure';

const label = (id: string, displayName: string, labels: Label[] = []): Label => ({
  id,
  classification: 'PLACE',
  displayName,
  resourceName: id,
  resourcePath: `PLACE/${id}`,
  labels,
});

const employmentPlace = label('employment', 'Employment place', [label('department', 'Department')]);
const otherPlace = label('other', 'Other place');
const placeNodes = getPlaceNodes([
  {
    id: 'place-root',
    classification: 'PLACE-ROOT',
    displayName: 'Platsstruktur',
    resourceName: 'platsstruktur',
    resourcePath: 'PLACE',
    labels: [employmentPlace, otherPlace],
  },
]);

const manager = { personId: 'manager-id', givenname: 'Manager' };
const employment = { orgId: 42, orgName: 'Employment place', manager };

test('keeps the employment match available when a persisted facility prevents prefill', () => {
  const persistedNode = findPlaceNode(placeNodes, 'Department');
  assert.ok(persistedNode);

  const match = findPlaceEmploymentMatch(
    placeNodes,
    [
      { orgId: 7, orgName: 'Other place', manager: { personId: 'other-manager', givenname: 'Other manager' } },
      employment,
    ],
    persistedNode
  );

  assert.equal(getEmploymentPrefillNode(match, 'Department'), undefined);
  assert.equal(getEmploymentPrefillNode(match, undefined)?.label.id, 'employment');
  assert.equal(match?.employment.orgId, 42);
});

test('enriches a changed place only while it remains in the employment branch', () => {
  const match = findPlaceEmploymentMatch(placeNodes, [employment]);
  const employmentNode = findPlaceNode(placeNodes, 'Employment place');
  const departmentNode = findPlaceNode(placeNodes, 'Department');
  const otherNode = findPlaceNode(placeNodes, 'Other place');

  assert.ok(employmentNode);
  assert.ok(departmentNode);
  assert.ok(otherNode);

  assert.deepEqual(getFacilityPlaceInfo(employmentNode, match), {
    orgId: 42,
    orgName: 'Employment place',
    parentOrgName: undefined,
    manager,
  });
  assert.deepEqual(getFacilityPlaceInfo(departmentNode, match), {
    orgId: undefined,
    orgName: 'Department',
    parentOrgName: 'Employment place',
    manager,
  });
  assert.deepEqual(getFacilityPlaceInfo(otherNode, match), {
    orgId: undefined,
    orgName: 'Other place',
    parentOrgName: undefined,
    manager: undefined,
  });
});
