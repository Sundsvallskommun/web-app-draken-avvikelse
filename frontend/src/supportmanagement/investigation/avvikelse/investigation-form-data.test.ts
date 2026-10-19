import assert from 'node:assert/strict';

import { getDefaultFormState, type RJSFSchema } from '@rjsf/utils';
import validator, { customizeValidator } from '@rjsf/validator-ajv8';
import Ajv2020 from 'ajv/dist/2020';
import { test } from 'vitest';

import {
  getInvestigationCompletion,
  getInvestigationRenderingSchema,
  getInvestigationReports,
  getInvestigationServerTimestamps,
  investigationDefaultFormStateBehavior,
  isInvestigationCompleted,
  normalizeInvestigationFormData,
  withReportedMisconductMark,
} from './investigation-form-data';
import hslDecisionSchemaRequest from './schemas/beslut-hsl.schema-request.json';
import solLssDecisionSchemaRequest from './schemas/beslut-sol-lss.schema-request.json';
import unitManagerSchemaRequest from './schemas/utredning-enhetschef.schema-request.json';

const choiceSchema: RJSFSchema = {
  type: 'object',
  required: ['answer', 'risk'],
  properties: {
    answer: {
      type: 'string',
      oneOf: [
        { const: 'yes', title: 'Ja' },
        { const: 'no', title: 'Nej' },
      ],
    },
    risk: {
      type: 'object',
      required: ['severity'],
      properties: {
        severity: {
          type: 'integer',
          oneOf: [
            { const: 1, title: 'Låg' },
            { const: 2, title: 'Hög' },
          ],
        },
      },
    },
    legalBases: { type: 'array', items: { type: 'string' }, default: ['SOL', 'LSS'] },
  },
};

test('leaves unanswered investigation choices empty and invalid when required', () => {
  const data = getDefaultFormState(
    validator,
    choiceSchema,
    {},
    choiceSchema,
    false,
    investigationDefaultFormStateBehavior
  );

  assert.equal(data.answer, undefined);
  assert.equal(data.risk?.severity, undefined);
  assert.deepEqual(data.legalBases, ['SOL', 'LSS']);
  const result = validator.validateFormData(data, choiceSchema);
  assert(result.errors.some((error) => error.name === 'required' && error.params.missingProperty === 'answer'));
  // No empty object is defaulted for the unanswered risk, so it is the object itself that is missing.
  assert(result.errors.some((error) => error.name === 'required' && error.params.missingProperty === 'risk'));
});

test('preserves saved answers, including the first option, instead of treating them as unanswered', () => {
  for (const answer of ['yes', 'no']) {
    for (const severity of [1, 2]) {
      const saved = { answer, risk: { severity }, legalBases: ['HSL'] };
      const data = getDefaultFormState(
        validator,
        choiceSchema,
        saved,
        choiceSchema,
        false,
        investigationDefaultFormStateBehavior
      );

      assert.deepEqual(data, saved);
      assert.equal(validator.validateFormData(data, choiceSchema).errors.length, 0);
    }
  }
});

test('normalizes nested values through root-level local schema references', () => {
  const schema: RJSFSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      section: { $ref: '#/$defs/section' },
    },
    $defs: {
      section: {
        type: 'object',
        additionalProperties: false,
        properties: {
          retained: { type: 'string' },
        },
      },
    },
  };

  assert.deepEqual(
    normalizeInvestigationFormData('future-schema', schema, {
      section: {
        retained: 'behålls',
        stale: 'tas bort',
      },
    }),
    {
      section: {
        retained: 'behålls',
      },
    }
  );
});

// The published requests keep literal types; RJSF's JSONSchema7 needs the widened shape.
const hslDecisionSchema = hslDecisionSchemaRequest.value as unknown as RJSFSchema;
const solLssDecisionSchema = solLssDecisionSchemaRequest.value as unknown as RJSFSchema;
const decisions = [
  { key: 'beslut-hsl', schema: hslDecisionSchema, answers: {} },
  {
    key: 'beslut-sol-lss',
    schema: solLssDecisionSchema,
    answers: { decidedMisconductDegree: 'misconduct', decisionMotivation: '<p>Missförhållande.</p>' },
  },
] as const;

// The IVO and Public 360 case numbers only exist once the errand is reported to IVO. Whatever
// the form still holds from an earlier answer is dropped.
for (const decision of decisions) {
  test(`${decision.key} normalization drops both case numbers unless the errand is reported to IVO`, () => {
    const notReported = normalizeInvestigationFormData(decision.key, decision.schema, {
      ...decision.answers,
      decidedAt: '2026-09-11T12:30:00.000Z',
      ivoNotification: 'no',
      ivoCaseNumber: 'IVO-stale',
      public360CaseNumber: 'P360-stale',
    });
    // The server's timestamp is dropped along with the case numbers; the BFF stamps it anew.
    assert.deepEqual(notReported, {
      ...decision.answers,
      ivoNotification: 'no',
    });

    const reported = {
      ...decision.answers,
      ivoNotification: 'yes',
      ivoCaseNumber: 'IVO-1',
      public360CaseNumber: 'P360-1',
    };
    assert.deepEqual(normalizeInvestigationFormData(decision.key, decision.schema, reported), reported);

    const unanswered = normalizeInvestigationFormData(decision.key, decision.schema, {
      ...decision.answers,
      ivoCaseNumber: 'IVO-early',
      public360CaseNumber: 'P360-early',
      unknown: 1,
    });
    assert.deepEqual(unanswered, decision.answers);
  });

  test(`the ${decision.key} rendering schema hides the case numbers the normalization drops`, () => {
    const fields = (formData: Record<string, unknown>) =>
      Object.keys(getInvestigationRenderingSchema(decision.key, decision.schema, formData).properties ?? {});
    const allFields = Object.keys(decision.schema.properties ?? {});
    const withoutCaseNumbers = allFields.filter(
      (field) => field !== 'ivoCaseNumber' && field !== 'public360CaseNumber'
    );

    assert.deepEqual(fields({}), withoutCaseNumbers);
    assert.deepEqual(fields({ ivoNotification: 'no' }), withoutCaseNumbers);
    assert.deepEqual(fields({ ivoNotification: 'yes' }), allFields);
    // The source schema is not touched.
    assert.ok(decision.schema.properties && 'public360CaseNumber' in decision.schema.properties);
  });
}

test('the HSL investigation keeps only the IVO case number rule, for documents still bound to 1.0', () => {
  const legacyHsl: RJSFSchema = {
    type: 'object',
    properties: {
      ivoNotification: { type: 'string' },
      ivoCaseNumber: { type: 'string' },
      public360CaseNumber: { type: 'string' },
    },
  };
  assert.deepEqual(
    normalizeInvestigationFormData('utredning-hsl', legacyHsl, {
      ivoNotification: 'no',
      ivoCaseNumber: 'IVO-stale',
      public360CaseNumber: 'P360-kept',
    }),
    { ivoNotification: 'no', public360CaseNumber: 'P360-kept' }
  );
});

test('reports the server-stamped timestamps the schema declares and the document carries', () => {
  assert.deepEqual(getInvestigationServerTimestamps(solLssDecisionSchema, {}), []);
  assert.deepEqual(
    getInvestigationServerTimestamps(solLssDecisionSchema, {
      decidedAt: '2026-09-11T12:30:00.000Z',
      updatedAt: '2026-09-12T08:00:00.000Z',
      revisions: [{ savedAt: '2026-09-12T08:00:00.000Z', savedBy: 'iaf.test' }],
    }),
    [
      { name: 'decidedAt', label: 'Beslutat', value: '2026-09-11T12:30:00.000Z' },
      { name: 'updatedAt', label: 'Senast ändrat', value: '2026-09-12T08:00:00.000Z' },
    ]
  );
  assert.deepEqual(
    getInvestigationServerTimestamps(solLssDecisionSchema, { decidedAt: '  ', ivoNotification: 'no' }),
    []
  );
  assert.deepEqual(getInvestigationServerTimestamps(choiceSchema, { answer: 'yes' }), []);
});

test('reads the completion declaration, the completed state and the report log the schema declares', () => {
  const schema: RJSFSchema = {
    type: 'object',
    'x-draken-completion': { field: 'completed', reportsField: 'reports' },
    properties: { completed: { type: 'string' }, reports: { type: 'array' } },
  } as RJSFSchema;
  const report = { generatedAt: '2026-09-11T12:30:00.000Z', generatedBy: 'iaf.test', fileName: 'Utredning HSL_1.pdf' };

  assert.deepEqual(getInvestigationCompletion(schema), { field: 'completed', reportsField: 'reports' });
  assert.equal(getInvestigationCompletion(choiceSchema), undefined);
  assert.equal(isInvestigationCompleted(schema, { completed: 'yes' }), true);
  assert.equal(isInvestigationCompleted(schema, { completed: 'no' }), false);
  assert.equal(isInvestigationCompleted(schema, {}), false);
  assert.equal(isInvestigationCompleted(choiceSchema, { completed: 'yes' }), false);
  assert.deepEqual(getInvestigationReports(schema, {}), []);
  assert.deepEqual(
    getInvestigationReports(schema, { reports: [report, { fileName: 'broken' }, { ...report, attachmentId: 'a-1' }] }),
    [report, { ...report, attachmentId: 'a-1' }]
  );
  assert.deepEqual(getInvestigationReports(choiceSchema, { reports: [report] }), []);
});

// The server's own properties never ride along in the form: RJSF would default the report log to
// an empty list and the BFF would strip it again, which read as an unsaved change after every save.
test('normalization drops server-controlled properties, whatever the form or the server holds', () => {
  const schema: RJSFSchema = {
    type: 'object',
    properties: {
      note: { type: 'string' },
      reports: { type: 'array', 'x-draken-server-owned': true },
      decidedAt: { type: 'string', 'x-draken-server-timestamp': 'created' },
      revisions: { type: 'array', 'x-draken-server-revisions': true },
    },
  } as RJSFSchema;
  assert.deepEqual(
    normalizeInvestigationFormData('utredning-hsl', schema, {
      note: 'kept',
      reports: [],
      decidedAt: '2026-09-11T12:30:00.000Z',
      revisions: [{ savedAt: 'x', savedBy: 'y' }],
    }),
    { note: 'kept' }
  );
  assert.deepEqual(
    normalizeInvestigationFormData('utredning-hsl', solLssDecisionSchema, { ivoNotification: 'no', reports: [] }),
    {
      ivoNotification: 'no',
    }
  );
});

// Untouched multi-selects emit [] on mount; a stored document without those keys must not read
// as changed, so an empty list normalizes to no answer at all.
// An emptied rich-text editor leaves `<p><br></p>`, which `required` and `minLength` would take for an
// answer. That is how a Beslut SoL/LSS could be saved without its motivation.
test('normalization treats rich text without words as unanswered, so a required motivation is missed', () => {
  const normalized = normalizeInvestigationFormData('beslut-sol-lss', solLssDecisionSchema, {
    decisionMotivation: '<p><br></p>',
  });

  // The decision schema requires the motivation, so an answer left out is one the save refuses.
  assert.ok(solLssDecisionSchema.required?.includes('decisionMotivation'));
  assert.equal('decisionMotivation' in normalized, false);
});

test('normalization keeps rich text that has words, and plain text it does not read as markup', () => {
  const schema: RJSFSchema = {
    type: 'object',
    properties: {
      motivation: { type: 'string', contentMediaType: 'text/html' },
      note: { type: 'string' },
    },
  };
  assert.deepEqual(
    normalizeInvestigationFormData('utredning-hsl', schema, { motivation: '<p>Skäl&nbsp;</p>', note: '<p><br></p>' }),
    { motivation: '<p>Skäl&nbsp;</p>', note: '<p><br></p>' }
  );
});

test('normalization drops empty root arrays and keeps answered ones', () => {
  const schema: RJSFSchema = {
    type: 'object',
    properties: {
      causeAreas: { type: 'array', items: { type: 'string' } },
      legalBases: { type: 'array', items: { type: 'string' } },
      note: { type: 'string' },
    },
  };
  assert.deepEqual(
    normalizeInvestigationFormData('utredning-hsl', schema, { causeAreas: [], legalBases: ['HSL'], note: '' }),
    {
      legalBases: ['HSL'],
      note: '',
    }
  );
});

const unitManagerSchema = unitManagerSchemaRequest.value as unknown as RJSFSchema;
// The published schemas are draft 2020-12, which is what the form validates them as. A validator keeps what it
// compiled under a schema's $id, and the rendering schemas share theirs, so each is validated by a validator of
// its own.
const formErrors = (schema: RJSFSchema, formData: unknown) =>
  customizeValidator({ AjvClass: Ajv2020 }).validateFormData(formData, schema).errors;
const unitManagerMisconduct = { legalBases: ['SOL', 'LSS'] };
const socialRisk = { probability: 2, severity: 3, calculatedRiskValue: 6 };

test('the unit manager investigation carries the errand’s own answer to whether it is a misconduct', () => {
  const marked = withReportedMisconductMark('utredning-enhetschef', unitManagerSchema, unitManagerMisconduct, true);
  assert.deepEqual(marked, { ...unitManagerMisconduct, reportedMisconduct: true });
  // The BFF owns the stored value, so normalization drops it and the errand's answer is put back after it.
  assert.deepEqual(normalizeInvestigationFormData('utredning-enhetschef', unitManagerSchema, marked), {
    ...unitManagerMisconduct,
  });
  assert.equal(
    withReportedMisconductMark('utredning-enhetschef', unitManagerSchema, marked, false).reportedMisconduct,
    false
  );

  // Another document is not the unit manager's, and a document bound to an earlier version keeps its rules.
  assert.equal(
    withReportedMisconductMark('utredning-sol-lss', unitManagerSchema, unitManagerMisconduct, true),
    unitManagerMisconduct
  );
  const { reportedMisconduct: _mark, ...earlierProperties } = unitManagerSchema.properties ?? {};
  const earlierSchema = { ...unitManagerSchema, properties: earlierProperties };
  assert.equal(
    withReportedMisconductMark('utredning-enhetschef', earlierSchema, unitManagerMisconduct, true),
    unitManagerMisconduct
  );
});

test('a misconduct is not risk-assessed by the unit manager, and the investigation is complete without it', () => {
  const misconduct = { ...unitManagerMisconduct, reportedMisconduct: true };
  const rendered = getInvestigationRenderingSchema('utredning-enhetschef', unitManagerSchema, misconduct);
  assert.equal(rendered.properties?.riskAssessmentSolLss, undefined);
  assert.notEqual(rendered.properties?.suspectedMisconduct, undefined);
  assert.deepEqual(formErrors(rendered, { ...misconduct, completed: 'yes' }), []);

  // A deviation under the same legal bases is risk-assessed, and is not complete until it is.
  const deviation = { ...unitManagerMisconduct, reportedMisconduct: false };
  const renderedDeviation = getInvestigationRenderingSchema('utredning-enhetschef', unitManagerSchema, deviation);
  assert.notEqual(renderedDeviation.properties?.riskAssessmentSolLss, undefined);
  assert.notDeepEqual(formErrors(renderedDeviation, { ...deviation, completed: 'yes' }), []);
});

test('a risk assessment made while the errand was a deviation stays in a misconduct’s investigation', () => {
  const escalated = { ...unitManagerMisconduct, reportedMisconduct: true, riskAssessmentSolLss: socialRisk };
  const rendered = getInvestigationRenderingSchema('utredning-enhetschef', unitManagerSchema, escalated);
  assert.notEqual(rendered.properties?.riskAssessmentSolLss, undefined);
  assert.deepEqual(
    normalizeInvestigationFormData('utredning-enhetschef', unitManagerSchema, escalated).riskAssessmentSolLss,
    socialRisk
  );
  assert.deepEqual(formErrors(rendered, { ...escalated, completed: 'yes' }), []);
});

// From 1.10 the legal bases choose the template that fills the investigation text. A document bound to an earlier
// version still has a template choice, which normalization keeps among the templates its legal bases allow.
test('only a unit manager investigation bound to a version with a template choice keeps the choice in step', () => {
  const templateChoice: RJSFSchema = {
    type: 'string',
    oneOf: [
      { const: 'sol_lss', title: 'SOL/LSS utredning' },
      { const: 'hsl', title: 'HSL utredning' },
      { const: 'sol_lss_hsl', title: 'SOL/LSS/HSL utredning' },
    ],
  };
  const earlierSchema: RJSFSchema = {
    ...unitManagerSchema,
    properties: { ...unitManagerSchema.properties, investigationTemplate: templateChoice },
  };
  const normalizedTemplate = (schema: RJSFSchema, formData: Record<string, unknown>) =>
    normalizeInvestigationFormData('utredning-enhetschef', schema, formData).investigationTemplate;

  assert.equal(normalizedTemplate(earlierSchema, { legalBases: ['SOL'] }), 'sol_lss');
  assert.equal(normalizedTemplate(earlierSchema, { legalBases: ['SOL'], investigationTemplate: 'hsl' }), 'sol_lss');
  assert.equal(normalizedTemplate(earlierSchema, { legalBases: ['SOL', 'HSL'], investigationTemplate: 'hsl' }), 'hsl');
  assert.equal(normalizedTemplate(earlierSchema, { legalBases: ['SOL', 'HSL'] }), undefined);

  assert.equal(normalizedTemplate(unitManagerSchema, { legalBases: ['SOL'] }), undefined);
});

// The police report question is HSL's, as the HSL risk assessment is: it leaves with HSL, answer and all.
test('the unit manager investigation drops the HSL police report with HSL, and keeps it while HSL applies', () => {
  const answered = { legalBases: ['HSL', 'SOL'], requiresPoliceReport: 'yes' };

  assert.equal(
    normalizeInvestigationFormData('utredning-enhetschef', unitManagerSchema, answered).requiresPoliceReport,
    'yes'
  );
  assert.equal(
    normalizeInvestigationFormData('utredning-enhetschef', unitManagerSchema, { ...answered, legalBases: ['SOL'] })
      .requiresPoliceReport,
    undefined
  );
  assert.equal(
    getInvestigationRenderingSchema('utredning-enhetschef', unitManagerSchema, { legalBases: ['SOL'] }).properties
      ?.requiresPoliceReport,
    undefined
  );
  assert.notEqual(
    getInvestigationRenderingSchema('utredning-enhetschef', unitManagerSchema, answered).properties
      ?.requiresPoliceReport,
    undefined
  );
});
