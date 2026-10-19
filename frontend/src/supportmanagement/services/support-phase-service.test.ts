import assert from 'node:assert/strict';

import type { Phase } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import {
  getAvailablePhaseTransitions,
  getInitialSupportPhaseToLeave,
  getPhaseMainStatus,
  getSupportPhases,
  hasReachedSupportPhase,
  isDecisionPhase,
  isInitialSupportPhase,
  isStatusAllowedInPhase,
  resolveStartProcessPhaseAdvance,
} from './support-phase-service';

const phases = [
  {
    id: 'received',
    name: 'RECEIVED',
    phaseOrder: 1,
    transitions: [
      { id: 'start-investigation', targetPhaseId: 'investigation', description: 'Starta utredning' },
      { id: 'close-directly', targetPhaseId: 'closed', description: 'Avsluta direkt' },
      { id: 'deprecated-transition', targetPhaseId: 'closed', deprecated: true },
    ],
  },
  { id: 'investigation', name: 'INVESTIGATION', phaseOrder: 2 },
  { id: 'closed', name: 'CLOSED', phaseOrder: 3 },
];

test('returns every explicit valid branch without selecting one by metadata order', () => {
  const available = getAvailablePhaseTransitions('received', phases);

  assert.deepEqual(
    available.map(({ transition, target }) => [transition.id, target.id]),
    [
      ['start-investigation', 'investigation'],
      ['close-directly', 'closed'],
    ]
  );
});

test('does not infer an active phase from history or the first metadata phase', () => {
  assert.deepEqual(getAvailablePhaseTransitions(undefined, phases), []);
  assert.deepEqual(getAvailablePhaseTransitions('missing', phases), []);
});

test('filters deprecated phases and orders display phases explicitly', () => {
  assert.deepEqual(
    getSupportPhases([
      { id: 'closed', name: 'CLOSED', phaseOrder: 3 },
      { id: 'retired', name: 'RETIRED', phaseOrder: 2, deprecated: true },
      { id: 'received', name: 'RECEIVED', phaseOrder: 1 },
    ]).map(({ id }) => id),
    ['received', 'closed']
  );
});

// Starting handläggning is the same event as leaving the phase the errand was registered in, so the
// button performs the move - but only where the move is unambiguous.
test('starting handläggning takes the one transition out of the registered phase', () => {
  const singleBranch = [
    {
      id: 'received',
      name: 'Registrerat',
      phaseOrder: 1,
      transitions: [{ id: 'start', targetPhaseId: 'investigation' }],
    },
    { id: 'investigation', name: 'Utredning', phaseOrder: 2 },
  ];

  assert.deepEqual(resolveStartProcessPhaseAdvance('received', singleBranch), {
    kind: 'transition',
    transitionId: 'start',
  });
});

test('starting handläggning enters the workflow for an errand that is in no phase', () => {
  assert.deepEqual(resolveStartProcessPhaseAdvance(undefined, phases), { kind: 'enter' });
});

test('starting handläggning moves no errand it would have to guess for', () => {
  // A deployment running no workflow has no phase to enter.
  assert.equal(resolveStartProcessPhaseAdvance(undefined, []), null);
  // Equal forward orders are ambiguous; neither branch may be selected by array order.
  const ambiguous = phases.map((phase) => ({ ...phase, phaseOrder: phase.id === 'closed' ? 2 : phase.phaseOrder }));
  assert.equal(resolveStartProcessPhaseAdvance('received', ambiguous), null);
  // A phase with nowhere to go stays where it is.
  assert.equal(resolveStartProcessPhaseAdvance('closed', phases), null);
});

// The strip offers no move out of the first phase, because the sidebar's start button owns that step.
test('the registered phase is the first of the ordered model, and nothing else is', () => {
  const ordered = getSupportPhases(phases);

  assert.equal(isInitialSupportPhase('received', ordered), true);
  assert.equal(isInitialSupportPhase('investigation', ordered), false);
  assert.equal(isInitialSupportPhase(undefined, ordered), false);
  assert.equal(isInitialSupportPhase('received', []), false);
});

// Phase and status are one state: Support Management refuses a status the active phase does not
// list, so the errand is never asked to take one it cannot have.
test('a status is available only where the active phase lists it', () => {
  const workflow = [
    { id: 'registered', name: 'Registrerat', phaseOrder: 1, allowedStatuses: ['NEW'] },
    { id: 'review', name: 'Granskning', phaseOrder: 2, allowedStatuses: ['INQUIRY', 'PENDING'] },
    { id: 'unconstrained', name: 'Utredning', phaseOrder: 3 },
  ];

  assert.equal(isStatusAllowedInPhase('INQUIRY', 'registered', workflow), false);
  assert.equal(isStatusAllowedInPhase('INQUIRY', 'review', workflow), true);
  // A phase listing no statuses constrains nothing, and neither does a workflow that is not there.
  assert.equal(isStatusAllowedInPhase('INQUIRY', 'unconstrained', workflow), true);
  assert.equal(isStatusAllowedInPhase('INQUIRY', undefined, []), true);
});

const gatePhases: Phase[] = [
  { id: 'received', name: 'RECEIVED', displayName: 'Inkommet', phaseOrder: 1 },
  { id: 'investigation', name: 'UTREDNING', displayName: 'Utredning', phaseOrder: 2 },
  { id: 'decision', name: 'BESLUT', displayName: 'Beslut', phaseOrder: 3 },
  { id: 'closed', name: 'CLOSED', displayName: 'Avslutat', phaseOrder: 4 },
];

/** The readable side of the errand: the phase it has entered and not left is the one it is in. */
const inPhase = (phaseId: string) => ({ metadataPhases: gatePhases, errandPhases: [{ phaseId }] });

test('the phase being waited for counts as reached, and so does every later one', () => {
  assert.equal(hasReachedSupportPhase('Utredning', inPhase('received')), false);
  assert.equal(hasReachedSupportPhase('Utredning', inPhase('investigation')), true);
  assert.equal(hasReachedSupportPhase('Utredning', inPhase('decision')), true);
  assert.equal(hasReachedSupportPhase('Utredning', inPhase('closed')), true);
});

test('the decision phase is reached later than the investigation phase', () => {
  assert.equal(hasReachedSupportPhase('Beslut', inPhase('investigation')), false);
  assert.equal(hasReachedSupportPhase('Beslut', inPhase('decision')), true);
});

// The namespace names its phases; Draken reads the model rather than prescribing a spelling.
test('the phase resolves from either the technical name or the name handlers read', () => {
  assert.equal(hasReachedSupportPhase('UTREDNING', inPhase('investigation')), true);
  assert.equal(hasReachedSupportPhase('  utredning  ', inPhase('investigation')), true);
});

// An errand created outside the workflow has entered no phase at all, so it is before every one of
// them - the tab that waits for a phase stays away until somebody starts the flow.
test('an errand that has not entered the workflow has reached no phase', () => {
  assert.equal(hasReachedSupportPhase('Utredning', { metadataPhases: gatePhases, errandPhases: undefined }), false);
  assert.equal(hasReachedSupportPhase('Utredning', { metadataPhases: gatePhases, errandPhases: [] }), false);
  assert.equal(
    hasReachedSupportPhase('Utredning', {
      metadataPhases: gatePhases,
      errandPhases: [{ phaseId: 'received', ended: '1' }],
    }),
    false
  );
});

// Configuration nobody made must not take a tab away: a namespace running no workflow, or one whose
// phases are named differently, keeps what it had before the gate existed.
test('a phase the deployment does not run gates nothing', () => {
  assert.equal(hasReachedSupportPhase('Utredning', { metadataPhases: undefined, errandPhases: undefined }), true);
  assert.equal(hasReachedSupportPhase('Utredning', { metadataPhases: [], errandPhases: undefined }), true);
  assert.equal(hasReachedSupportPhase('Handläggning', inPhase('received')), true);
});

test('a tab naming no phase is never gated', () => {
  assert.equal(hasReachedSupportPhase(undefined, inPhase('received')), true);
  assert.equal(hasReachedSupportPhase('   ', inPhase('received')), true);
});

// What waits for the first phase to be left - sending messages - waits while the errand is in it, or has
// not entered the workflow at all, and is let through from the next phase on.
test('the first phase is still to leave until the errand has moved past it', () => {
  assert.equal(getInitialSupportPhaseToLeave(inPhase('received'))?.id, 'received');
  assert.equal(getInitialSupportPhaseToLeave({ metadataPhases: gatePhases, errandPhases: [] })?.id, 'received');
  assert.equal(
    getInitialSupportPhaseToLeave({ metadataPhases: gatePhases, errandPhases: [{ phaseId: 'received', ended: '1' }] })
      ?.id,
    'received'
  );
  assert.equal(getInitialSupportPhaseToLeave(inPhase('investigation')), undefined);
  assert.equal(getInitialSupportPhaseToLeave(inPhase('closed')), undefined);
});

test('a namespace without a workflow, or a phase the model no longer describes, waits for nothing', () => {
  assert.equal(getInitialSupportPhaseToLeave({ metadataPhases: undefined, errandPhases: undefined }), undefined);
  assert.equal(
    getInitialSupportPhaseToLeave({ metadataPhases: [], errandPhases: [{ phaseId: 'received' }] }),
    undefined
  );
  assert.equal(getInitialSupportPhaseToLeave(inPhase('retired-and-removed')), undefined);
});

// The first phase is the first one still in use: a retired phase ahead of it is not what the errand leaves.
test('a retired phase is not the first phase to leave', () => {
  const retiredFirst: Phase[] = [{ id: 'old', name: 'OLD', phaseOrder: 0, deprecated: true }, ...gatePhases];
  assert.equal(
    getInitialSupportPhaseToLeave({ metadataPhases: retiredFirst, errandPhases: [{ phaseId: 'received' }] })?.id,
    'received'
  );
  assert.equal(
    getInitialSupportPhaseToLeave({ metadataPhases: retiredFirst, errandPhases: [{ phaseId: 'old' }] })?.id,
    'received'
  );
});

// A retired phase is not one to wait for, but an errand can still be sitting in one, and its order
// is what places it against the phase being waited for.
test('a deprecated phase still orders the errand it holds', () => {
  const withRetired: Phase[] = [
    ...gatePhases,
    { id: 'retired-investigation', name: 'UTREDNING GAMMAL', phaseOrder: 2, deprecated: true },
  ];

  assert.equal(
    hasReachedSupportPhase('Utredning', {
      metadataPhases: withRetired,
      errandPhases: [{ phaseId: 'retired-investigation' }],
    }),
    true
  );
  assert.equal(
    hasReachedSupportPhase('Beslut', {
      metadataPhases: withRetired,
      errandPhases: [{ phaseId: 'retired-investigation' }],
    }),
    false
  );
  // The retired phase cannot be the one a tab waits for, so naming it gates nothing.
  assert.equal(hasReachedSupportPhase('UTREDNING GAMMAL', inPhase('received')), true);
});

// The errand is in the workflow but in a phase the model no longer describes: nothing can be
// ordered against it, and a tab is not taken away over metadata that has moved on.
test('a phase missing from the model does not lock the errand out', () => {
  assert.equal(hasReachedSupportPhase('Utredning', inPhase('phase-nobody-configured')), true);
});

test('recognises the decision phase by its technical name only', () => {
  assert.equal(isDecisionPhase({ name: 'DECISION' }), true);
  // The display name is free text and never matched; only the key is.
  assert.equal(isDecisionPhase({ name: 'BESLUT' }), false);
  assert.equal(isDecisionPhase({ name: 'INVESTIGATION' }), false);
  assert.equal(isDecisionPhase({ name: 'decision' }), false);
  assert.equal(isDecisionPhase(undefined), false);
});

test('starting handläggning chooses the unique nearest forward phase, regardless of metadata order', () => {
  for (const workflow of [phases, [...phases].reverse()]) {
    assert.deepEqual(resolveStartProcessPhaseAdvance('received', workflow), {
      kind: 'transition',
      transitionId: 'start-investigation',
    });
  }
});

test('multiple backward transitions do not cause an automatic move', () => {
  const backward = phases.map((phase) => ({ ...phase, phaseOrder: phase.id === 'received' ? 4 : phase.phaseOrder }));
  assert.equal(resolveStartProcessPhaseAdvance('received', backward), null);
});

// Resuming, taking the errand and giving it back all land in the status the phase works in.
test("a phase's main status is the first it allows", () => {
  const workflow = [
    { id: 'review', name: 'REVIEW', phaseOrder: 1, allowedStatuses: ['REVIEW', 'ASSIGNED', 'AWAITING_RESPONSE'] },
    { id: 'open', name: 'OPEN', phaseOrder: 2 },
  ];

  assert.equal(getPhaseMainStatus('review', workflow), 'REVIEW');
  assert.equal(getPhaseMainStatus('open', workflow), undefined);
  assert.equal(getPhaseMainStatus(undefined, workflow), undefined);
  assert.equal(getPhaseMainStatus('review', []), undefined);
});
