import assert from 'node:assert/strict';

import type { RJSFSchema } from '@rjsf/utils';
import { test } from 'vitest';

import {
  changedInvestigationTemplate,
  chosenInvestigationTemplate,
  followsLegalBasesTemplate,
  investigationTemplateForLegalBases,
  investigationTextIsReplaceable,
  investigationTextTemplateIdentifier,
  offersInvestigationTextTemplates,
  withInvestigationText,
} from './investigation-text-template';

const richText: RJSFSchema = { type: 'string', contentMediaType: 'text/html' };
const legalBases: RJSFSchema = { type: 'array', items: { type: 'string', enum: ['SOL', 'LSS', 'HSL'] } };

/** Up to utredning-enhetschef 1.9: the investigator chooses the template. */
const templateChoiceSchema: RJSFSchema = {
  type: 'object',
  properties: {
    legalBases,
    investigationTemplate: { type: 'string', oneOf: [{ const: 'sol_lss', title: 'SOL/LSS utredning' }] },
    investigationText: richText,
  },
};

/** From utredning-enhetschef 1.10: the legal bases choose it. */
const legalBasesSchema: RJSFSchema = {
  type: 'object',
  properties: { legalBases, investigationText: richText },
};

test('names the Templating API identifier after the template, dashed', () => {
  assert.equal(investigationTextTemplateIdentifier('sol_lss'), 'avvikelse.investigation.sol-lss');
  assert.equal(investigationTextTemplateIdentifier('sol_lss_hsl'), 'avvikelse.investigation.sol-lss-hsl');
});

test('lets the investigator choose the template only where the schema has a template choice', () => {
  assert.equal(offersInvestigationTextTemplates(templateChoiceSchema), true);
  assert.equal(offersInvestigationTextTemplates(legalBasesSchema), false);
  assert.equal(
    offersInvestigationTextTemplates({
      ...templateChoiceSchema,
      properties: { ...templateChoiceSchema.properties, investigationText: { type: 'string' } },
    }),
    false
  );
  assert.equal(offersInvestigationTextTemplates(undefined), false);
});

test('lets the legal bases choose the template only where the schema has no template choice of its own', () => {
  assert.equal(followsLegalBasesTemplate(legalBasesSchema), true);
  assert.equal(followsLegalBasesTemplate(templateChoiceSchema), false);
  assert.equal(
    followsLegalBasesTemplate({ type: 'object', properties: { legalBases, investigationText: { type: 'string' } } }),
    false
  );
  assert.equal(followsLegalBasesTemplate({ type: 'object', properties: { investigationText: richText } }), false);
  assert.equal(followsLegalBasesTemplate(undefined), false);
});

test('calls for SOL/LSS/HSL wherever HSL is a legal base, and SOL/LSS otherwise', () => {
  assert.equal(investigationTemplateForLegalBases(['HSL']), 'sol_lss_hsl');
  assert.equal(investigationTemplateForLegalBases(['SOL', 'HSL']), 'sol_lss_hsl');
  assert.equal(investigationTemplateForLegalBases(['LSS', 'HSL']), 'sol_lss_hsl');
  assert.equal(investigationTemplateForLegalBases(['SOL', 'LSS', 'HSL']), 'sol_lss_hsl');
  assert.equal(investigationTemplateForLegalBases(['SOL']), 'sol_lss');
  assert.equal(investigationTemplateForLegalBases(['LSS']), 'sol_lss');
  assert.equal(investigationTemplateForLegalBases(['SOL', 'LSS']), 'sol_lss');
});

test('calls for no template before a legal base is chosen', () => {
  assert.equal(investigationTemplateForLegalBases([]), undefined);
  assert.equal(investigationTemplateForLegalBases(undefined), undefined);
  assert.equal(investigationTemplateForLegalBases('HSL'), undefined);
});

test('reads the chosen template from what the schema lets choose it', () => {
  const formData = { legalBases: ['SOL'], investigationTemplate: 'sol_lss_hsl' };

  assert.equal(chosenInvestigationTemplate(templateChoiceSchema, formData), 'sol_lss_hsl');
  assert.equal(chosenInvestigationTemplate(legalBasesSchema, formData), 'sol_lss');
  assert.equal(chosenInvestigationTemplate(legalBasesSchema, undefined), undefined);
});

test('reports a template only when the investigator chooses another one', () => {
  const changed = (previous: Record<string, unknown> | undefined, next: Record<string, unknown>) =>
    changedInvestigationTemplate(templateChoiceSchema, previous, next);

  assert.equal(changed({}, { investigationTemplate: 'sol_lss' }), 'sol_lss');
  assert.equal(changed({ investigationTemplate: 'sol_lss' }, { investigationTemplate: 'sol_lss_hsl' }), 'sol_lss_hsl');
  assert.equal(changed({ investigationTemplate: 'sol_lss' }, { investigationTemplate: 'sol_lss' }), undefined);
  assert.equal(changed({ investigationTemplate: 'sol_lss' }, {}), undefined);
  assert.equal(changed(undefined, { investigationTemplate: 'sol_lss' }), 'sol_lss');
});

test('reports a template only when a change of the legal bases calls for another one', () => {
  const changed = (previous: readonly string[] | undefined, next: readonly string[]) =>
    changedInvestigationTemplate(legalBasesSchema, previous && { legalBases: previous }, { legalBases: next });

  assert.equal(changed([], ['SOL']), 'sol_lss');
  assert.equal(changed(['SOL'], ['SOL', 'LSS']), undefined);
  assert.equal(changed(['SOL'], ['SOL', 'HSL']), 'sol_lss_hsl');
  assert.equal(changed(['SOL', 'HSL'], ['HSL']), undefined);
  assert.equal(changed(['SOL', 'HSL'], ['SOL']), 'sol_lss');
  assert.equal(changed(['SOL'], []), undefined);
  assert.equal(changed(undefined, ['HSL']), 'sol_lss_hsl');
});

test('replaces an empty text, including what the editor leaves behind when emptied', () => {
  assert.equal(investigationTextIsReplaceable(undefined, []), true);
  assert.equal(investigationTextIsReplaceable('', []), true);
  assert.equal(investigationTextIsReplaceable('<p><br></p>', []), true);
  assert.equal(investigationTextIsReplaceable('<p>&nbsp; </p>', []), true);
});

test('replaces the text of any template, however the editor reformatted it', () => {
  const solLss = '<h2>Berörda personer</h2><p>[Komplettera]</p><p><br></p>';
  const solLssHsl = '<h2>Varför inträffade händelsen?</h2><p>[Komplettera]</p>';

  assert.equal(
    investigationTextIsReplaceable('<h2>Berörda personer</h2>\n<p>[Komplettera]</p>', [solLss, solLssHsl]),
    true
  );
  assert.equal(investigationTextIsReplaceable(solLssHsl, [undefined, solLss, solLssHsl]), true);
  assert.equal(investigationTextIsReplaceable('<h2>Berörda personer</h2><p>Anna och Bo</p>', [solLss]), false);
  assert.equal(investigationTextIsReplaceable('<p>Egen text</p>', [undefined]), false);
});

test('writes the text without touching the rest of the document', () => {
  assert.deepEqual(withInvestigationText({ legalBases: ['SOL'], investigationText: 'old' }, '<p>new</p>'), {
    legalBases: ['SOL'],
    investigationText: '<p>new</p>',
  });
});
