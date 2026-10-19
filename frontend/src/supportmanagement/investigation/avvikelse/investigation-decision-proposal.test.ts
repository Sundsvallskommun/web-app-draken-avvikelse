import assert from 'node:assert/strict';

import type { RJSFSchema } from '@rjsf/utils';
import { test } from 'vitest';

import type { InvestigationProfile } from '../investigation-profile';
import {
  readInvestigationDecisionProposal,
  resolveDecisionProposalDegreeTitle,
} from './investigation-decision-proposal';
import solLssDecisionSchemaRequest from './schemas/beslut-sol-lss.schema-request.json';

const profile = (documents: InvestigationProfile['documents']): InvestigationProfile => ({
  state: 'active',
  documents,
  registration: { mode: 'enabled' },
});
const investigation = (key: string, schemaName = 'utredning-sol-lss'): InvestigationProfile['documents'][number] => ({
  key,
  schemaName,
  tabLabel: 'Utredning',
  ownerLabel: 'Lex Sarah',
  placement: 'investigation',
  appliesTo: 'all',
});
const proposal = { proposedMisconductDegree: 'misconduct', proposalMotivation: '<p>Motivering.</p>' };

test('reads the proposal from the reported-misconduct investigation under the profile key', () => {
  const p = profile([investigation('misconduct-investigation'), investigation('utredning-hsl', 'utredning-hsl')]);
  const errand = {
    jsonParameters: [
      { key: 'utredning-hsl', value: { proposedMisconductDegree: 'no_misconduct' } },
      { key: 'misconduct-investigation', value: proposal },
    ],
  };

  assert.deepEqual(readInvestigationDecisionProposal(errand, p), {
    degree: 'misconduct',
    motivation: '<p>Motivering.</p>',
  });
});

test('reports an unsaved, unreadable or ambiguous investigation as no proposal at all', () => {
  const p = profile([investigation('utredning-sol-lss')]);
  assert.equal(readInvestigationDecisionProposal(undefined, p), undefined);
  assert.equal(readInvestigationDecisionProposal({ jsonParameters: [] }, p), undefined);
  assert.equal(readInvestigationDecisionProposal({ jsonParameters: [{ key: 'utredning-sol-lss' }] }, p), undefined);
  assert.equal(
    readInvestigationDecisionProposal({ jsonParameters: [{ key: 'utredning-sol-lss', value: proposal }] }, null),
    undefined
  );
  assert.equal(
    readInvestigationDecisionProposal(
      { jsonParameters: [{ key: 'utredning-sol-lss', value: proposal }] },
      profile([investigation('utredning-sol-lss'), investigation('copy')])
    ),
    undefined
  );
});

test('an investigation saved without a proposal yet is an empty proposal, not a missing one', () => {
  const p = profile([investigation('utredning-sol-lss')]);
  assert.deepEqual(
    readInvestigationDecisionProposal(
      { jsonParameters: [{ key: 'utredning-sol-lss', value: { proposalMotivation: '  ' } }] },
      p
    ),
    { degree: undefined, motivation: undefined }
  );
});

test('titles a proposed degree from the decision schema and shows an unknown one verbatim', () => {
  const schema = solLssDecisionSchemaRequest.value as unknown as RJSFSchema;
  assert.equal(
    resolveDecisionProposalDegreeTitle(schema, 'decidedMisconductDegree', 'serious_misconduct'),
    'Allvarligt missförhållande – anmäls till IVO'
  );
  assert.equal(resolveDecisionProposalDegreeTitle(schema, 'decidedMisconductDegree', 'legacy'), 'legacy');
  assert.equal(resolveDecisionProposalDegreeTitle(undefined, 'decidedMisconductDegree', 'misconduct'), 'misconduct');
  assert.equal(resolveDecisionProposalDegreeTitle(schema, 'decidedMisconductDegree', undefined), undefined);
});
