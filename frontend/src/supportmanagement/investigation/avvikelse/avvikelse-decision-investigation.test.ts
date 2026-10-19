import assert from 'node:assert/strict';

import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { test } from 'vitest';

import type { InvestigationProfile } from '../investigation-profile';
import {
  describeIncompleteDecisionInvestigation,
  isDecisionInvestigationCompleted,
  resolveDecisionInvestigation,
} from './avvikelse-decision-investigation';

const profile = (state: InvestigationProfile['state'] = 'active') =>
  ({
    state,
    documents: [
      { key: 'manager-document', schemaName: 'utredning-enhetschef', tabLabel: 'Utredning enhetschef' },
      { key: 'lex-document', schemaName: 'utredning-sol-lss', tabLabel: 'Utredning Lex Sarah' },
      { key: 'hsl-document', schemaName: 'utredning-hsl', tabLabel: 'Händelseanalys HSL' },
      { key: 'assessment-document', schemaName: 'bedomning-sol-lss', tabLabel: 'Initial bedömning' },
    ],
  } as unknown as InvestigationProfile);

const errand = ({
  eventType = 'AVVIKELSE',
  documents = {},
}: {
  eventType?: string;
  documents?: Record<string, Record<string, unknown>>;
}) =>
  ({
    parameters: [{ key: 'eventType', values: [eventType] }],
    labels: [],
    jsonParameters: Object.entries(documents).map(([key, value]) => ({ key, value })),
  } as unknown as SupportErrand);

const completed = (context: { errand: SupportErrand; profile?: InvestigationProfile }) =>
  isDecisionInvestigationCompleted({ profile: profile(), labelStructure: [], viewer: {}, ...context });

test("an ordinary deviation is decided once the unit manager's investigation is saved as completed", () => {
  assert.equal(completed({ errand: errand({ documents: { 'manager-document': { completed: 'yes' } } }) }), true);
  assert.equal(completed({ errand: errand({ documents: { 'manager-document': { completed: 'no' } } }) }), false);
  assert.equal(completed({ errand: errand({}) }), false);
});

test("MAS/MAR's HSL investigation neither holds the decision back nor stands in for the unit manager's", () => {
  const hslOnly = errand({ documents: { 'hsl-document': { completed: 'yes' } } });
  assert.equal(completed({ errand: hslOnly }), false);
  const hslUnfinished = errand({
    documents: { 'manager-document': { completed: 'yes' }, 'hsl-document': { completed: 'no' } },
  });
  assert.equal(completed({ errand: hslUnfinished }), true);
});

test('a reported misconduct is decided on the lex Sarah investigation alone', () => {
  const managerDone = { 'manager-document': { completed: 'yes' } };
  assert.equal(completed({ errand: errand({ eventType: 'MISSFORHALLANDE', documents: managerDone }) }), false);
  assert.equal(
    completed({
      errand: errand({ eventType: 'MISSFORHALLANDE', documents: { 'lex-document': { completed: 'yes' } } }),
    }),
    true
  );
});

test("a suspected misconduct in the unit manager's saved investigation is decided on the lex Sarah investigation", () => {
  const suspected = errand({ documents: { 'manager-document': { completed: 'yes', suspectedMisconduct: 'yes' } } });
  const required = resolveDecisionInvestigation({ errand: suspected, profile: profile() });
  assert.equal(required?.document.key, 'lex-document');
  assert.equal(required?.lexMatter, true);
  assert.equal(completed({ errand: suspected }), false);
});

test('nothing is waited for unless the investigation is active', () => {
  assert.equal(completed({ errand: errand({}), profile: profile('inactive') }), true);
  assert.equal(completed({ errand: errand({}), profile: profile('unavailable') }), true);
  assert.equal(
    isDecisionInvestigationCompleted({ errand: errand({}), profile: null, labelStructure: [], viewer: {} }),
    true
  );
});

test('the handler is told which investigation to finish, and why a lex Sarah matter waits for LEX', () => {
  const ordinary = resolveDecisionInvestigation({ errand: errand({}), profile: profile() })!;
  assert.equal(
    describeIncompleteDecisionInvestigation(ordinary),
    'Utredning enhetschef måste vara markerad som klar och sparad innan ärendet kan skickas till beslut.'
  );
  const lex = resolveDecisionInvestigation({ errand: errand({ eventType: 'MISSFORHALLANDE' }), profile: profile() })!;
  assert.match(describeIncompleteDecisionInvestigation(lex), /missförhållande .* beslutas på Utredning Lex Sarah\./);
});

test("a suspicion LEX-ansvarig declined goes back to being decided on the unit manager's investigation", () => {
  const suspected = { 'manager-document': { suspectedMisconduct: 'yes', completed: 'yes' } };
  const declined = errand({
    documents: { ...suspected, 'assessment-document': { lexInvestigationDecision: 'not_investigate' } },
  });
  const accepted = errand({
    documents: { ...suspected, 'assessment-document': { lexInvestigationDecision: 'investigate' } },
  });

  assert.equal(
    resolveDecisionInvestigation({ errand: declined, profile: profile() })?.document.key,
    'manager-document'
  );
  assert.equal(resolveDecisionInvestigation({ errand: accepted, profile: profile() })?.document.key, 'lex-document');
});
