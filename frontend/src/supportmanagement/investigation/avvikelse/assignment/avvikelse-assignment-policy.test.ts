import assert from 'node:assert/strict';

import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { test } from 'vitest';

import type { InvestigationProfile } from '../../investigation-profile';
import { ACCESS_LEX_LABEL_PATH } from './avvikelse-access-labels';
import {
  handsErrandToLexManager,
  leavesFollowUpToTheUnit,
  lexOverviewAssignee,
  requiresLexAssignment,
} from './avvikelse-assignment-policy';

const profile = {
  documents: [{ key: 'manager-document', schemaName: 'utredning-enhetschef' }],
} as unknown as InvestigationProfile;

const errand = (suspectedMisconduct: string | undefined, labels: SupportErrand['labels'] = []) =>
  ({
    labels,
    jsonParameters:
      suspectedMisconduct === undefined ? [] : [{ key: 'manager-document', value: { suspectedMisconduct } }],
  } as unknown as SupportErrand);

test('a saved suspected misconduct that has not gone to LEX must be handed over before the decision', () => {
  assert.equal(requiresLexAssignment({ errand: errand('yes'), profile, labelStructure: [] }), true);
});

test('nothing is required without a saved assessment of suspected misconduct', () => {
  assert.equal(requiresLexAssignment({ errand: errand('no'), profile, labelStructure: [] }), false);
  assert.equal(requiresLexAssignment({ errand: errand(undefined), profile, labelStructure: [] }), false);
  assert.equal(requiresLexAssignment({ errand: undefined, profile, labelStructure: [] }), false);
  // Without the unit manager document in the profile there is no assessment to read.
  assert.equal(requiresLexAssignment({ errand: errand('yes'), profile: null, labelStructure: [] }), false);
});

test('an errand already handed to LEX requires nothing more', () => {
  const handedOver = errand('yes', [{ resourcePath: ACCESS_LEX_LABEL_PATH }] as SupportErrand['labels']);
  assert.equal(requiresLexAssignment({ errand: handedOver, profile, labelStructure: [] }), false);
});

test('the overview names LEX as responsible while the errand carries the LEX access label', () => {
  assert.equal(lexOverviewAssignee([{ resourcePath: ACCESS_LEX_LABEL_PATH }] as SupportErrand['labels'], []), 'LEX');
  // A label that does not carry its path is found through the label tree.
  assert.equal(
    lexOverviewAssignee(
      [{ id: 'lex' }] as SupportErrand['labels'],
      [{ id: 'lex', resourcePath: 'ACCESS/LEX' }] as never
    ),
    'LEX'
  );
  assert.equal(lexOverviewAssignee([{ resourcePath: 'REPORT_TYPE/ABUSE' }] as SupportErrand['labels'], []), undefined);
  assert.equal(lexOverviewAssignee(undefined, undefined), undefined);
});

test('a LEX investigator hands the errand to a LEX manager rather than sending it to the decision', () => {
  assert.equal(handsErrandToLexManager({ roleKeys: ['lex-utredare'] }), true);
  // A manager as well is a manager, an administrator is held back by no role, and other roles are not concerned.
  assert.equal(handsErrandToLexManager({ roleKeys: ['lex-utredare', 'lex-ansvarig'] }), false);
  assert.equal(handsErrandToLexManager({ roleKeys: ['lex-utredare'], superadmin: true }), false);
  assert.equal(handsErrandToLexManager({ roleKeys: ['enhetschef'] }), false);
  assert.equal(handsErrandToLexManager({}), false);
});

test('a LEX handler leaves the follow-up to the unit rather than starting it', () => {
  assert.equal(leavesFollowUpToTheUnit({ roleKeys: ['lex-ansvarig'] }), true);
  assert.equal(leavesFollowUpToTheUnit({ roleKeys: ['lex-utredare'] }), true);
  assert.equal(leavesFollowUpToTheUnit({ roleKeys: ['lex-ansvarig', 'lex-utredare'] }), true);
  // Another role besides LEX may be the one acting, an administrator is held back by no role, and without a
  // handler role there is no LEX to hold back.
  assert.equal(leavesFollowUpToTheUnit({ roleKeys: ['lex-ansvarig', 'enhetschef'] }), false);
  assert.equal(leavesFollowUpToTheUnit({ roleKeys: ['lex-ansvarig'], superadmin: true }), false);
  assert.equal(leavesFollowUpToTheUnit({ roleKeys: ['enhetschef'] }), false);
  assert.equal(leavesFollowUpToTheUnit({}), false);
});

test('a suspicion LEX-ansvarig declined in the initial assessment asks for no new handover', () => {
  const withAssessment = {
    documents: [
      ...(profile as unknown as { documents: unknown[] }).documents,
      { key: 'assessment', schemaName: 'bedomning-sol-lss' },
    ],
  } as unknown as InvestigationProfile;
  const declined = {
    labels: [],
    jsonParameters: [
      { key: 'manager-document', value: { suspectedMisconduct: 'yes' } },
      { key: 'assessment', value: { lexInvestigationDecision: 'not_investigate' } },
    ],
  } as unknown as SupportErrand;

  assert.equal(requiresLexAssignment({ errand: declined, profile: withAssessment, labelStructure: [] }), false);
});
