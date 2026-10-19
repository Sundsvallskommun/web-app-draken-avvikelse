import { visibleMarkupText } from '@common/utils/visible-markup-text';
import type { RJSFSchema } from '@rjsf/utils';

import type { InvestigationFormData } from './investigation-document';

const TEMPLATE_FIELD = 'investigationTemplate';
const TEXT_FIELD = 'investigationText';
const LEGAL_BASES_FIELD = 'legalBases';

const HSL_LEGAL_BASE = 'HSL';
const SOCIAL_LEGAL_BASES: readonly string[] = ['SOL', 'LSS'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Prefix of the Templating API identifiers that hold the text an investigation template starts from. */
export const INVESTIGATION_TEXT_TEMPLATE_PREFIX = 'avvikelse.investigation.';

/**
 * The Templating API identifier of a template, by the repository's `{app}.{type}.{variant}` convention. The variant
 * is the template's value with dashes, since identifiers allow no underscores: `sol_lss_hsl` →
 * `avvikelse.investigation.sol-lss-hsl`. A template without a stored text simply has nothing to fill in.
 */
export const investigationTextTemplateIdentifier = (template: string): string =>
  `${INVESTIGATION_TEXT_TEMPLATE_PREFIX}${template.replaceAll('_', '-')}`;

const hasRichInvestigationText = (properties: Record<string, unknown>): boolean => {
  const text = properties[TEXT_FIELD];
  return isRecord(text) && text.contentMediaType === 'text/html';
};

/**
 * Whether the investigator chooses the template that fills the investigation text: the schema has a template choice
 * and a rich-text investigation text. Up to utredning-enhetschef 1.9, which documents bound to them keep.
 */
export const offersInvestigationTextTemplates = (schema: RJSFSchema | undefined): boolean => {
  const properties = schema?.properties;
  return isRecord(properties) && isRecord(properties[TEMPLATE_FIELD]) && hasRichInvestigationText(properties);
};

/**
 * Whether the legal bases choose the template that fills the investigation text: the schema has legal bases and a
 * rich-text investigation text, and no template choice of its own. From utredning-enhetschef 1.10.
 */
export const followsLegalBasesTemplate = (schema: RJSFSchema | undefined): boolean => {
  const properties = schema?.properties;
  return (
    isRecord(properties) &&
    isRecord(properties[LEGAL_BASES_FIELD]) &&
    !isRecord(properties[TEMPLATE_FIELD]) &&
    hasRichInvestigationText(properties)
  );
};

/**
 * The template the legal bases call for: SOL/LSS/HSL wherever HSL is one of them, SOL/LSS where SoL or LSS are and
 * HSL is not, and none before a legal base is chosen.
 */
export const investigationTemplateForLegalBases = (legalBases: unknown): string | undefined => {
  if (!Array.isArray(legalBases)) return undefined;
  if (legalBases.includes(HSL_LEGAL_BASE)) return 'sol_lss_hsl';
  return legalBases.some((legalBase) => SOCIAL_LEGAL_BASES.includes(legalBase)) ? 'sol_lss' : undefined;
};

/** The template that fills the document's text now: the investigator's choice, or what its legal bases call for. */
export const chosenInvestigationTemplate = (
  schema: RJSFSchema | undefined,
  formData: InvestigationFormData | undefined
): string | undefined => {
  const template = followsLegalBasesTemplate(schema)
    ? investigationTemplateForLegalBases(formData?.[LEGAL_BASES_FIELD])
    : formData?.[TEMPLATE_FIELD];
  return typeof template === 'string' ? template : undefined;
};

/** The template a change of the form moved the document to, or undefined when it did not move to one. */
export const changedInvestigationTemplate = (
  schema: RJSFSchema | undefined,
  previous: InvestigationFormData | undefined,
  next: InvestigationFormData
): string | undefined => {
  const template = chosenInvestigationTemplate(schema, next);
  return template !== undefined && template !== chosenInvestigationTemplate(schema, previous) ? template : undefined;
};

/**
 * Whether a template may replace the investigation text without asking: when the text is empty, or still exactly
 * the text of a template - one an earlier choice put there, or any the templates hold.
 */
export const investigationTextIsReplaceable = (
  text: unknown,
  templateTexts: readonly (string | undefined)[]
): boolean => {
  // Compared by words, so that the editor's own reformatting does not count as an edit.
  const current = visibleMarkupText(text);
  return (
    current === '' ||
    templateTexts.some((templateText) => templateText !== undefined && current === visibleMarkupText(templateText))
  );
};

export const readInvestigationText = (formData: InvestigationFormData | undefined): unknown => formData?.[TEXT_FIELD];

export const withInvestigationText = (formData: InvestigationFormData, text: string): InvestigationFormData => ({
  ...formData,
  [TEXT_FIELD]: text,
});
