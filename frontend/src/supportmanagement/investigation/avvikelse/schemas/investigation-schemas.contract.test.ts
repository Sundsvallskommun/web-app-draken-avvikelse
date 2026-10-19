import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import iconMap from '@common/components/lucide-icon-map/lucide-icon-map.component';
import Ajv2020 from 'ajv/dist/2020.js';
import { test } from 'vitest';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const artifacts = [
  {
    name: 'utredning-enhetschef',
    version: '1.11',
    hasErrandClassification: true,
    hasReport: true,
    schemaFile: 'utredning-enhetschef.schema-request.json',
    uiSchemaFile: 'utredning-enhetschef.ui-schema-request.json',
  },
  {
    name: 'utredning-sol-lss',
    version: '2.4',
    hasErrandClassification: true,
    hasReport: true,
    schemaFile: 'utredning-sol-lss.schema-request.json',
    uiSchemaFile: 'utredning-sol-lss.ui-schema-request.json',
  },
  {
    name: 'utredning-hsl',
    version: '1.5',
    hasErrandClassification: false,
    hasReport: true,
    // Ä4. MAS/MAR asks the head of operations for their comment from within the analysis.
    controlFields: ['vcCommentRequest'],
    schemaFile: 'utredning-hsl.schema-request.json',
    uiSchemaFile: 'utredning-hsl.ui-schema-request.json',
  },
  {
    name: 'beslut-hsl',
    version: '1.2',
    hasErrandClassification: false,
    hasReport: false,
    schemaFile: 'beslut-hsl.schema-request.json',
    uiSchemaFile: 'beslut-hsl.ui-schema-request.json',
  },
  {
    name: 'beslut-sol-lss',
    version: '1.4',
    hasErrandClassification: false,
    hasReport: false,
    authorField: 'decisionMaker',
    schemaFile: 'beslut-sol-lss.schema-request.json',
    uiSchemaFile: 'beslut-sol-lss.ui-schema-request.json',
  },
  {
    name: 'bedomning-sol-lss',
    version: '1.0',
    hasErrandClassification: false,
    hasReport: false,
    schemaFile: 'bedomning-sol-lss.schema-request.json',
    uiSchemaFile: 'bedomning-sol-lss.ui-schema-request.json',
  },
  {
    name: 'vc-kommentar-hsl',
    version: '1.0',
    hasErrandClassification: false,
    hasReport: false,
    schemaFile: 'vc-kommentar-hsl.schema-request.json',
    uiSchemaFile: 'vc-kommentar-hsl.ui-schema-request.json',
  },
];

const decisionArtifacts = artifacts.filter(({ name }) => name.startsWith('beslut-'));

// The artifacts are arbitrary JSON documents that the assertions walk structurally,
// so the traversal helpers below are deliberately untyped.
function readJson(relativePath: string) {
  return JSON.parse(readFileSync(join(currentDirectory, relativePath), 'utf8'));
}

function createValidator(schema: any) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/u);
  ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u);
  return { ajv, validate: ajv.compile(schema) };
}

function assertCalculatedRisk(riskAssessment: any, label: string) {
  assert.equal(
    riskAssessment.calculatedRiskValue,
    riskAssessment.probability * riskAssessment.severity,
    `${label} must equal probability * severity`
  );
}

function collectPropertyNames(schema: any, result: string[] = []): string[] {
  if (!schema || typeof schema !== 'object') return result;

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [name, propertySchema] of Object.entries(schema.properties)) {
      result.push(name);
      collectPropertyNames(propertySchema, result);
    }
  }

  if (schema.items && typeof schema.items === 'object') {
    collectPropertyNames(schema.items, result);
  }

  if (schema.$defs && typeof schema.$defs === 'object') {
    for (const definition of Object.values(schema.$defs)) {
      collectPropertyNames(definition, result);
    }
  }

  return result;
}

function collectObjectKeys(value: any, result = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return result;

  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, result);
    return result;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    result.add(key);
    collectObjectKeys(nestedValue, result);
  }

  return result;
}

const fixtures = readJson('fixtures/investigation-schema-cases.json');

test('WSO2 request artifacts have the expected envelope and matching schema names', () => {
  for (const artifact of artifacts) {
    const schemaRequest = readJson(artifact.schemaFile);
    const uiSchemaRequest = readJson(artifact.uiSchemaFile);

    assert.deepEqual(Object.keys(schemaRequest).sort(), ['description', 'name', 'value', 'version']);
    assert.deepEqual(Object.keys(uiSchemaRequest).sort(), ['description', 'value']);
    assert.equal(schemaRequest.name, artifact.name);
    assert.equal(schemaRequest.version, artifact.version);
    assert.equal(schemaRequest.value.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schemaRequest.value.type, 'object');
    assert.equal(schemaRequest.value.additionalProperties, false);
    assert.equal(schemaRequest.value.$id, `https://schemas.sundsvall.se/2281/${artifact.name}/${artifact.version}`);
  }
});

test('UI schemas group every root field once and disable unsaved section completion state', () => {
  for (const artifact of artifacts) {
    const schema = readJson(artifact.schemaFile).value;
    const uiSchema = readJson(artifact.uiSchemaFile).value;
    const propertyNames = Object.keys(schema.properties);
    const orderedFields = uiSchema['ui:order'];
    const sectionFields = uiSchema['ui:sections']
      .flatMap((section: any) => section.fields)
      .filter((fieldName: string) => !fieldName.startsWith('$external:'));

    assert.equal(uiSchema['ui:options'].showSectionCompletion, false);
    assert.deepEqual(new Set(orderedFields), new Set(propertyNames));
    assert.deepEqual(new Set(sectionFields), new Set(propertyNames));
    assert.equal(
      sectionFields.length,
      new Set(sectionFields).size,
      `${artifact.name} contains duplicate section fields`
    );
  }
});

test('every investigation section starts open', () => {
  const assertOpenSections = (value: unknown, path: string): void => {
    if (typeof value !== 'object' || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'ui:sections') {
        assert(Array.isArray(child), `${path}.${key} must be an array`);
        for (const section of child) {
          assert.equal(section.defaultOpen, true, `${path}.${section.id} must start open`);
        }
      }
      assertOpenSections(child, `${path}.${key}`);
    }
  };
  for (const artifact of artifacts) assertOpenSections(readJson(artifact.uiSchemaFile).value, artifact.name);
});

test('schemas contain investigation data only, without action plans or working notes', () => {
  for (const artifact of artifacts) {
    const schema = readJson(artifact.schemaFile).value;
    const propertyNames = collectPropertyNames(schema);

    for (const propertyName of propertyNames) {
      assert.doesNotMatch(propertyName, /^(actions?|actionPlan|workingNotes|arbetsanteckningar)$/iu);
    }
  }
});

test('schemas declare errand classification externally only where it is edited', () => {
  const expectedDeclaration = {
    kind: 'supportManagementLabelClassification',
    legalBasesPointer: '/legalBases',
    required: true,
  };

  for (const artifact of artifacts) {
    const schema = readJson(artifact.schemaFile).value;
    const uiSchema = readJson(artifact.uiSchemaFile).value;
    const externalFields = uiSchema['ui:sections']
      .flatMap((section: any) => section.fields)
      .filter((fieldName: string) => fieldName.startsWith('$external:'));

    // The report controls are an external field too, on every investigation but never on a decision.
    const reportFields = artifact.hasReport ? ['$external:investigationReport'] : [];
    // So is who the document is by, where the schema leaves that to the server: Draken shows it, nobody types it.
    const authorFields = 'authorField' in artifact ? [`$external:${artifact.authorField}`] : [];
    // And a control of Draken's own, placed where it belongs in the form.
    const controlFields = ('controlFields' in artifact ? artifact.controlFields ?? [] : []).map(
      (field) => `$external:${field}`
    );
    if (artifact.hasErrandClassification) {
      assert.deepEqual(schema['x-draken-external-fields'], {
        errandClassification: expectedDeclaration,
      });
      assert.deepEqual(externalFields, ['$external:errandClassification', ...reportFields]);
    } else {
      assert.equal(schema['x-draken-external-fields'], undefined);
      assert.deepEqual(externalFields, [...controlFields, ...reportFields, ...authorFields]);
    }
  }
});

test('errand classification values stay outside investigation JSON properties and fixtures', () => {
  const classificationValueFields = [
    'category',
    'classification',
    'deviationSubtype',
    'deviationType',
    'errandClassification',
    'labels',
    'subType',
    'type',
  ];
  const fixtureKeys = new Set<string>();

  collectObjectKeys(fixtures, fixtureKeys);

  for (const fieldName of classificationValueFields) {
    assert.equal(fixtureKeys.has(fieldName), false, `fixtures contain errand classification field ${fieldName}`);
  }

  for (const artifact of artifacts) {
    const propertyNames = new Set(collectPropertyNames(readJson(artifact.schemaFile).value));

    for (const fieldName of classificationValueFields) {
      assert.equal(
        propertyNames.has(fieldName),
        false,
        `${artifact.name} persists errand classification field ${fieldName}`
      );
    }
  }
});

test('UI schemas keep the agreed Draken accordion structure', () => {
  const expectedSections: Record<string, { id: string; title: string }[]> = {
    'utredning-enhetschef': [
      { id: 'categorization-and-documentation', title: 'Kategorisering och dokumentation' },
      { id: 'report', title: 'Utredningen klar och rapport' },
    ],
    // The lex Sarah investigation template, in the order the organisation asked for it.
    'utredning-sol-lss': [
      { id: 'background', title: 'Bakgrund' },
      { id: 'what-happened', title: 'Vad har hänt?' },
      { id: 'why', title: 'Varför har det hänt?' },
      { id: 'decision-proposal', title: 'Förslag till beslut' },
      { id: 'categorization', title: 'Kategorisering' },
      { id: 'report', title: 'Avsluta utredning och skapa rapport' },
    ],
    'utredning-hsl': [
      { id: 'initial-assessment', title: 'Initial bedömning' },
      { id: 'assignment', title: 'Uppdrag' },
      { id: 'analysis-team-participants', title: 'Deltagare i analysteam' },
      { id: 'methodology', title: 'Metodik' },
      { id: 'result', title: 'Resultat' },
      { id: 'report', title: 'Utredningen klar och rapport' },
    ],
    'beslut-hsl': [{ id: 'decision', title: 'Beslut' }],
    'beslut-sol-lss': [
      { id: 'decision', title: 'Beslut om missförhållande' },
      { id: 'ivo-report', title: 'Anmälan till IVO' },
    ],
    'bedomning-sol-lss': [
      { id: 'ivo-report', title: 'Anmälan till IVO' },
      { id: 'lex-investigation', title: 'Lex-utredning' },
    ],
    'vc-kommentar-hsl': [{ id: 'commissioner-comment', title: 'Uppdragsgivarens kommentar' }],
  };

  for (const artifact of artifacts) {
    const uiSchema = readJson(artifact.uiSchemaFile).value;
    assert.deepEqual(
      uiSchema['ui:sections'].map(({ id, title }: { id: string; title: string }) => ({ id, title })),
      expectedSections[artifact.name]
    );
  }

  // The IVO question comes first; its case number and the Public 360 number follow it. The initial assessment
  // asks the same question the lex Sarah decision does, and prefills it.
  for (const artifact of [...decisionArtifacts, ...artifacts.filter(({ name }) => name === 'bedomning-sol-lss')]) {
    const order: string[] = readJson(artifact.uiSchemaFile).value['ui:order'];
    assert.ok(order.indexOf('ivoNotification') < order.indexOf('ivoCaseNumber'), artifact.name);
    assert.ok(order.indexOf('ivoCaseNumber') < order.indexOf('public360CaseNumber'), artifact.name);
  }
});

test('valid fixtures satisfy their draft 2020-12 schemas', () => {
  for (const artifact of artifacts) {
    const schema = readJson(artifact.schemaFile).value;
    const { ajv, validate } = createValidator(schema);
    const valid = validate(fixtures[artifact.name].valid);

    assert.equal(valid, true, ajv.errorsText(validate.errors, { separator: '\n' }));
  }
});

test('invalid fixtures are rejected by their schemas', () => {
  for (const artifact of artifacts) {
    const schema = readJson(artifact.schemaFile).value;
    const { validate } = createValidator(schema);

    for (const invalidFixture of fixtures[artifact.name].invalid) {
      assert.equal(
        validate(invalidFixture.value),
        false,
        `${artifact.name} accepted invalid fixture: ${invalidFixture.description}`
      );
    }
  }
});

// One half-finished document per investigation, as a handler leaves it between two work sessions.
// The form, the BFF and Support Management all validate the same schema, so a draft can only be
// saved if the schema itself calls it valid - which it does until the handler answers that the
// investigation is finished. Everything the investigation must contain is asserted on that answer.
const incompleteInvestigations: Record<string, Record<string, unknown>> = {
  'utredning-enhetschef': { legalBases: ['HSL'], riskAssessmentHsl: { probability: 2 } },
  // Nothing answered at all: the unit manager has opened the investigation and put it down again.
  'utredning-enhetschef (tomt)': {},
  // The report not yet summarized: the summary is asked for when the investigation is completed.
  'utredning-sol-lss': { legalBases: ['SOL', 'LSS'], individualNotified: 'not_applicable' },
  // A participant named, their role not yet chosen.
  'utredning-hsl': { analysisTeamParticipants: [{ name: 'Anna Andersson' }] },
};

// The sections template reads `then.properties` and `then.required` of a root `allOf` rule as the
// rule for when to SHOW a field - that is how a risk assessment appears with its legal base. The
// completion gate must therefore keep its requirements one level down, under `then.allOf`, or every
// field it names disappears from the form until the handler marks the investigation complete.
test('the completion gate decides what is valid, not which fields the form shows', () => {
  for (const artifact of artifacts) {
    const schema = readJson(artifact.schemaFile).value;
    for (const rule of schema.allOf ?? []) {
      if (!rule.if?.properties?.completed || !rule.then) continue;
      assert.equal(rule.then.properties, undefined, `${artifact.name} hides fields until it is completed`);
      assert.equal(rule.then.required, undefined, `${artifact.name} hides fields until it is completed`);
    }
  }
});

for (const [label, incomplete] of Object.entries(incompleteInvestigations)) {
  const name = label.replace(/ \(.*\)$/u, '');
  test(`${label} saves incomplete as a draft and refuses the same document marked complete`, () => {
    const schema = readJson(`${name}.schema-request.json`).value;
    const { ajv, validate } = createValidator(schema);

    // An unanswered completion question is not a completed investigation either.
    for (const draft of [incomplete, { ...incomplete, completed: 'no' }]) {
      assert.equal(validate(draft), true, `${label} refused a draft: ${ajv.errorsText(validate.errors)}`);
    }
    assert.equal(validate({ ...incomplete, completed: 'yes' }), false, `${label} accepted an incomplete completion`);
    assert.equal(
      validate({ ...fixtures[name].valid, completed: 'yes' }),
      true,
      `${name} refused a complete investigation: ${ajv.errorsText(validate.errors)}`
    );
  });
}

test('unit manager risk objects expose the agreed formula metadata and readonly result fields', () => {
  const schema = readJson('utredning-enhetschef.schema-request.json').value;
  const uiSchema = readJson('utredning-enhetschef.ui-schema-request.json').value;
  const validFixture = fixtures['utredning-enhetschef'].valid;
  const { validate } = createValidator(schema);

  assert.equal(schema.$defs.riskValueConsistency.allOf.length, 16);

  for (const riskKey of ['riskAssessmentHsl', 'riskAssessmentSolLss']) {
    const riskSchema = schema.properties[riskKey];
    assert.equal(riskSchema['x-calculation'].formula, 'probability * severity');
    assert.deepEqual(riskSchema['x-calculation'].inputs, ['probability', 'severity']);
    assert.equal(riskSchema['x-calculation'].result, 'calculatedRiskValue');
    assert.equal(riskSchema.properties.calculatedRiskValue.readOnly, true);
    assert.equal(riskSchema.$ref, '#/$defs/riskValueConsistency');
    assert.equal(uiSchema[riskKey]['ui:options'].showObjectFieldset, true);
    assert.equal(uiSchema[riskKey].calculatedRiskValue['ui:readonly'], true);
    assertCalculatedRisk(validFixture[riskKey], riskKey);
  }

  for (const scaleKey of ['probability', 'severity']) {
    assert.equal(schema.$defs[scaleKey].minimum, 1);
    assert.equal(schema.$defs[scaleKey].maximum, 4);
  }

  const inconsistentRiskFixture = structuredClone(validFixture);
  inconsistentRiskFixture.riskAssessmentHsl.calculatedRiskValue = 16;
  assert.equal(validate(inconsistentRiskFixture), false, 'schema accepted an inconsistent calculated HSL risk value');
});

// From 1.11 the unit manager answers the police report question where HSL applies, Ja or Ej aktuellt, as LEX
// answers it for SoL/LSS. Verksamhetsuppföljning names the answer Polisanmälan HSL.
test('the unit manager answers the police report question under HSL alone', () => {
  const schema = readJson('utredning-enhetschef.schema-request.json').value;
  const uiSchema = readJson('utredning-enhetschef.ui-schema-request.json').value;
  const { ajv, validate } = createValidator(schema);

  assert.equal(schema.properties.requiresPoliceReport.title, 'Ska ärendet polisanmälas?');
  const section = uiSchema['ui:sections'].find((candidate: { fields: string[] }) =>
    candidate.fields.includes('requiresPoliceReport')
  );
  assert.equal(section.fields[section.fields.indexOf('riskAssessmentHsl') + 1], 'requiresPoliceReport');

  for (const answer of ['yes', 'not_applicable']) {
    assert.equal(
      validate({ legalBases: ['HSL'], requiresPoliceReport: answer }),
      true,
      ajv.errorsText(validate.errors)
    );
  }
  assert.equal(validate({ legalBases: ['HSL'], requiresPoliceReport: 'no' }), false);
  assert.equal(validate({ legalBases: ['SOL'], requiresPoliceReport: 'yes' }), false);

  // Shown with HSL, by the same rule as the HSL risk assessment.
  const shown = schema.allOf.filter((rule: any) => rule.then?.properties?.requiresPoliceReport === true);
  assert.equal(shown.length, 1);
  const showsQuestion = createValidator(shown[0].if).validate;
  assert.equal(showsQuestion({ legalBases: ['SOL', 'HSL'] }), true);
  assert.equal(showsQuestion({ legalBases: ['SOL'] }), false);
});

test('unit manager rejects fields that do not match the selected legal bases', () => {
  const schema = readJson('utredning-enhetschef.schema-request.json').value;
  const { ajv, validate } = createValidator(schema);
  const hslRisk = {
    assessedWith: 'Anna Andersson',
    probability: 1,
    severity: 1,
    calculatedRiskValue: 1,
  };
  const socialRisk = {
    probability: 1,
    severity: 1,
    calculatedRiskValue: 1,
  };
  const hslOnly = {
    legalBases: ['HSL'],
    riskAssessmentHsl: hslRisk,
  };
  const socialOnly = {
    legalBases: ['SOL'],
    riskAssessmentSolLss: socialRisk,
  };

  assert.equal(validate(hslOnly), true, ajv.errorsText(validate.errors));
  assert.equal(validate({ ...hslOnly, riskAssessmentSolLss: socialRisk }), false);
  assert.equal(validate({ ...hslOnly, suspectedMisconduct: 'yes' }), false);

  assert.equal(validate(socialOnly), true, ajv.errorsText(validate.errors));
  assert.equal(validate({ ...socialOnly, riskAssessmentHsl: hslRisk }), false);

  const combined = {
    legalBases: ['HSL', 'SOL'],
    riskAssessmentHsl: hslRisk,
    riskAssessmentSolLss: socialRisk,
  };
  assert.equal(validate(combined), true, ajv.errorsText(validate.errors));

  // From 1.3 all three legal bases can apply to one deviation; HSL and SoL/LSS are then both assessed.
  const allLegalBases = {
    legalBases: ['HSL', 'LSS', 'SOL'],
    riskAssessmentHsl: hslRisk,
    riskAssessmentSolLss: socialRisk,
  };
  assert.equal(validate(allLegalBases), true, ajv.errorsText(validate.errors));
  // Which legal base needs which risk assessment is decided here; that it has to be there at all is
  // the completion gate's rule, so the missing one is only refused once the investigation is marked
  // complete.
  assert.equal(validate({ ...allLegalBases, riskAssessmentSolLss: undefined }), true);
  assert.equal(validate({ ...allLegalBases, completed: 'yes', riskAssessmentSolLss: undefined }), false);
  assert.equal(validate({ ...allLegalBases, legalBases: ['HSL', 'SOL', 'SOL'] }), false);
});

// The unit manager risk-assesses deviations. A misconduct is passed on to LEX, so its investigation is complete
// without the SoL/LSS risk assessment - and Draken, not the unit manager, says which of the two the errand is.
test('the unit manager investigation of a misconduct neither shows nor requires the SoL/LSS risk assessment', () => {
  const schema = readJson('utredning-enhetschef.schema-request.json').value;
  const uiSchema = readJson('utredning-enhetschef.ui-schema-request.json').value;
  const { ajv, validate } = createValidator(schema);
  const socialRisk = { probability: 1, severity: 1, calculatedRiskValue: 1 };
  const social = { legalBases: ['SOL', 'LSS'], completed: 'yes' };

  assert.equal(schema.properties.reportedMisconduct['x-draken-server-owned'], true);
  assert.equal(uiSchema.reportedMisconduct['ui:widget'], 'hidden');

  assert.equal(validate({ ...social, reportedMisconduct: true }), true, ajv.errorsText(validate.errors));
  for (const deviation of [social, { ...social, reportedMisconduct: false }]) {
    assert.equal(validate(deviation), false, 'a deviation was completed without its SoL/LSS risk assessment');
    assert.equal(validate({ ...deviation, riskAssessmentSolLss: socialRisk }), true, ajv.errorsText(validate.errors));
  }
  // An assessment made while the errand was a deviation is kept when the errand becomes a misconduct.
  assert.equal(
    validate({ ...social, reportedMisconduct: true, riskAssessmentSolLss: socialRisk }),
    true,
    ajv.errorsText(validate.errors)
  );

  // The form shows the assessment for a deviation, and for a misconduct only where one is already made.
  const shown = schema.allOf.filter((rule: any) => rule.then?.properties?.riskAssessmentSolLss === true);
  assert.equal(shown.length, 1);
  const showsAssessment = createValidator(shown[0].if).validate;
  assert.equal(showsAssessment({ legalBases: ['SOL'] }), true);
  assert.equal(showsAssessment({ legalBases: ['SOL'], reportedMisconduct: true }), false);
  assert.equal(
    showsAssessment({ legalBases: ['SOL'], reportedMisconduct: true, riskAssessmentSolLss: socialRisk }),
    true
  );
  assert.equal(showsAssessment({ legalBases: ['HSL'] }), false);
});

// LEX states the legal bases a misconduct falls under: SoL, LSS or both. HSL is not a lex Sarah legal base.
test('the lex Sarah investigation lets LEX choose SoL, LSS or both, and never HSL', () => {
  const schema = readJson('utredning-sol-lss.schema-request.json').value;
  const { ajv, validate } = createValidator(schema);
  for (const legalBases of [['SOL'], ['LSS'], ['SOL', 'LSS']]) {
    assert.equal(validate({ legalBases }), true, ajv.errorsText(validate.errors));
  }
  for (const legalBases of [['HSL'], ['SOL', 'HSL'], ['SOL', 'SOL']]) {
    assert.equal(validate({ legalBases }), false, JSON.stringify(legalBases));
  }
  // As in the unit manager's investigation, they are required once the investigation is marked complete.
  assert.equal(validate({}), true, ajv.errorsText(validate.errors));
  assert.equal(validate({ completed: 'yes' }), false);
  assert.equal(validate({ completed: 'yes', legalBases: [] }), false);
  const summarized = { reportSummary: '<p>Kvällsbesöket uteblev.</p>' };
  assert.equal(validate({ ...summarized, completed: 'yes', legalBases: [] }), false);
  assert.equal(
    validate({ ...summarized, completed: 'yes', legalBases: ['LSS'] }),
    true,
    ajv.errorsText(validate.errors)
  );
});

test('the HSL investigation no longer carries the IVO decision', () => {
  const schema = readJson('utredning-hsl.schema-request.json').value;
  const uiSchema = readJson('utredning-hsl.ui-schema-request.json').value;

  for (const field of ['ivoNotification', 'ivoCaseNumber', 'public360CaseNumber']) {
    assert.equal(field in schema.properties, false, `utredning-hsl still declares ${field}`);
    assert.equal(field in uiSchema, false, `utredning-hsl UI schema still configures ${field}`);
  }
  assert.equal(schema.required, undefined);
  // The IVO rules moved to the decisions. What is left is MAS/MAR's own initial assessment and the completion gate.
  assert.deepEqual(
    schema.allOf.map((entry: any) => Object.keys(entry.if.properties)),
    [['analysisDecision'], ['completed']]
  );
});

// Ä3. Each participant in the analysis team is named, and their role is one of the professions that take part.
test('the HSL investigation names each participant and chooses their role from the professions', () => {
  const schema = readJson('utredning-hsl.schema-request.json').value;
  const uiSchema = readJson('utredning-hsl.ui-schema-request.json').value;
  const participant = schema.properties.analysisTeamParticipants.items;

  assert.deepEqual(Object.keys(participant.properties), ['name', 'role']);
  assert.deepEqual(
    participant.properties.role.oneOf.map(({ const: value, title }: { const: string; title: string }) => [
      value,
      title,
    ]),
    [
      ['nurse', 'Sjuksköterska'],
      ['physiotherapist', 'Fysioterapeut'],
      ['occupational_therapist', 'Arbetsterapeut'],
      ['care_staff', 'Omvårdnadspersonal'],
    ]
  );
  assert.deepEqual(uiSchema.analysisTeamParticipants.items['ui:order'], ['name', 'role']);
  // Ä4. The analysis's result ends where MAS/MAR asks the head of operations for their comment.
  const result = uiSchema['ui:sections'].find(({ id }: { id: string }) => id === 'result');
  assert.equal(result.fields.at(-1), '$external:vcCommentRequest');
  assert.equal(uiSchema.analysisTeamParticipants.items.role['ui:widget'], 'select');

  // Name and role are asked for when the analysis is marked complete, not before.
  const { validate } = createValidator(schema);
  const completedAnalysis = (participant: Record<string, string>) => ({
    analysisDecision: 'analyze',
    analysisTeamParticipants: [participant],
    completed: 'yes',
  });
  assert.equal(validate({ analysisTeamParticipants: [{ name: 'Anna Andersson' }] }), true);
  assert.equal(validate(completedAnalysis({ role: 'nurse' })), false);
  assert.equal(validate(completedAnalysis({ name: '', role: 'nurse' })), false);
  assert.equal(validate(completedAnalysis({ name: 'Anna Andersson', role: 'nurse' })), true);
});

// Ä5. MAS/MAR assesses first whether the event is to be analysed at all. An analysis that is not to be made is
// complete with the reason why; one that is to be made asks for what it always did.
test('the HSL investigation starts with MAS/MAR deciding whether the event is analysed at all', () => {
  const schema = readJson('utredning-hsl.schema-request.json').value;
  const uiSchema = readJson('utredning-hsl.ui-schema-request.json').value;
  const { validate } = createValidator(schema);

  assert.deepEqual(Object.keys(schema.properties).slice(0, 2), ['analysisDecision', 'notAnalyzedMotivation']);
  assert.deepEqual(uiSchema['ui:sections'][0].fields, ['analysisDecision', 'notAnalyzedMotivation']);

  // A draft may hold the decision without its reason, but no reason without the decision it belongs to.
  assert.equal(validate({ analysisDecision: 'not_analyze' }), true);
  assert.equal(validate({ analysisDecision: 'analyze', notAnalyzedMotivation: 'Text' }), false);
  // Not analysed: complete with the reason alone, and not without it.
  assert.equal(
    validate({ analysisDecision: 'not_analyze', notAnalyzedMotivation: 'Ingen vårdskada.', completed: 'yes' }),
    true
  );
  assert.equal(validate({ analysisDecision: 'not_analyze', completed: 'yes' }), false);
  // Analysed: the requirements of the analysis hold as before.
  assert.equal(validate({ analysisDecision: 'analyze', completed: 'yes' }), true);
  assert.equal(
    validate({ analysisDecision: 'analyze', analysisTeamParticipants: [{ name: 'Anna Andersson' }], completed: 'yes' }),
    false
  );
  // Undecided is not complete.
  assert.equal(validate({ completed: 'yes' }), false);
});

// MAS/MAR write the event analysis and the one who commissioned it comments on it. The comment is a document of
// its own, so that it can be written by somebody who is not given the analysis to change.
test('the commissioner comments on the HSL investigation in a document of its own', () => {
  const investigation = readJson('utredning-hsl.schema-request.json').value;
  const investigationUiSchema = readJson('utredning-hsl.ui-schema-request.json').value;
  const comment = readJson('vc-kommentar-hsl.schema-request.json').value;
  const commentUiSchema = readJson('vc-kommentar-hsl.ui-schema-request.json').value;

  assert.equal('commissionerComment' in investigation.properties, false);
  assert.equal('commissionerComment' in investigationUiSchema, false);

  assert.equal(comment.title, 'VC kommentar HSL');
  assert.deepEqual(Object.keys(comment.properties), ['commissionerComment']);
  assert.equal(comment.properties.commissionerComment.title, 'Uppdragsgivarens kommentar');
  // Nothing is required: a comment not yet written is an empty document, and it is never marked completed.
  assert.equal(comment.required, undefined);
  assert.equal(comment.allOf, undefined);
  assert.equal(commentUiSchema.commissionerComment['ui:widget'], 'TextareaWidget');
});

// Both decisions share the IVO part: the Ja/Nej answer is required, the IVO case number is always
// optional, and the Public 360 number exists exactly when the errand is reported to IVO - required
// then, refused otherwise, since the field is disabled for a Nej.
for (const artifact of decisionArtifacts) {
  test(`${artifact.name} requires the IVO answer, and Public 360 exactly for a positive one`, () => {
    const schema = readJson(artifact.schemaFile).value;
    const { ajv, validate } = createValidator(schema);
    const base = structuredClone(fixtures[artifact.name].valid);
    delete base.decidedAt;
    delete base.updatedAt;
    delete base.revisions;
    delete base.ivoNotification;
    delete base.ivoCaseNumber;
    delete base.public360CaseNumber;

    assert.ok(schema.required.includes('ivoNotification'));
    assert.equal(schema.required.includes('ivoCaseNumber'), false);
    assert.equal(schema.required.includes('public360CaseNumber'), false);
    assert.equal(schema.required.includes('decidedAt'), false);

    assert.equal(validate({ ...base }), false, 'accepted a decision without an IVO answer');
    assert.equal(validate({ ...base, ivoNotification: 'no' }), true, ajv.errorsText(validate.errors));
    assert.equal(validate({ ...base, ivoNotification: 'no', public360CaseNumber: 'P360-1' }), false);
    assert.equal(validate({ ...base, ivoNotification: 'no', ivoCaseNumber: 'IVO-stale' }), false);
    assert.equal(validate({ ...base, ivoNotification: 'yes' }), false, 'accepted a report to IVO without Public 360');
    assert.equal(validate({ ...base, ivoNotification: 'yes', ivoCaseNumber: 'IVO-1' }), false);
    assert.equal(
      validate({ ...base, ivoNotification: 'yes', public360CaseNumber: 'P360-1' }),
      true,
      ajv.errorsText(validate.errors)
    );
    assert.equal(
      validate({ ...base, ivoNotification: 'yes', ivoCaseNumber: 'IVO-1', public360CaseNumber: 'P360-1' }),
      true,
      ajv.errorsText(validate.errors)
    );
    assert.equal(validate({ ...base, ivoNotification: 'no', decidedAt: '2026-09-11T12:30:00.000Z' }), true);
    assert.equal(validate({ ...base, ivoNotification: 'no', decidedAt: '2026-09-11' }), false);
  });

  // When a decision was made, when it last changed and by whom are the server's to record: the
  // schema marks the properties for the BFF to stamp, and the form never offers them as inputs.
  test(`${artifact.name} leaves the decision timestamps and revisions to the server`, () => {
    const schema = readJson(artifact.schemaFile).value;
    const uiSchema = readJson(artifact.uiSchemaFile).value;
    const { ajv, validate } = createValidator(schema);

    assert.equal(schema.properties.decidedAt['x-draken-server-timestamp'], 'created');
    assert.equal(schema.properties.updatedAt['x-draken-server-timestamp'], 'updated');
    assert.equal(schema.properties.revisions['x-draken-server-revisions'], true);
    for (const name of ['decidedAt', 'updatedAt']) {
      assert.equal(schema.properties[name].type, 'string');
      assert.equal(schema.properties[name].format, 'date-time');
      assert.equal(schema.properties[name].readOnly, true);
      assert.equal(uiSchema[name]['ui:widget'], 'hidden');
    }
    assert.equal(schema.properties.revisions.readOnly, true);
    assert.deepEqual(schema.properties.revisions.items.required, ['savedAt', 'savedBy']);
    assert.equal(schema.properties.revisions.items.additionalProperties, false);
    assert.equal(uiSchema.revisions['ui:widget'], 'hidden');

    const base = { ...fixtures[artifact.name].valid, revisions: [] };
    assert.equal(validate(base), true, ajv.errorsText(validate.errors));
    assert.equal(validate({ ...base, revisions: [{ savedAt: 'igår', savedBy: 'x' }] }), false);
    assert.equal(validate({ ...base, revisions: [{ savedAt: '2026-09-11T12:30:00.000Z', savedBy: '' }] }), false);
    assert.equal(
      validate({ ...base, revisions: [{ savedAt: '2026-09-11T12:30:00.000Z', savedBy: 'x', extra: 1 }] }),
      false
    );
  });
}

test('the lex Sarah decision classifies the report with the same degrees the investigator proposes', () => {
  const schema = readJson('beslut-sol-lss.schema-request.json').value;
  const proposalSchema = readJson('utredning-sol-lss.schema-request.json').value;
  const { ajv, validate } = createValidator(schema);

  assert.deepEqual(schema.required, ['decidedMisconductDegree', 'decisionMotivation', 'ivoNotification']);
  assert.deepEqual(
    schema.properties.decidedMisconductDegree.oneOf,
    proposalSchema.properties.proposedMisconductDegree.oneOf
  );
  assert.equal(schema.properties.decisionMotivation.contentMediaType, 'text/html');

  assert.equal(
    validate({ decidedMisconductDegree: 'no_misconduct', decisionMotivation: '<p>Nej.</p>', ivoNotification: 'no' }),
    true,
    ajv.errorsText(validate.errors)
  );
  assert.equal(validate({ decisionMotivation: '<p>Nej.</p>', ivoNotification: 'no' }), false);
  assert.equal(validate({ decidedMisconductDegree: 'no_misconduct', ivoNotification: 'no' }), false);
  assert.equal(
    validate({ decidedMisconductDegree: 'no_misconduct', decisionMotivation: '', ivoNotification: 'no' }),
    false
  );
  assert.equal(
    validate({ decidedMisconductDegree: 'other', decisionMotivation: '<p>-</p>', ivoNotification: 'no' }),
    false
  );
});

// The decision is taken under lex Sarah's own provisions, which are not the legal bases the errand is
// classified by: a field of its own, so nothing that reads an investigation's legal bases reads these.
test('the lex Sarah decision names the provisions it is taken under', () => {
  const schema = readJson('beslut-sol-lss.schema-request.json').value;
  const uiSchema = readJson('beslut-sol-lss.ui-schema-request.json').value;
  const { ajv, validate } = createValidator(schema);
  const decision = { decidedMisconductDegree: 'misconduct', decisionMotivation: '<p>Ja.</p>', ivoNotification: 'no' };

  assert.equal(schema.properties.decisionLegalBases.title, 'Ange lagrum');
  assert.deepEqual(schema.properties.decisionLegalBases.items.oneOf, [
    { const: 'sol_27_5', title: '27 kap 5 § SoL' },
    { const: 'lss_24e', title: '24 e § LSS' },
  ]);
  assert.equal('legalBases' in schema.properties, false);
  assert.equal(schema.required.includes('decisionLegalBases'), false);
  assert.equal(uiSchema.decisionLegalBases['ui:options'].multiple, true);
  const decisionFields: string[] = uiSchema['ui:sections'][0].fields;
  assert.ok(decisionFields.indexOf('decidedMisconductDegree') < decisionFields.indexOf('decisionLegalBases'));
  assert.ok(decisionFields.indexOf('decisionLegalBases') < decisionFields.indexOf('decisionMotivation'));

  assert.equal(validate(decision), true, ajv.errorsText(validate.errors));
  assert.equal(validate({ ...decision, decisionLegalBases: ['sol_27_5'] }), true, ajv.errorsText(validate.errors));
  assert.equal(validate({ ...decision, decisionLegalBases: ['sol_27_5', 'lss_24e'] }), true);
  assert.equal(validate({ ...decision, decisionLegalBases: ['sol_27_5', 'sol_27_5'] }), false);
  assert.equal(validate({ ...decision, decisionLegalBases: ['HSL'] }), false);
});

// Who took the decision is the server's to record, like when it was taken: the schema marks the property for
// the BFF to stamp at the first save, the form hides it, and Draken shows it where the UI schema places it.
test('the lex Sarah decision leaves who decided to the server and shows it last in the decision', () => {
  const schema = readJson('beslut-sol-lss.schema-request.json').value;
  const uiSchema = readJson('beslut-sol-lss.ui-schema-request.json').value;
  const { ajv, validate } = createValidator(schema);
  const decision = { decidedMisconductDegree: 'misconduct', decisionMotivation: '<p>Ja.</p>', ivoNotification: 'no' };
  const decisionMaker = schema.properties.decisionMaker;

  assert.equal(decisionMaker.title, 'Beslutsfattare');
  assert.equal(decisionMaker['x-draken-server-author'], 'created');
  assert.equal(decisionMaker.readOnly, true);
  assert.equal(decisionMaker.additionalProperties, false);
  assert.deepEqual(decisionMaker.required, ['name']);
  assert.deepEqual(
    Object.entries(decisionMaker.properties).map(([name, property]: [string, any]) => [name, property.title]),
    [
      ['name', 'Namn'],
      ['role', 'Roll'],
    ]
  );
  assert.equal(schema.required.includes('decisionMaker'), false);
  assert.equal(uiSchema.decisionMaker['ui:widget'], 'hidden');
  assert.equal(uiSchema['ui:sections'][0].fields.at(-1), '$external:decisionMaker');

  assert.equal(validate({ ...decision, decisionMaker: { name: 'Iaf Testare', role: 'LEX-ansvarig' } }), true);
  assert.equal(
    validate({ ...decision, decisionMaker: { name: 'Iaf Testare' } }),
    true,
    ajv.errorsText(validate.errors)
  );
  assert.equal(validate({ ...decision, decisionMaker: { role: 'LEX-ansvarig' } }), false);
  assert.equal(validate({ ...decision, decisionMaker: { name: '', role: 'LEX-ansvarig' } }), false);
  assert.equal(validate({ ...decision, decisionMaker: { name: 'Iaf Testare', account: 'iaf.test' } }), false);
});

// The legal bases question says what to do. From 1.10 it also chooses the template that fills the investigation
// text, so the investigator no longer chooses one, and a stored choice is refused.
test('the unit manager investigation explains the legal bases and has no template choice of its own', () => {
  const schema = readJson('utredning-enhetschef.schema-request.json').value;
  const uiSchema = readJson('utredning-enhetschef.ui-schema-request.json').value;
  const { validate } = createValidator(schema);

  assert.equal(schema.properties.legalBases.description, 'Ange vilket eller vilka lagrum som gäller för avvikelsen');
  assert.equal('investigationTemplate' in schema.properties, false);
  assert.equal(JSON.stringify(uiSchema).includes('investigationTemplate'), false);
  assert.equal(validate({ legalBases: ['SOL'], investigationTemplate: 'sol_lss' }), false);
});

test('the HSL decision is the IVO decision alone', () => {
  const schema = readJson('beslut-hsl.schema-request.json').value;

  assert.deepEqual(schema.required, ['ivoNotification']);
  assert.deepEqual(Object.keys(schema.properties), [
    'decidedAt',
    'updatedAt',
    'revisions',
    'ivoNotification',
    'ivoCaseNumber',
    'public360CaseNumber',
  ]);
});

test('all sketch multiselects are represented as unique arrays', () => {
  const expectedMultiselects: Record<string, string[]> = {
    'utredning-enhetschef': ['legalBases', 'causeAreas'],
    'utredning-sol-lss': ['causeAreas'],
    'utredning-hsl': ['identifiedCauses', 'underlyingCauses'],
    'beslut-hsl': [],
    'beslut-sol-lss': ['decisionLegalBases'],
    'bedomning-sol-lss': [],
    'vc-kommentar-hsl': [],
  };

  for (const artifact of artifacts) {
    const schema = readJson(artifact.schemaFile).value;
    for (const fieldName of expectedMultiselects[artifact.name]) {
      const fieldSchema = schema.properties[fieldName];
      assert.equal(fieldSchema.type, 'array', `${artifact.name}.${fieldName} must be an array`);
      assert.equal(fieldSchema.uniqueItems, true, `${artifact.name}.${fieldName} must reject duplicates`);
    }
  }
});

test('short multiselects use checkboxes while longer cause lists remain searchable', () => {
  const expectedCheckboxes: Record<string, string[]> = {
    'utredning-enhetschef': ['legalBases', 'causeAreas'],
    'utredning-sol-lss': ['causeAreas'],
    'utredning-hsl': ['identifiedCauses'],
    'beslut-sol-lss': ['decisionLegalBases'],
  };
  const expectedComboboxes: Partial<Record<string, string[]>> = {
    'utredning-hsl': ['underlyingCauses'],
  };

  for (const artifact of artifacts) {
    const uiSchema = readJson(artifact.uiSchemaFile).value;

    for (const fieldName of expectedCheckboxes[artifact.name] ?? []) {
      assert.equal(uiSchema[fieldName]['ui:widget'], 'checkboxes');
    }

    for (const fieldName of expectedComboboxes[artifact.name] ?? []) {
      assert.equal(uiSchema[fieldName]['ui:widget'], 'ComboboxWidget');
    }
  }
});

// A section icon the icon map does not know renders as no icon at all, silently.
test('every section icon the UI schemas name exists in the Draken icon map', () => {
  for (const artifact of artifacts) {
    const uiSchema = readJson(artifact.uiSchemaFile).value;
    for (const section of uiSchema['ui:sections']) {
      assert.equal(typeof section.icon, 'string', `${artifact.name}.${section.id} has no icon`);
      assert.ok(section.icon in iconMap, `${artifact.name}.${section.id} names unknown icon ${section.icon}`);
    }
  }
});

// The decision's classification is the form's main choice and spans the form like every other
// field; the investigation's proposal field, which it copies its choices from, is narrower.
test('the lex Sarah classification select takes the full form width', () => {
  const uiSchema = readJson('beslut-sol-lss.ui-schema-request.json').value;
  assert.equal(uiSchema.decidedMisconductDegree['ui:options'].className, 'w-full');
});

// Every investigation can be marked completed by its owner, which locks it and allows a PDF
// report; the reports are recorded by the server. Decisions have no such section.
for (const artifact of artifacts) {
  test(`${artifact.name} ${artifact.hasReport ? 'declares' : 'has no'} completion and report log`, () => {
    const schema = readJson(artifact.schemaFile).value;
    const uiSchema = readJson(artifact.uiSchemaFile).value;

    if (!artifact.hasReport) {
      assert.equal(schema['x-draken-completion'], undefined);
      assert.equal('completed' in schema.properties, false);
      return;
    }

    assert.deepEqual(schema['x-draken-completion'], { field: 'completed', reportsField: 'reports' });
    assert.deepEqual(schema.properties.completed.$ref, '#/$defs/yesNo');
    assert.equal(
      schema.required?.includes('completed') ?? false,
      false,
      'an unanswered document is simply not completed'
    );
    assert.equal(schema.properties.reports['x-draken-server-owned'], true);
    assert.equal(schema.properties.reports.readOnly, true);
    assert.deepEqual(schema.properties.reports.items.required, ['generatedAt', 'generatedBy', 'fileName']);
    assert.equal(uiSchema.completed['ui:widget'], 'RadiobuttonWidget');
    assert.equal(uiSchema.reports['ui:widget'], 'hidden');
    const reportSection = uiSchema['ui:sections'].at(-1);
    assert.deepEqual(reportSection.fields, ['completed', '$external:investigationReport', 'reports']);

    const { ajv, validate } = createValidator(schema);
    const valid = fixtures[artifact.name].valid;
    assert.equal(validate(valid), true, ajv.errorsText(validate.errors));
    assert.equal(validate({ ...valid, completed: 'maybe' }), false);
    assert.equal(
      validate({
        ...valid,
        reports: [{ generatedAt: '2026-09-11T12:30:00.000Z', generatedBy: 'x', fileName: 'r.pdf', extra: 1 }],
      }),
      false
    );
  });
}

test('pending and confirmed publications fit every existing report schema without a migration', () => {
  const pending = {
    generatedAt: '2026-09-13T10:00:00.000Z',
    generatedBy: 'handler',
    fileName: 'Rapport_1_f0000000-0000-4000-8000-000000000001.pdf',
  };
  for (const artifact of artifacts.filter((item) => item.hasReport)) {
    const schema = readJson(artifact.schemaFile).value;
    const { ajv, validate } = createValidator(schema);
    for (const report of [pending, { ...pending, attachmentId: 'attachment-1' }]) {
      const value = { ...fixtures[artifact.name].valid, [schema['x-draken-completion'].reportsField]: [report] };
      assert.equal(validate(value), true, `${artifact.name}: ${ajv.errorsText(validate.errors)}`);
    }
  }
});

// The lex Sarah investigation template: the background is Draken's, apart from the investigator's own summary of the
// report, every text answer has the size the template gives it, and each of the five questions is answered Ja, Nej or
// Ej aktuellt - a No with a motivation that is offered but never required.
test('the lex Sarah investigation follows the investigation template', () => {
  const schema = readJson('utredning-sol-lss.schema-request.json').value;
  const uiSchema = readJson('utredning-sol-lss.ui-schema-request.json').value;
  const { validate } = createValidator(schema);

  for (const field of ['investigator', 'reportedEventDescription', 'reportReceivedDate']) {
    assert.equal(schema.properties[field].readOnly, true, `${field} is filled in by Draken`);
    assert.equal(uiSchema[field]['ui:readonly'], true, `${field} is locked in the form`);
  }

  const sizes = Object.fromEntries(
    Object.entries(uiSchema)
      .filter(([, field]: [string, any]) => field?.['ui:options']?.size)
      .map(([name, field]: [string, any]) => [name, field['ui:options'].size])
  );
  const large = Object.keys(sizes).filter((name) => sizes[name] === 'large');
  assert.deepEqual(large, [
    'reportedMisconduct',
    'discovery',
    'consequences',
    'gatheredInformation',
    'courseOfEvents',
    'timeline',
    'previousOccurrences',
    'eventAnalysis',
  ]);
  assert.ok(Object.values(sizes).every((size) => size === 'medium' || size === 'large'));

  // Verksamhetsuppföljning's Polisanmälan filter reads the answer under the name it had in 1.x.
  assert.equal(schema.properties.requiresPoliceReport.title, 'Ska ärendet polisanmälas?');

  // The summary is the investigator's, in Bakgrund, and required once the investigation is completed.
  assert.equal(schema.properties.reportSummary.readOnly, undefined);
  const background = uiSchema['ui:sections'].find((section: { id: string }) => section.id === 'background');
  assert.deepEqual(background.fields, [
    'investigator',
    'reportedEventDescription',
    'reportSummary',
    'reportReceivedDate',
  ]);

  const questions = [
    'individualNotified',
    'representativeNotified',
    'documentedInRecord',
    'feedbackGiven',
    'requiresPoliceReport',
  ];
  const completed = { legalBases: ['SOL', 'LSS'], reportSummary: '<p>Kvällsbesöket uteblev.</p>', completed: 'yes' };
  assert.equal(validate(completed), true);
  assert.equal(validate({ ...completed, reportSummary: undefined }), false);
  // From 2.4 each stance is Ja or Ej aktuellt. Nej is gone, and with it the motivation that belonged to a Nej.
  for (const question of questions) {
    for (const answer of ['yes', 'not_applicable']) {
      assert.equal(validate({ ...completed, [question]: answer }), true, `${question}: ${answer}`);
    }
    for (const answer of ['no', 'kanske']) {
      assert.equal(validate({ ...completed, [question]: answer }), false, `${question}: ${answer}`);
    }
    assert.equal(`${question}Motivation` in schema.properties, false);
    assert.equal(validate({ ...completed, [question]: 'yes', [`${question}Motivation`]: '<p>Därför.</p>' }), false);
  }
});
