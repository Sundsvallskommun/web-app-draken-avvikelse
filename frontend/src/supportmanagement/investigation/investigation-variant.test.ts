import assert from 'node:assert/strict';

import type { SupportPhaseContext } from '@supportmanagement/services/support-phase-service';
import { test } from 'vitest';

import type { SupportErrandClassificationPlacement } from './classification-placement';
import {
  findHeldPhaseEntryRequirement,
  hidesPhaseEntry,
  type InvestigationVariantModule,
  isDecisionTabVisible,
  isInvestigationTabVisible,
} from './investigation-variant';

/** Grundinformation keeps the classification. */
const basicsPlacement: SupportErrandClassificationPlacement = {
  owner: 'basics',
  labelTree: { categoryClassification: 'FIXTURE_CATEGORY', typeClassification: 'FIXTURE_TYPE' },
};

const stub = (id: string): InvestigationVariantModule => ({
  id,
  label: 'Utredning',
  resolveClassificationPlacement: () => basicsPlacement,
  renderTab: () => null,
});

/** A namespace running no workflow: the phase gate has nothing to compare and lets every tab past. */
const noPhases: SupportPhaseContext = { metadataPhases: undefined, errandPhases: undefined };

test('a variant whose work has no phase of its own offers its tab from any phase', () => {
  assert.equal(isInvestigationTabVisible(stub('avvikelse'), noPhases), true);
});

// The decision tab is the variant's call per errand. A variant without the slot never gets the tab,
// whatever the errand looks like.
test('the decision tab needs a slot, and the slot saying yes', () => {
  const withoutSlot = stub('plain');
  const withSlot: InvestigationVariantModule = {
    ...withoutSlot,
    decisionTab: { label: 'Beslut', isVisible: (errand) => errand?.id === 'decided', render: () => null },
  };
  const decided = { id: 'decided' } as Parameters<typeof isDecisionTabVisible>[1];
  const other = { id: 'other' } as Parameters<typeof isDecisionTabVisible>[1];

  assert.equal(isDecisionTabVisible(withSlot, decided, null, noPhases), true);
  assert.equal(isDecisionTabVisible(withSlot, other, null, noPhases), false);
  assert.equal(isDecisionTabVisible(withoutSlot, decided, null, noPhases), false);
});

// The phase a variant names is what makes a tab visible: the errand has got to the work it holds.
test('a tab waiting for a phase stays away until the errand reaches it', () => {
  const metadataPhases = [
    { id: 'received', name: 'Inkommet', phaseOrder: 1 },
    { id: 'investigation', name: 'Utredning', phaseOrder: 2 },
    { id: 'decision', name: 'Beslut', phaseOrder: 3 },
  ];
  const inPhase = (phaseId: string): SupportPhaseContext => ({
    metadataPhases,
    errandPhases: [{ phaseId }],
  });
  const variant: InvestigationVariantModule = {
    ...stub('avvikelse'),
    requiredPhaseName: 'Utredning',
    decisionTab: { label: 'Beslut', requiredPhaseName: 'Beslut', isVisible: () => true, render: () => null },
  };
  const errand = { id: 'errand' } as Parameters<typeof isDecisionTabVisible>[1];

  assert.equal(isInvestigationTabVisible(variant, inPhase('received')), false);
  assert.equal(isInvestigationTabVisible(variant, inPhase('investigation')), true);
  assert.equal(isInvestigationTabVisible(variant, inPhase('decision')), true);

  assert.equal(isDecisionTabVisible(variant, errand, null, inPhase('investigation')), false);
  assert.equal(isDecisionTabVisible(variant, errand, null, inPhase('decision')), true);

  // Ä6. A slot may let one reader past the phase: somebody who decides on their own, outside the phases the
  // handler moves the errand through. Everybody else still waits for the phase.
  const decidesOutsidePhase: InvestigationVariantModule = {
    ...variant,
    decisionTab: {
      ...variant.decisionTab!,
      isOfferedBeforePhase: ({ viewer }) => viewer.roleKeys?.includes('decides-alone') === true,
    },
  };
  const reader = (roleKeys: string[]) => ({ labelStructure: undefined, viewer: { roleKeys } });
  assert.equal(
    isDecisionTabVisible(
      decidesOutsidePhase,
      errand,
      null,
      inPhase('investigation'),
      undefined,
      reader(['decides-alone'])
    ),
    true
  );
  assert.equal(
    isDecisionTabVisible(decidesOutsidePhase, errand, null, inPhase('investigation'), undefined, reader(['other'])),
    false
  );
  assert.equal(isDecisionTabVisible(decidesOutsidePhase, errand, null, inPhase('investigation')), false);
});

test('the first unmet requirement for the target phase holds the move, in the order the variant lists them', () => {
  const requirement = (actionLabel: string, phaseName: string, met: boolean) => ({
    phaseName,
    actionLabel,
    isMet: () => met,
    render: () => null,
  });
  const context = { errand: undefined, profile: undefined, labelStructure: [], viewer: {} };
  const toDecision = (phaseName: string) => phaseName === 'DECISION';
  const handover = requirement('Tilldela LEX-ansvarig', 'DECISION', false);
  const completion = requirement('Utredningen är inte klar', 'DECISION', false);

  assert.equal(findHeldPhaseEntryRequirement([handover, completion], toDecision, context), handover);
  assert.equal(
    findHeldPhaseEntryRequirement(
      [requirement('Tilldela LEX-ansvarig', 'DECISION', true), completion],
      toDecision,
      context
    ),
    completion
  );
  // A requirement on another phase never holds this move, met or not.
  assert.equal(
    findHeldPhaseEntryRequirement([requirement('Annat', 'FOLLOW_UP', false)], toDecision, context),
    undefined
  );
  assert.equal(findHeldPhaseEntryRequirement(undefined, toDecision, context), undefined);
});

test('an unmet hiding requirement keeps the move out of sight instead of holding it', () => {
  const hiding = (met: boolean) => ({ phaseName: 'FOLLOW_UP', hidesTransition: true as const, isMet: () => met });
  const context = { errand: undefined, profile: undefined, labelStructure: [], viewer: {} };
  const toFollowUp = (phaseName: string) => phaseName === 'FOLLOW_UP';
  const toDecision = (phaseName: string) => phaseName === 'DECISION';

  assert.equal(hidesPhaseEntry([hiding(false)], toFollowUp, context), true);
  assert.equal(hidesPhaseEntry([hiding(true)], toFollowUp, context), false);
  assert.equal(hidesPhaseEntry([hiding(false)], toDecision, context), false);
  assert.equal(hidesPhaseEntry(undefined, toFollowUp, context), false);
  // Hidden is not held: there is no button left to say why.
  assert.equal(findHeldPhaseEntryRequirement([hiding(false)], toFollowUp, context), undefined);
});
