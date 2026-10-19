import assert from 'node:assert/strict';

import type { Phase } from '@common/data-contracts/supportmanagement/data-contracts';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import type { SupportPhaseContext } from '@supportmanagement/services/support-phase-service';
import { test } from 'vitest';

import type { InvestigationProfile } from '../investigation-profile';
import type { InvestigationViewer } from '../investigation-variant';
import { resolveAvvikelseNextStep } from './avvikelse-next-step';

const metadataPhases: Phase[] = [
  { id: 'phase-registration', name: 'ACTUALIZATION', displayName: 'Registrerat', phaseOrder: 1 },
  { id: 'phase-review', name: 'REVIEW', displayName: 'Granskning', phaseOrder: 2 },
  { id: 'phase-investigation', name: 'INVESTIGATION', displayName: 'Utredning', phaseOrder: 3 },
  { id: 'phase-decision', name: 'DECISION', displayName: 'Beslut', phaseOrder: 4 },
  { id: 'phase-follow-up', name: 'FOLLOW_UP', displayName: 'Uppföljning', phaseOrder: 5 },
];

/** The errand has entered every phase up to the named one and left all but that one. */
const inPhase = (phaseId: string): SupportPhaseContext['errandPhases'] => {
  const activeIndex = metadataPhases.findIndex((phase) => phase.id === phaseId);
  return metadataPhases.slice(0, activeIndex + 1).map((phase, index) => ({
    phaseId: phase.id,
    ...(index < activeIndex ? { ended: '2026-09-01T10:00:00Z' } : {}),
  })) as SupportPhaseContext['errandPhases'];
};

const profile = {
  state: 'active',
  documents: [
    { key: 'manager-document', schemaName: 'utredning-enhetschef', tabLabel: 'Utredning enhetschef' },
    { key: 'lex-document', schemaName: 'utredning-sol-lss', tabLabel: 'Utredning Lex Sarah' },
    { key: 'assessment-document', schemaName: 'bedomning-sol-lss', tabLabel: 'Initial bedömning' },
    { key: 'lex-decision', schemaName: 'beslut-sol-lss', tabLabel: 'Beslut SoL/LSS' },
    { key: 'hsl-decision', schemaName: 'beslut-hsl', tabLabel: 'Beslut HSL' },
  ],
} as unknown as InvestigationProfile;

const lexLabel = { id: 'lex', resourcePath: 'ACCESS/LEX' };
const misconductLabel = { id: 'abuse', resourcePath: 'REPORT_TYPE/ABUSE' };
const hslLabel = { id: 'hsl', classification: 'PROVISION', resourcePath: 'PROVISION/HSL' };

const errand = ({
  phase = 'phase-investigation',
  status = 'INQUIRY',
  assignedUserId = 'chef.enhet',
  labels = [] as object[],
  documents = {} as Record<string, Record<string, unknown>>,
  limitedAccess = false,
} = {}) =>
  ({
    id: 'errand-1',
    status,
    assignedUserId,
    limitedAccess,
    labels,
    phases: inPhase(phase),
    jsonParameters: Object.entries(documents).map(([key, value]) => ({ key, value })),
  } as unknown as SupportErrand);

const step = (
  errandValue: SupportErrand,
  {
    viewer = {} as InvestigationViewer,
    account = 'chef.enhet',
    measuresFollowUpRefusal,
  }: { viewer?: InvestigationViewer; account?: string; measuresFollowUpRefusal?: string } = {}
) =>
  resolveAvvikelseNextStep({
    errand: errandValue,
    profile,
    labelStructure: [],
    viewer,
    viewerAccount: account,
    phases: { metadataPhases, errandPhases: errandValue.phases },
    measuresFollowUpRefusal,
  });

const lexManager = { roleKeys: ['lex-ansvarig'] };
const lexInvestigator = { roleKeys: ['lex-utredare'] };

test('says nothing to somebody reading an errand that is another handler’s, or one they may only know of', () => {
  assert.equal(step(errand(), { account: 'someone.else' }), undefined);
  assert.equal(step(errand({ limitedAccess: true })), undefined);
  assert.equal(step(errand({ status: 'SOLVED' })), undefined);
});

test('asks anyone for a handler while the errand has none', () => {
  assert.match(step(errand({ assignedUserId: '' }), { account: 'anyone' })?.text ?? '', /saknar handläggare/u);
});

test('starts with the report in Ärendeuppgifter, and the handler’s account is matched whatever its case', () => {
  const next = step(errand({ phase: 'phase-registration', assignedUserId: 'Chef.Enhet' }));
  assert.equal(next?.tab?.key, 'details');
  assert.match(next?.text ?? '', /Läs rapporten/u);
});

test('the report is reviewed in Ärendeuppgifter before the investigation starts', () => {
  const next = step(errand({ phase: 'phase-review' }));
  assert.equal(next?.tab?.key, 'details');
  assert.match(next?.text ?? '', /Granska rapporten/u);
});

test('an errand waiting on the handler, on a pause or on a completion says so first', () => {
  assert.match(step(errand({ status: 'ASSIGNED' }))?.text ?? '', /Återuppta ärende/u);
  assert.match(step(errand({ status: 'SUSPENDED' }))?.text ?? '', /parkerat/u);
  // Ä5. The answer arrives under Meddelanden, and it is the handler who then resumes the errand.
  const awaiting = step(errand({ status: 'AWAITING_RESPONSE' }));
  assert.equal(awaiting?.tab?.key, 'messages');
  assert.equal(
    awaiting?.text,
    'Ärendet väntar på komplettering. När svaret har kommit under Meddelanden trycker du på Återuppta ärende, så att statusen visar att ärendet hanteras igen.'
  );
});

test('the unit manager writes their investigation, and sends it on once it is completed', () => {
  const writing = step(errand());
  assert.equal(writing?.tab?.key, 'investigation');
  assert.equal(writing?.text, 'Skriv Utredning enhetschef och markera den som klar.');
  const done = step(errand({ documents: { 'manager-document': { completed: 'yes' } } }));
  assert.equal(done?.tab, undefined);
  assert.match(done?.text ?? '', /Skicka ärendet till beslut/u);
});

test('a suspected misconduct in the saved investigation is handed to LEX', () => {
  const suspected = errand({ documents: { 'manager-document': { completed: 'yes', suspectedMisconduct: 'yes' } } });
  assert.match(step(suspected)?.text ?? '', /Tilldela LEX-ansvarig/u);
});

test('a reported misconduct still with the unit is investigated by LEX once it gets there', () => {
  assert.match(step(errand({ labels: [misconductLabel] }))?.text ?? '', /går sedan vidare till LEX/u);
});

test('LEX-ansvarig assesses first, then investigates or hands the investigation on', () => {
  const withLex = { labels: [misconductLabel, lexLabel], assignedUserId: 'lex.ansvarig' };
  const assessing = step(errand(withLex), { viewer: lexManager, account: 'lex.ansvarig' });
  assert.equal(assessing?.tab?.key, 'details');
  assert.match(assessing?.text ?? '', /initiala bedömningen/u);

  const assessed = errand({ ...withLex, documents: { 'assessment-document': { lexInvestigationDecision: 'yes' } } });
  const investigating = step(assessed, { viewer: lexManager, account: 'lex.ansvarig' });
  assert.equal(investigating?.tab?.key, 'investigation');
  assert.match(investigating?.text ?? '', /Utredning Lex Sarah.*LEX-utredare/u);
});

test('a LEX investigator hands the completed investigation to LEX-ansvarig rather than to the decision', () => {
  const completed = errand({
    labels: [misconductLabel, lexLabel],
    assignedUserId: 'lex.utredare',
    documents: { 'lex-document': { completed: 'yes' } },
  });
  assert.match(step(completed, { viewer: lexInvestigator, account: 'lex.utredare' })?.text ?? '', /LEX-ansvarig/u);
});

test('the decision is taken in Beslut where one applies, and the decided errand moves on', () => {
  assert.match(step(errand({ phase: 'phase-decision' }))?.text ?? '', /kräver inget beslut/u);

  const hslDeviation = errand({ phase: 'phase-decision', labels: [hslLabel] });
  assert.equal(step(hslDeviation)?.tab?.key, 'decision');

  const decided = errand({
    phase: 'phase-decision',
    labels: [misconductLabel, lexLabel],
    assignedUserId: 'lex.ansvarig',
    documents: { 'lex-decision': { decidedMisconductDegree: 'no_misconduct' } },
  });
  // LEX leaves the follow-up to the unit; the unit moves on to it.
  assert.match(step(decided, { viewer: lexManager, account: 'lex.ansvarig' })?.text ?? '', /Återlämna till chef/u);
  assert.match(step(decided, { account: 'lex.ansvarig' })?.text ?? '', /Gå vidare till uppföljning/u);
});

// Ä13. The follow-up follows up what was approved, so the unit is sent to the proposals before the phase button.
test('proposals that wait for a decision come before the follow-up, for the unit that starts it', () => {
  const refusal = 'Ärendet kan inte gå vidare till uppföljning förrän alla åtgärdsförslag är bedömda.';
  const decided = errand({
    phase: 'phase-decision',
    labels: [misconductLabel, lexLabel],
    assignedUserId: 'lex.ansvarig',
    documents: { 'lex-decision': { decidedMisconductDegree: 'no_misconduct' } },
  });

  const unit = step(decided, { account: 'lex.ansvarig', measuresFollowUpRefusal: refusal });
  assert.equal(unit?.tab?.key, 'measures');
  assert.match(unit?.text ?? '', /åtgärdsförslag som inte är bedömda/u);
  // An errand that calls for no decision waits for its proposals just the same.
  assert.equal(step(errand({ phase: 'phase-decision' }), { measuresFollowUpRefusal: refusal })?.tab?.key, 'measures');

  // LEX does not start the follow-up, so it hands the errand back as before; and a decision not yet taken comes first.
  const lex = step(decided, { viewer: lexManager, account: 'lex.ansvarig', measuresFollowUpRefusal: refusal });
  assert.match(lex?.text ?? '', /Återlämna till chef/u);
  const undecided = errand({ phase: 'phase-decision', labels: [hslLabel] });
  assert.equal(step(undecided, { measuresFollowUpRefusal: refusal })?.tab?.key, 'decision');
});

test('the follow-up is done in Uppföljning', () => {
  assert.equal(step(errand({ phase: 'phase-follow-up' }))?.tab?.key, 'follow-up');
});
