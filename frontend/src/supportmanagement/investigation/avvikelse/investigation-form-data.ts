import { isBlankMarkup } from '@common/utils/visible-markup-text';
import type { Experimental_DefaultFormStateBehavior, RJSFSchema } from '@rjsf/utils';

import {
  HSL_DECISION_SCHEMA_NAME,
  HSL_INVESTIGATION_SCHEMA_NAME,
  LEX_DECISION_SCHEMA_NAME,
  UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME,
} from './avvikelse-schema-names';
import type { InvestigationFormData } from './investigation-document';

// A choice's first option is not an answer, and an untouched list is not an empty list. Keep
// unanswered oneOf fields empty and add no empty arrays or objects as defaults, while preserving
// saved answers and explicit non-empty schema defaults such as the SoL/LSS legal bases. Without
// this, RJSF fills every untouched array with [] on mount, and a stored document that lacks those
// keys reads as changed the moment it is opened or saved.
export const investigationDefaultFormStateBehavior: Experimental_DefaultFormStateBehavior = Object.freeze({
  constAsDefaults: 'skipOneOf',
  emptyObjectFields: 'skipEmptyDefaults',
});

/** Investigation and decision forms spell the required marker out rather than using an asterisk. */
export const investigationRequiredIndicator = ' (Obligatorisk)';

interface CalculationMetadata {
  formula: 'probability * severity';
  inputs: readonly [string, string];
  result: string;
}

const managerInvestigationTemplates = ['sol_lss', 'hsl', 'sol_lss_hsl'] as const;
type ManagerInvestigationTemplate = (typeof managerInvestigationTemplates)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function resolveLocalReference(schema: RJSFSchema | boolean, rootSchema: RJSFSchema): RJSFSchema | boolean {
  if (typeof schema === 'boolean' || typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/$defs/')) {
    return schema;
  }

  const definitionName = schema.$ref.slice('#/$defs/'.length);
  const definition = rootSchema.$defs?.[definitionName];
  if (!isRecord(definition)) return schema;

  const { $ref: _reference, ...schemaSiblings } = schema;
  return { ...definition, ...schemaSiblings };
}

function pruneArrayToSchema(schema: RJSFSchema, value: unknown[], rootSchema: RJSFSchema): unknown[] {
  const { items } = schema;
  if (Array.isArray(items)) {
    return value.map((item, index) =>
      items[index] === undefined ? item : pruneValueToSchema(items[index], item, rootSchema)
    );
  }
  if (typeof items === 'boolean' || isRecord(items)) {
    return value.map((item) => pruneValueToSchema(items, item, rootSchema));
  }
  return value;
}

function pruneRecordToSchema(
  properties: Record<string, RJSFSchema | boolean>,
  value: Record<string, unknown>,
  rootSchema: RJSFSchema
): Record<string, unknown> {
  const prunedValue: Record<string, unknown> = {};
  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    if (!hasOwn(value, propertyName)) continue;
    const prunedPropertyValue = pruneValueToSchema(propertySchema, value[propertyName], rootSchema);
    if (prunedPropertyValue !== undefined) prunedValue[propertyName] = prunedPropertyValue;
  }
  return prunedValue;
}

function pruneValueToSchema(schema: RJSFSchema | boolean, value: unknown, rootSchema: RJSFSchema): unknown {
  const resolvedSchema = resolveLocalReference(schema, rootSchema);
  if (resolvedSchema === false) return undefined;
  if (resolvedSchema === true) return value;
  if (Array.isArray(value)) return pruneArrayToSchema(resolvedSchema, value, rootSchema);
  if (isRecord(value) && isRecord(resolvedSchema.properties)) {
    return pruneRecordToSchema(resolvedSchema.properties, value, rootSchema);
  }
  return value;
}

function getManagerLegalBaseFlags(formData: InvestigationFormData) {
  const legalBases = new Set(
    Array.isArray(formData.legalBases)
      ? formData.legalBases.filter((value): value is string => typeof value === 'string')
      : []
  );

  return {
    hasHsl: legalBases.has('HSL'),
    hasSolOrLss: legalBases.has('SOL') || legalBases.has('LSS'),
  };
}

/**
 * Whether the errand is a misconduct, as the unit manager's investigation records it from schema 1.8. The BFF
 * writes the stored value, from the errand's report type, on every save.
 */
const REPORTED_MISCONDUCT_FIELD = 'reportedMisconduct';

/**
 * The unit manager risk-assesses deviations, not misconducts. An assessment already made, while the errand was
 * a deviation, stays and is shown: nothing the unit manager answered is hidden from the people who read it.
 */
function showsSolLssRiskAssessment(formData: InvestigationFormData): boolean {
  if (!getManagerLegalBaseFlags(formData).hasSolOrLss) return false;
  return formData[REPORTED_MISCONDUCT_FIELD] !== true || hasOwn(formData, 'riskAssessmentSolLss');
}

/**
 * The form carries the errand's own answer to whether it is a misconduct, so the schema's rules - what is shown,
 * and what a completed investigation requires - hold before anything is saved. Only where the bound schema
 * declares the field: a document bound to an earlier version keeps that version's rules.
 */
export function withReportedMisconductMark(
  schemaName: string,
  schema: RJSFSchema,
  formData: InvestigationFormData,
  reportedMisconduct: boolean
): InvestigationFormData {
  if (schemaName !== UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME) return formData;
  if (!isRecord(schema.properties?.[REPORTED_MISCONDUCT_FIELD])) return formData;
  return { ...formData, [REPORTED_MISCONDUCT_FIELD]: reportedMisconduct };
}

function getAllowedManagerTemplates(formData: InvestigationFormData): ManagerInvestigationTemplate[] {
  const { hasHsl, hasSolOrLss } = getManagerLegalBaseFlags(formData);

  if (hasHsl && hasSolOrLss) return [...managerInvestigationTemplates];
  if (hasHsl) return ['hsl'];
  if (hasSolOrLss) return ['sol_lss'];
  return [];
}

/** The unit manager's fields that belong to HSL: shown with it, and gone with it. */
const MANAGER_HSL_FIELDS: readonly string[] = ['riskAssessmentHsl', 'requiresPoliceReport'];

function normalizeManagerConditions(schema: RJSFSchema, formData: InvestigationFormData): InvestigationFormData {
  const normalizedData = { ...formData };
  const { hasHsl, hasSolOrLss } = getManagerLegalBaseFlags(normalizedData);

  if (!hasHsl) MANAGER_HSL_FIELDS.forEach((field) => delete normalizedData[field]);
  if (!hasSolOrLss) {
    delete normalizedData.riskAssessmentSolLss;
    delete normalizedData.suspectedMisconduct;
  }

  // The template choice is gone from 1.10, where the legal bases choose the template themselves. Only a document
  // bound to an earlier version has a choice to keep in step with its legal bases.
  if (!isRecord(schema.properties) || !isRecord(schema.properties.investigationTemplate)) return normalizedData;

  const allowedTemplates = getAllowedManagerTemplates(normalizedData);
  const selectedTemplate = normalizedData.investigationTemplate;
  const selectedTemplateIsAllowed =
    typeof selectedTemplate === 'string' && (allowedTemplates as readonly string[]).includes(selectedTemplate);
  if (!selectedTemplateIsAllowed) {
    if (allowedTemplates.length === 1) {
      normalizedData.investigationTemplate = allowedTemplates[0];
    } else {
      delete normalizedData.investigationTemplate;
    }
  }

  return normalizedData;
}

/**
 * The IVO case number only exists once the errand is reported to IVO. The HSL investigation carried
 * this decision up to schema 1.0, so documents still bound to that version keep the rule; from 1.1
 * it lives in the decision documents, where the Public 360 number follows the same answer.
 */
const IVO_INVESTIGATION_SCHEMA_NAMES: readonly string[] = [HSL_INVESTIGATION_SCHEMA_NAME];

/** The decision documents: IVO and Public 360 case numbers exist only for a report to IVO. */
const DECISION_SCHEMA_NAMES: readonly string[] = [HSL_DECISION_SCHEMA_NAME, LEX_DECISION_SCHEMA_NAME];

const isReportedToIvo = (formData: InvestigationFormData): boolean => formData.ivoNotification === 'yes';

function dropUnlessReportedToIvo(formData: InvestigationFormData, fields: readonly string[]): InvestigationFormData {
  if (isReportedToIvo(formData)) return formData;
  const present = fields.filter((field) => hasOwn(formData, field));
  if (present.length === 0) return formData;

  const normalizedData = { ...formData };
  for (const field of present) delete normalizedData[field];
  return normalizedData;
}

/**
 * The decision schemas keep both case numbers ordinary optional properties, so the sections
 * template has no conditional rule to hide them by. Hiding them here keeps the form from showing
 * fields the normalization above would then drop.
 */
function getDecisionRenderingSchema(schema: RJSFSchema, formData: InvestigationFormData): RJSFSchema {
  if (isReportedToIvo(formData)) return schema;

  const properties = { ...schema.properties };
  delete properties.ivoCaseNumber;
  delete properties.public360CaseNumber;
  return { ...schema, properties };
}

export interface InvestigationServerTimestamp {
  readonly name: string;
  readonly label: string;
  readonly value: string;
}

const SERVER_TIMESTAMP_MODES: readonly unknown[] = ['created', 'updated'];

/**
 * The properties the schema marks `x-draken-server-timestamp` (`created` is stamped once, `updated`
 * on every write), with the values the document carries. The BFF stamps them; the form only
 * reports them.
 */
export function getInvestigationServerTimestamps(
  schema: RJSFSchema,
  formData: InvestigationFormData
): InvestigationServerTimestamp[] {
  return Object.entries(schema.properties ?? {}).flatMap(([name, property]) => {
    if (!isRecord(property) || !SERVER_TIMESTAMP_MODES.includes(property['x-draken-server-timestamp'])) return [];
    const value = formData[name];
    if (typeof value !== 'string' || value.trim().length === 0) return [];
    return [{ name, label: typeof property.title === 'string' ? property.title : name, value }];
  });
}

function readCalculationMetadata(value: unknown): CalculationMetadata | undefined {
  if (!isRecord(value)) return undefined;
  if (value.formula !== 'probability * severity' || !Array.isArray(value.inputs) || value.inputs.length !== 2) {
    return undefined;
  }
  if (!value.inputs.every((input) => typeof input === 'string') || typeof value.result !== 'string') return undefined;

  return {
    formula: value.formula,
    inputs: [value.inputs[0], value.inputs[1]],
    result: value.result,
  };
}

function applyDeclaredCalculations(schema: RJSFSchema, formData: InvestigationFormData): InvestigationFormData {
  let normalizedData = formData;

  for (const [propertyName, propertySchema] of Object.entries(schema.properties ?? {})) {
    if (!isRecord(propertySchema)) continue;

    const calculation = readCalculationMetadata(propertySchema['x-calculation']);
    const calculationTarget = normalizedData[propertyName];
    if (!calculation || !isRecord(calculationTarget)) continue;

    const [leftInput, rightInput] = calculation.inputs;
    const leftValue = calculationTarget[leftInput];
    const rightValue = calculationTarget[rightInput];
    const nextTarget = { ...calculationTarget };

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      nextTarget[calculation.result] = leftValue * rightValue;
    } else {
      delete nextTarget[calculation.result];
    }

    if (normalizedData === formData) normalizedData = { ...formData };
    normalizedData[propertyName] = nextTarget;
  }

  return normalizedData;
}

/**
 * The root properties the server writes: timestamps, revision logs, who the document is by and
 * server-owned values such as the report log. They are read from the stored document, never carried in
 * the form, so the form neither sends them nor treats the server's copy of them as an unsaved change.
 */
const isServerControlledProperty = (property: unknown): boolean =>
  isRecord(property) &&
  (property['x-draken-server-timestamp'] !== undefined ||
    property['x-draken-server-revisions'] === true ||
    property['x-draken-server-author'] !== undefined ||
    property['x-draken-server-owned'] === true);

/**
 * An empty list is no answer: the widgets emit `[]` for untouched multi-selects, and a stored
 * document that lacks the key must not read as changed. Dropping empty root arrays makes the
 * canonical form independent of which widget rendered it.
 */
function dropEmptyArrays(formData: InvestigationFormData): InvestigationFormData {
  const emptyArrays = Object.entries(formData)
    .filter(([, value]) => Array.isArray(value) && value.length === 0)
    .map(([name]) => name);
  if (emptyArrays.length === 0) return formData;

  const answered = { ...formData };
  for (const name of emptyArrays) delete answered[name];
  return answered;
}

/**
 * A rich-text answer without words is no answer either: an editor that was typed in and emptied
 * leaves `<p><br></p>`, which would otherwise satisfy a required motivation. Every rich-text field the
 * investigation schemas declare is a root property.
 */
function dropBlankMarkup(schema: RJSFSchema, formData: InvestigationFormData): InvestigationFormData {
  const blank = Object.entries(schema.properties ?? {})
    .filter(
      ([name, property]) =>
        isRecord(property) && property.contentMediaType === 'text/html' && isBlankMarkup(formData[name])
    )
    .map(([name]) => name);
  if (blank.length === 0) return formData;

  const answered = { ...formData };
  for (const name of blank) delete answered[name];
  return answered;
}

function dropServerControlledProperties(schema: RJSFSchema, formData: InvestigationFormData): InvestigationFormData {
  const serverControlled = Object.entries(schema.properties ?? {})
    .filter(([name, property]) => isServerControlledProperty(property) && hasOwn(formData, name))
    .map(([name]) => name);
  if (serverControlled.length === 0) return formData;

  const clientData = { ...formData };
  for (const name of serverControlled) delete clientData[name];
  return clientData;
}

/**
 * Canonical adapter from untrusted browser/RJSF values to one investigation
 * document. Unknown, server-controlled and conditionally inapplicable values are removed before
 * calculations declared by the schema are applied.
 */
export function normalizeInvestigationFormData(
  schemaName: string,
  schema: RJSFSchema,
  formData: InvestigationFormData
): InvestigationFormData {
  const prunedData = pruneValueToSchema(schema, formData, schema);
  const schemaOwnedData = dropBlankMarkup(
    schema,
    dropEmptyArrays(dropServerControlledProperties(schema, isRecord(prunedData) ? prunedData : {}))
  );
  let conditionallyNormalizedData = schemaOwnedData;
  if (schemaName === UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME) {
    conditionallyNormalizedData = normalizeManagerConditions(schema, schemaOwnedData);
  }
  if (IVO_INVESTIGATION_SCHEMA_NAMES.includes(schemaName)) {
    conditionallyNormalizedData = dropUnlessReportedToIvo(schemaOwnedData, ['ivoCaseNumber']);
  }
  if (DECISION_SCHEMA_NAMES.includes(schemaName)) {
    conditionallyNormalizedData = dropUnlessReportedToIvo(schemaOwnedData, ['ivoCaseNumber', 'public360CaseNumber']);
  }

  return applyDeclaredCalculations(schema, conditionallyNormalizedData);
}

/**
 * Narrows presentation choices to those that the canonical manager schema
 * accepts for the selected legal bases, and hides a decision's IVO case number
 * until the errand is reported to IVO. The source schema remains untouched.
 */
export function getInvestigationRenderingSchema(
  schemaName: string,
  schema: RJSFSchema,
  formData: InvestigationFormData
): RJSFSchema {
  if (DECISION_SCHEMA_NAMES.includes(schemaName)) return getDecisionRenderingSchema(schema, formData);
  if (schemaName !== UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME) return schema;

  const properties = { ...schema.properties };
  const { hasHsl, hasSolOrLss } = getManagerLegalBaseFlags(formData);
  if (!hasHsl) MANAGER_HSL_FIELDS.forEach((field) => delete properties[field]);
  if (!showsSolLssRiskAssessment(formData)) delete properties.riskAssessmentSolLss;
  if (!hasSolOrLss) delete properties.suspectedMisconduct;

  const templateSchema = properties.investigationTemplate;
  if (!isRecord(templateSchema) || !Array.isArray(templateSchema.oneOf)) {
    return { ...schema, properties };
  }

  const allowedTemplates = new Set<unknown>(getAllowedManagerTemplates(formData));
  if (allowedTemplates.size === 0) {
    delete properties.investigationTemplate;

    return {
      ...schema,
      properties,
    };
  }

  const filteredOptions = templateSchema.oneOf.filter(
    (option) => isRecord(option) && allowedTemplates.has(option.const)
  );

  return {
    ...schema,
    properties: {
      ...properties,
      investigationTemplate: {
        ...templateSchema,
        oneOf: filteredOptions,
      },
    },
  };
}

export function getHslRiskValue(formData: InvestigationFormData): number | undefined {
  const riskAssessment = formData.riskAssessmentHsl;
  if (!isRecord(riskAssessment)) return undefined;

  return typeof riskAssessment.calculatedRiskValue === 'number' ? riskAssessment.calculatedRiskValue : undefined;
}

/**
 * A schema that declares `x-draken-completion` lets its owner mark the document completed, which
 * locks it and allows a PDF report; the reports field is the server-owned log of those reports.
 */
export interface InvestigationCompletion {
  readonly field: string;
  readonly reportsField: string;
}

export function getInvestigationCompletion(schema: RJSFSchema): InvestigationCompletion | undefined {
  const declaration = (schema as Record<string, unknown>)['x-draken-completion'];
  if (!isRecord(declaration) || typeof declaration.field !== 'string' || typeof declaration.reportsField !== 'string') {
    return undefined;
  }
  return { field: declaration.field, reportsField: declaration.reportsField };
}

export const isInvestigationCompleted = (schema: RJSFSchema, formData: InvestigationFormData): boolean => {
  const completion = getInvestigationCompletion(schema);
  return completion !== undefined && formData[completion.field] === 'yes';
};

export interface InvestigationReport {
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly fileName: string;
  readonly attachmentId?: string;
}

/** Publication identity is persisted in the filename because existing pinned schemas allow no extra fields. */
export const isPendingInvestigationReport = (report: InvestigationReport): boolean =>
  !report.attachmentId &&
  /_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/.test(report.fileName);

/** The reports the document records, oldest first; malformed entries are left out rather than shown. */
export function getInvestigationReports(schema: RJSFSchema, formData: InvestigationFormData): InvestigationReport[] {
  const completion = getInvestigationCompletion(schema);
  const entries = completion ? formData[completion.reportsField] : undefined;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.generatedAt !== 'string' ||
      typeof entry.generatedBy !== 'string' ||
      typeof entry.fileName !== 'string'
    ) {
      return [];
    }
    return [
      {
        generatedAt: entry.generatedAt,
        generatedBy: entry.generatedBy,
        fileName: entry.fileName,
        ...(typeof entry.attachmentId === 'string' ? { attachmentId: entry.attachmentId } : {}),
      },
    ];
  });
}
