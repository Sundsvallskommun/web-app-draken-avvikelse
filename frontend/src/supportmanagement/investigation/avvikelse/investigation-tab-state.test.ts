import assert from 'node:assert/strict';

import { test } from 'vitest';

import { type InvestigationAccessState, parseInvestigationAccess } from '../investigation-access';
import type { InvestigationProfile, InvestigationProfileDocument } from '../investigation-profile';
import {
  configuredInvestigationDocuments,
  isInvestigationDocumentEditable,
  resolveInvestigationTabState,
  selectedInvestigationDocumentKey,
  visibleInvestigationDocuments,
} from './investigation-tab-state';

const document = (): InvestigationProfileDocument => ({
  key: 'utredning-enhetschef',
  schemaName: 'utredning-enhetschef',
  tabLabel: 'Utredning enhetschef',
  ownerLabel: 'Enhetschef',
  placement: 'investigation',
  appliesTo: 'all',
});
const decision: InvestigationProfileDocument = {
  ...document(),
  key: 'beslut-sol-lss',
  schemaName: 'beslut-sol-lss',
  tabLabel: 'Beslut SoL/LSS',
  placement: 'decision',
  appliesTo: 'reported-misconduct',
};
const hslDecision: InvestigationProfileDocument = {
  ...decision,
  key: 'beslut-hsl',
  schemaName: 'beslut-hsl',
  tabLabel: 'Beslut HSL',
  appliesTo: 'hsl-deviation',
};
const profile = (overrides: Partial<InvestigationProfile> = {}): InvestigationProfile => ({
  state: 'active',
  documents: [document()],
  registration: { mode: 'enabled' },
  ...overrides,
});
const access = (
  grants: Record<string, 'edit' | 'read' | 'hidden'> = { 'utredning-enhetschef': 'edit' }
): InvestigationAccessState => ({
  status: 'ready',
  access: parseInvestigationAccess(
    {
      municipalityId: '2281',
      errandId: 'one',
      documents: Object.entries(grants).map(([key, access]) => ({ key, access })),
    },
    '2281',
    'one'
  ),
});

test('profile failures, inactive features and absent documents remain distinct', () => {
  assert.equal(resolveInvestigationTabState('idle', null), 'loading');
  assert.equal(resolveInvestigationTabState('loading', null), 'loading');
  assert.equal(resolveInvestigationTabState('error', null), 'error');
  assert.equal(resolveInvestigationTabState('disabled', null), 'not-configured');
  assert.equal(resolveInvestigationTabState('ready', null), 'not-configured');
  assert.equal(resolveInvestigationTabState('ready', profile({ state: 'unavailable' })), 'unavailable');
  assert.equal(resolveInvestigationTabState('ready', profile({ state: 'inactive' })), 'not-configured');
  assert.equal(resolveInvestigationTabState('ready', profile({ documents: [] })), 'not-configured');
});

test('a configured document does not become visible or editable before errand access is resolved', () => {
  assert.equal(resolveInvestigationTabState('ready', profile()), 'loading');
  assert.equal(visibleInvestigationDocuments(profile()).length, 0);
  assert.equal(isInvestigationDocumentEditable(document(), { status: 'loading' }), false);
});

test('an access failure is distinguished from an explicit denial', () => {
  assert.equal(resolveInvestigationTabState('ready', profile(), { access: { status: 'error' } }), 'access-error');
  assert.equal(resolveInvestigationTabState('ready', profile(), { access: { status: 'denied' } }), 'no-access');
  assert.equal(resolveInvestigationTabState('ready', profile(), { access: access({}) }), 'no-access');
});

test('readers see the document but only editors can change it', () => {
  for (const grant of ['read', 'edit'] as const) {
    const state = access({ 'utredning-enhetschef': grant });
    assert.equal(resolveInvestigationTabState('ready', profile(), { access: state }), 'ready');
    assert.equal(visibleInvestigationDocuments(profile(), { access: state }).length, 1);
    assert.equal(isInvestigationDocumentEditable(document(), state), grant === 'edit');
  }
  assert.equal(isInvestigationDocumentEditable(document(), access({})), false);
});

test('the tab opens on the first document the user can write in, not the first they can read', () => {
  const managerInvestigation = document();
  const lexInvestigation = { ...document(), key: 'utredning-sol-lss', schemaName: 'utredning-sol-lss' };
  const documents = [managerInvestigation, lexInvestigation];
  const lexInvestigator = access({ 'utredning-enhetschef': 'read', 'utredning-sol-lss': 'edit' });

  assert.equal(selectedInvestigationDocumentKey(documents, lexInvestigator, undefined), 'utredning-sol-lss');
  // A tab the user picks stays picked.
  assert.equal(
    selectedInvestigationDocumentKey(documents, lexInvestigator, 'utredning-enhetschef'),
    'utredning-enhetschef'
  );
  // Someone who can only read falls back to the first document.
  assert.equal(
    selectedInvestigationDocumentKey(
      documents,
      access({ 'utredning-enhetschef': 'read', 'utredning-sol-lss': 'read' }),
      undefined
    ),
    'utredning-enhetschef'
  );
  assert.equal(selectedInvestigationDocumentKey([], lexInvestigator, undefined), undefined);
});

test('only granted documents belonging to this tab and errand are offered', () => {
  const p = profile({ documents: [document(), decision, hslDecision] });
  const state = access({ 'utredning-enhetschef': 'read', 'beslut-sol-lss': 'edit', 'beslut-hsl': 'edit' });
  assert.deepEqual(
    visibleInvestigationDocuments(p, { access: state }).map((d) => d.key),
    ['utredning-enhetschef']
  );
  assert.deepEqual(
    visibleInvestigationDocuments(p, {
      access: state,
      placement: 'decision',
      applicability: 'reported-misconduct',
    }).map((d) => d.key),
    ['beslut-sol-lss']
  );
  assert.deepEqual(
    visibleInvestigationDocuments(p, { access: state, placement: 'decision', applicability: 'hsl-deviation' }).map(
      (d) => d.key
    ),
    ['beslut-hsl']
  );
  assert.equal(visibleInvestigationDocuments(p, { access: state, placement: 'decision' }).length, 0);
  assert.equal(
    configuredInvestigationDocuments(p, { placement: 'decision', applicability: 'reported-misconduct' }).length,
    1
  );
});

test('a document that applies to every errand is offered whatever the errand kind', () => {
  const p = profile({ documents: [document(), { ...decision, appliesTo: 'all' }] });
  const state = access({ 'beslut-sol-lss': 'read' });
  for (const applicability of ['reported-misconduct', 'hsl-deviation', undefined] as const) {
    assert.equal(visibleInvestigationDocuments(p, { access: state, placement: 'decision', applicability }).length, 1);
  }
});

// Ä4: MAS/MAR's event analysis and the comment on it belong to deviations. A misconduct goes to LEX and has neither.
test('a document for deviations is offered on every errand but a reported misconduct', () => {
  const hslAnalysis: InvestigationProfileDocument = {
    ...document(),
    key: 'utredning-hsl',
    schemaName: 'utredning-hsl',
    tabLabel: 'Händelseanalys HSL',
    appliesTo: 'deviation',
  };
  const p = profile({ documents: [document(), hslAnalysis] });
  const state = access({ 'utredning-enhetschef': 'edit', 'utredning-hsl': 'edit' });

  for (const applicability of ['hsl-deviation', undefined] as const) {
    assert.deepEqual(
      visibleInvestigationDocuments(p, { access: state, applicability }).map((d) => d.key),
      ['utredning-enhetschef', 'utredning-hsl']
    );
  }
  assert.deepEqual(
    visibleInvestigationDocuments(p, { access: state, applicability: 'reported-misconduct' }).map((d) => d.key),
    ['utredning-enhetschef']
  );
  assert.deepEqual(
    configuredInvestigationDocuments(p, { applicability: 'reported-misconduct' }).map((d) => d.key),
    ['utredning-enhetschef']
  );
});

test('decision access is independent of investigation access', () => {
  const p = profile({ documents: [document(), decision] });
  const state = access();
  assert.equal(resolveInvestigationTabState('ready', p, { access: state }), 'ready');
  assert.equal(
    resolveInvestigationTabState('ready', p, {
      access: state,
      placement: 'decision',
      applicability: 'reported-misconduct',
    }),
    'no-access'
  );
});

// An errand that calls for no decision is told so, rather than told the deployment has no decisions.
test('a decision tab whose documents concern other errands has nothing to decide', () => {
  const p = profile({ documents: [document(), decision] });
  const state = access({ 'beslut-sol-lss': 'edit' });
  assert.equal(
    resolveInvestigationTabState('ready', p, { access: state, placement: 'decision', applicability: 'hsl-deviation' }),
    'not-applicable'
  );
  assert.equal(resolveInvestigationTabState('ready', p, { access: state, placement: 'decision' }), 'not-applicable');
  assert.equal(
    resolveInvestigationTabState('ready', profile({ documents: [document()] }), {
      access: state,
      placement: 'decision',
    }),
    'not-configured'
  );
});
