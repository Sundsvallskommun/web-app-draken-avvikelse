import assert from 'node:assert/strict';

import type { RJSFSchema } from '@rjsf/utils';
import { test } from 'vitest';

import lexDecisionRequest from '../schemas/beslut-sol-lss.schema-request.json';
import managerRequest from '../schemas/utredning-enhetschef.schema-request.json';
import lexRequest from '../schemas/utredning-sol-lss.schema-request.json';
import { buildUnitFollowUpVocabulary, readChoiceTitles, readRiskValues } from './unit-follow-up-vocabulary';

const managerSchema = managerRequest.value as unknown as RJSFSchema;
const lexSchema = lexRequest.value as unknown as RJSFSchema;
const lexDecisionSchema = lexDecisionRequest.value as unknown as RJSFSchema;

test('names the cause areas as the current schema does', () => {
  const titles = readChoiceTitles(managerSchema, 'causeAreas');

  assert.equal(titles.get('procedures_routines_guidelines'), 'Processer, rutiner, arbetssätt, riktlinjer');
  assert.equal(titles.get('communication_information'), 'Kommunikation och information');
});

test('names what LEX decided the report amounted to', () => {
  assert.equal(
    readChoiceTitles(lexDecisionSchema, 'decidedMisconductDegree').get('serious_misconduct'),
    'Allvarligt missförhållande – anmäls till IVO'
  );
});

test('offers exactly the risk values probability times severity can give', () => {
  const values = [1, 2, 3, 4, 6, 8, 9, 12, 16];

  assert.deepEqual(readRiskValues(managerSchema, 'riskAssessmentHsl'), values);
  assert.deepEqual(readRiskValues(managerSchema, 'riskAssessmentSolLss'), values);
});

test('offers no risk values for an assessment that declares no calculation', () => {
  assert.deepEqual(readRiskValues({ type: 'object', properties: { risk: { type: 'object' } } }, 'risk'), []);
  assert.deepEqual(readRiskValues(undefined, 'riskAssessmentHsl'), []);
});

test('names the legal bases from both investigations, LEX offering only the two of lex Sarah', () => {
  assert.deepEqual([...buildUnitFollowUpVocabulary({ lexInvestigation: lexSchema }).legalBases.keys()], ['SOL', 'LSS']);
  const both = buildUnitFollowUpVocabulary({ managerInvestigation: managerSchema, lexInvestigation: lexSchema });
  assert.deepEqual([...both.legalBases.keys()].sort(), ['HSL', 'LSS', 'SOL']);
  assert.equal(both.legalBases.get('SOL'), 'SoL – Socialtjänstlagen');
});

test('builds the vocabulary from whichever schemas could be read', () => {
  const vocabulary = buildUnitFollowUpVocabulary({ lexInvestigation: lexSchema });

  assert.ok(vocabulary.causeAreas.size > 0);
  assert.equal(vocabulary.misconductDegrees.size, 0);
  assert.deepEqual(vocabulary.riskValuesHsl, []);
});
