import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  concealInvestigationDocuments,
  investigationDocumentAccess,
  isInvestigationParameterReadable,
  parseInvestigationAccess,
} from './investigation-access';

const response = () => ({
  municipalityId: '2281',
  errandId: 'one',
  documents: [
    { key: 'hsl', access: 'edit' },
    { key: 'sol', access: 'read' },
    { key: 'decision', access: 'hidden' },
  ],
});

test('uses explicit per-errand grants and treats missing keys as hidden', () => {
  const access = parseInvestigationAccess(response(), '2281', 'one');
  const state = { status: 'ready', access } as const;
  assert.equal(investigationDocumentAccess(state, 'hsl'), 'edit');
  assert.equal(investigationDocumentAccess(state, 'sol'), 'read');
  assert.equal(investigationDocumentAccess(state, 'decision'), 'hidden');
  assert.equal(investigationDocumentAccess(state, 'new-document'), 'hidden');
});

test('rejects another errand or municipality instead of reusing those permissions', () => {
  assert.throws(() => parseInvestigationAccess(response(), '2281', 'two'));
  assert.throws(() => parseInvestigationAccess(response(), '2260', 'one'));
});

test('rejects missing, malformed and duplicate grants without an editable default', () => {
  for (const value of [
    null,
    {},
    { ...response(), documents: undefined },
    { ...response(), documents: [{ key: 'hsl' }] },
    { ...response(), documents: [{ key: 'hsl', access: 'write' }] },
    { ...response(), documents: [response().documents[0], response().documents[0]] },
  ])
    assert.throws(() => parseInvestigationAccess(value, '2281', 'one'));
});

test('an unresolved, denied or failed access request grants no document access', () => {
  for (const status of ['loading', 'disabled', 'denied', 'error'] as const) {
    assert.equal(investigationDocumentAccess({ status }, 'hsl'), 'hidden');
  }
});

test('the generic JSON view cannot reveal a hidden investigation document from an older snapshot', () => {
  const profile = {
    state: 'active' as const,
    registration: { mode: 'enabled' as const },
    documents: [
      {
        key: 'hsl',
        schemaName: 'hsl',
        tabLabel: 'HSL',
        ownerLabel: 'Owner',
        placement: 'investigation' as const,
        appliesTo: 'all' as const,
      },
    ],
  };
  assert.equal(isInvestigationParameterReadable(profile, { status: 'loading' }, 'hsl'), false);
  assert.equal(isInvestigationParameterReadable(profile, { status: 'error' }, 'hsl'), false);
  assert.equal(isInvestigationParameterReadable(profile, { status: 'denied' }, 'hsl'), false);
  const access = parseInvestigationAccess(
    { ...response(), documents: [{ key: 'hsl', access: 'hidden' }] },
    '2281',
    'one'
  );
  assert.equal(isInvestigationParameterReadable(profile, { status: 'ready', access }, 'hsl'), false);
  assert.equal(isInvestigationParameterReadable(profile, { status: 'error' }, 'other-system-document'), true);
  assert.equal(isInvestigationParameterReadable(profile, { status: 'disabled' }, 'hsl'), true);
});

test('conceals documents from what is drawn without widening any grant', () => {
  const state = { status: 'ready', access: parseInvestigationAccess(response(), '2281', 'one') } as const;

  const concealed = concealInvestigationDocuments(state, ['hsl', 'decision', 'unknown']);
  assert.equal(investigationDocumentAccess(concealed, 'hsl'), 'hidden');
  assert.equal(investigationDocumentAccess(concealed, 'sol'), 'read');
  assert.equal(investigationDocumentAccess(concealed, 'decision'), 'hidden');
  assert.equal(investigationDocumentAccess(concealed, 'unknown'), 'hidden');
  // The granted access itself is left as it is.
  assert.equal(investigationDocumentAccess(state, 'hsl'), 'edit');
});

test('leaves the access as it is when there is nothing to conceal', () => {
  const state = { status: 'ready', access: parseInvestigationAccess(response(), '2281', 'one') } as const;
  assert.equal(concealInvestigationDocuments(state, []), state);
  assert.equal(concealInvestigationDocuments(state, ['unknown']), state);
  const loading = { status: 'loading' } as const;
  assert.equal(concealInvestigationDocuments(loading, ['hsl']), loading);
});
