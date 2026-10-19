import assert from 'node:assert/strict';

import type { Phase } from '@common/data-contracts/supportmanagement/data-contracts';
import type { SupportPhaseContext } from '@supportmanagement/services/support-phase-service';
import { test } from 'vitest';

import { type PhaseBoundTab, resolvePhaseTabKey } from './support-phase-tab';

const metadataPhases: Phase[] = [
  { id: 'phase-review', name: 'REVIEW', displayName: 'Granskning', phaseOrder: 1 },
  { id: 'phase-investigation', name: 'INVESTIGATION', displayName: 'Utredning', phaseOrder: 2 },
  { id: 'phase-decision', name: 'DECISION', displayName: 'Beslut', phaseOrder: 3 },
  { id: 'phase-follow-up', name: 'FOLLOW_UP', displayName: 'Uppföljning', phaseOrder: 4 },
];

/** The errand has entered every phase up to the named one and left all but that one. */
const inPhase = (phaseId: string | undefined): SupportPhaseContext => {
  if (!phaseId) return { metadataPhases, errandPhases: undefined };
  const activeIndex = metadataPhases.findIndex((phase) => phase.id === phaseId);
  return {
    metadataPhases,
    errandPhases: metadataPhases.slice(0, activeIndex + 1).map((phase, index) => ({
      phaseId: phase.id,
      ...(index < activeIndex ? { ended: '2026-09-01T10:00:00Z' } : {}),
    })) as SupportPhaseContext['errandPhases'],
  };
};

// In the order the tab strip shows them.
const tabs = (visible: Partial<Record<string, boolean>> = {}): PhaseBoundTab[] =>
  [
    { key: 'basics' },
    { key: 'details' },
    { key: 'investigation', phaseName: 'INVESTIGATION' },
    { key: 'measures', phaseName: 'INVESTIGATION' },
    { key: 'decision', phaseName: 'DECISION' },
    { key: 'follow-up', phaseName: 'FOLLOW_UP' },
    { key: 'messages' },
  ].map((tab) => ({ ...tab, visibleFor: visible[tab.key] ?? true }));

test('an errand being investigated opens on the investigation, ahead of the measures sharing its phase', () => {
  assert.equal(resolvePhaseTabKey(tabs(), inPhase('phase-investigation')), 'investigation');
});

test('an errand being decided opens on the decision, and one being followed up on the follow-up', () => {
  assert.equal(resolvePhaseTabKey(tabs(), inPhase('phase-decision')), 'decision');
  assert.equal(resolvePhaseTabKey(tabs(), inPhase('phase-follow-up')), 'follow-up');
});

test('a phase tab this user is not offered is passed over for the next one in the phase', () => {
  assert.equal(resolvePhaseTabKey(tabs({ investigation: false }), inPhase('phase-investigation')), 'measures');
  assert.equal(resolvePhaseTabKey(tabs({ decision: false }), inPhase('phase-decision')), undefined);
});

// Having passed a phase does not make its tab the one to open on.
test('a phase with no tab of its own, and an errand outside the workflow, leave the tab alone', () => {
  assert.equal(resolvePhaseTabKey(tabs(), inPhase('phase-review')), undefined);
  assert.equal(resolvePhaseTabKey(tabs(), inPhase(undefined)), undefined);
});

test('a tab may name its phase by the name handlers read', () => {
  const byDisplayName = tabs().map((tab) => (tab.key === 'decision' ? { ...tab, phaseName: 'Beslut' } : tab));
  assert.equal(resolvePhaseTabKey(byDisplayName, inPhase('phase-decision')), 'decision');
});
