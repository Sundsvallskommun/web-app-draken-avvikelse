import assert from 'node:assert/strict';

import type { RegisterSupportErrandFormModel } from '@supportmanagement/interfaces/errand';
import { Priority } from '@supportmanagement/interfaces/priority';
import { test } from 'vitest';

import { buildSupportErrandUpdateData, changesSupportErrandBody } from './support-errand-update-data';

const form = {
  id: 'errand-1',
  title: 'Titel',
  priority: Priority.HIGH,
  description: 'Beskrivning',
  businessRelated: false,
  externalTags: [{ key: 'other', value: 'kept' }],
  caseId: 'CASE-1',
} as Partial<RegisterSupportErrandFormModel>;
const stakeholders = [{ role: 'PRIMARY' }];

// The BFF checks each field written against what the handler saw of it: a field the draft left alone is not written,
// so a change somebody else made to it meanwhile neither stops this save nor is written over.
test('writes only the fields the draft changed', () => {
  assert.deepEqual(buildSupportErrandUpdateData(form, stakeholders, { title: true }), { title: 'Titel' });
  assert.deepEqual(buildSupportErrandUpdateData(form, stakeholders, { businessRelated: true }), {
    businessRelated: false,
  });
});

test('writes the stakeholders when a customer or a contact changed', () => {
  assert.deepEqual(buildSupportErrandUpdateData(form, stakeholders, { contacts: [{ firstName: true }] }), {
    stakeholders,
  });
});

test('writes the external tags, with the case id among them, when either changed', () => {
  assert.deepEqual(buildSupportErrandUpdateData(form, stakeholders, { caseId: true }), {
    externalTags: [
      { key: 'other', value: 'kept' },
      { key: 'caseId', value: 'CASE-1' },
    ],
  });
});

test('has nothing to write when no field of the errand itself changed', () => {
  assert.deepEqual(buildSupportErrandUpdateData(form, stakeholders, { admin: true, category: true }), {});
  assert.equal(changesSupportErrandBody({ admin: true, category: true }), false);
  assert.equal(changesSupportErrandBody({ description: true }), true);
});
