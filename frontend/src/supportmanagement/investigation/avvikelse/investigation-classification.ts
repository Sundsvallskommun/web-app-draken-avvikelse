import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';

import { getAvvikelseClassificationPlacement } from './avvikelse-classification-placement';
import {
  type AvvikelseClassificationLegalBaseRule,
  type AvvikelseClassificationPlacement,
  type AvvikelseDocumentApplicability,
  isAvvikelseReportedMisconductErrand,
  resolveAvvikelseClassificationOwnerDocumentKey,
  resolveAvvikelseDocumentApplicability,
} from './avvikelse-classification-policy';
import type { InvestigationDocumentKey, InvestigationFormData } from './investigation-document';
import { normalizeInvestigationFormData, withReportedMisconductMark } from './investigation-form-data';

export const INVESTIGATION_CLASSIFICATION_EXTERNAL_FIELD = 'errandClassification';
const INVESTIGATION_CLASSIFICATION_SLOT = `$external:${INVESTIGATION_CLASSIFICATION_EXTERNAL_FIELD}`;

interface InvestigationExternalFieldDefinition {
  kind?: unknown;
  legalBasesPointer?: unknown;
  required?: unknown;
}

interface InvestigationSchemaExtensions extends RJSFSchema {
  'x-draken-external-fields'?: Record<string, InvestigationExternalFieldDefinition>;
}

const isClassificationDocumentKey = (
  key: InvestigationDocumentKey,
  policy: Extract<AvvikelseClassificationPlacement, { owner: 'investigation' }>['policy']
): boolean => {
  return policy.defaultOwnerDocumentKey === key || policy.reportedMisconductOwnerDocumentKey === key;
};

const hasClassificationDeclaration = (
  schema: RJSFSchema,
  policy: Extract<AvvikelseClassificationPlacement, { owner: 'investigation' }>['policy']
): boolean => {
  const definition = (schema as InvestigationSchemaExtensions)['x-draken-external-fields']?.[
    INVESTIGATION_CLASSIFICATION_EXTERNAL_FIELD
  ];
  return (
    definition?.kind === 'supportManagementLabelClassification' &&
    definition.legalBasesPointer === policy.legalBasesPointer &&
    definition.required === true
  );
};

export type InvestigationClassificationSchemaContract = 'declared' | 'legacy-fallback' | 'missing-declaration';

const isLegacyClassificationSchema = (schema: RJSFSchema): boolean => {
  if (typeof schema.$id !== 'string') return true;
  const version = schema.$id.match(/[/_](\d+)\.(\d+)$/u);
  if (!version) return false;
  const major = Number(version[1]);
  const minor = Number(version[2]);
  return major < 1 || (major === 1 && minor === 0);
};

export const getInvestigationClassificationSchemaContract = (
  key: InvestigationDocumentKey,
  schema: RJSFSchema
): InvestigationClassificationSchemaContract | undefined => {
  const placement = getAvvikelseClassificationPlacement();
  if (placement.owner !== 'investigation' || !isClassificationDocumentKey(key, placement.policy)) return undefined;
  if (hasClassificationDeclaration(schema, placement.policy)) return 'declared';
  return isLegacyClassificationSchema(schema) ? 'legacy-fallback' : 'missing-declaration';
};

const jsonPointerSegments = (pointer: string): string[] =>
  pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));

const readJsonPointer = (value: unknown, pointer: string): unknown =>
  jsonPointerSegments(pointer).reduce<unknown>(
    (current, segment) =>
      typeof current === 'object' && current !== null && !Array.isArray(current)
        ? (current as Record<string, unknown>)[segment]
        : undefined,
    value
  );

export const getInvestigationLegalBases = (formData: InvestigationFormData): string[] => {
  const { policy } = getAvvikelseClassificationPlacement();
  const legalBases = readJsonPointer(formData, policy.legalBasesPointer);
  if (!Array.isArray(legalBases)) return [];

  const rulesByLegalBase = new Map(
    policy.legalBaseRules.map((rule) => [rule.legalBase.trim().toUpperCase(), rule.legalBase])
  );
  return [
    ...new Set(
      legalBases.flatMap((legalBase) => {
        if (typeof legalBase !== 'string') return [];
        const configuredLegalBase = rulesByLegalBase.get(legalBase.trim().toUpperCase());
        return configuredLegalBase ? [configuredLegalBase] : [];
      })
    ),
  ];
};

export const getInvestigationLegalBaseRules = (): readonly AvvikelseClassificationLegalBaseRule[] =>
  getAvvikelseClassificationPlacement().policy.legalBaseRules;

export const isReportedMisconductErrand = (errand: SupportErrand | undefined): boolean =>
  isAvvikelseReportedMisconductErrand(errand);

/** The one kind of restricted document this errand takes, if any. */
export const getInvestigationDocumentApplicability = (
  errand: SupportErrand | undefined
): AvvikelseDocumentApplicability | undefined => resolveAvvikelseDocumentApplicability(errand);

const getInvestigationClassificationOwner = (
  errand: SupportErrand | undefined
): InvestigationDocumentKey | undefined => {
  const placement = getAvvikelseClassificationPlacement();
  if (placement.owner !== 'investigation') return undefined;
  return resolveAvvikelseClassificationOwnerDocumentKey(placement, errand ?? {});
};

export const isInvestigationClassificationOwner = (
  key: InvestigationDocumentKey,
  errand: SupportErrand | undefined
): boolean => getInvestigationClassificationOwner(errand) === key;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const schemaContainsDataPointer = (schema: RJSFSchema, pointer: string): boolean => {
  let current: RJSFSchema | boolean = schema;
  for (const segment of jsonPointerSegments(pointer)) {
    if (typeof current === 'boolean' || !isRecord(current.properties)) return false;
    const nextSchema: RJSFSchema | boolean | undefined = current.properties[segment];
    if (nextSchema === undefined) return false;
    current = nextSchema;
  }
  return true;
};

const setJsonPointer = (value: InvestigationFormData, pointer: string, nextValue: unknown): InvestigationFormData => {
  const setAtPath = (current: unknown, segments: readonly string[]): unknown => {
    const [segment, ...remaining] = segments;
    if (!segment) return nextValue;
    const currentRecord = isRecord(current) ? current : {};
    return {
      ...currentRecord,
      [segment]: remaining.length === 0 ? nextValue : setAtPath(currentRecord[segment], remaining),
    };
  };

  return setAtPath(value, jsonPointerSegments(pointer)) as InvestigationFormData;
};

const normalizeLegalBasesInContext = (
  documentKey: InvestigationDocumentKey,
  schemaName: string,
  schema: RJSFSchema,
  formData: InvestigationFormData,
  reportedMisconduct: boolean
): InvestigationFormData => {
  const normalized = normalizeInvestigationFormData(schemaName, schema, formData);
  const placement = getAvvikelseClassificationPlacement();
  if (placement.owner !== 'investigation') return normalized;

  const { policy } = placement;
  // The unit manager does not choose the legal bases of a reported misconduct: their investigation is given both
  // social ones, which keep its SoL/LSS template and risk assessment, and does not show them. LEX states which of
  // them apply in the lex Sarah investigation, where nothing is set for them.
  const forceSocialLegalBases =
    reportedMisconduct &&
    documentKey === policy.defaultOwnerDocumentKey &&
    schemaContainsDataPointer(schema, policy.legalBasesPointer);

  return forceSocialLegalBases
    ? normalizeInvestigationFormData(
        schemaName,
        schema,
        setJsonPointer(normalized, policy.legalBasesPointer, [...policy.reportedMisconductLegalBases])
      )
    : normalized;
};

/** One investigation document as the errand it belongs to shapes it: its legal bases, and what kind of errand it is. */
export const normalizeContextualInvestigationFormData = (
  documentKey: InvestigationDocumentKey,
  schemaName: string,
  schema: RJSFSchema,
  formData: InvestigationFormData,
  reportedMisconduct: boolean
): InvestigationFormData =>
  withReportedMisconductMark(
    schemaName,
    schema,
    normalizeLegalBasesInContext(documentKey, schemaName, schema, formData, reportedMisconduct),
    reportedMisconduct
  );

const insertAfter = (values: readonly string[], after: string, value: string): string[] => {
  if (values.includes(value)) return [...values];
  const afterIndex = values.indexOf(after);
  if (afterIndex < 0) return [value, ...values];
  return [...values.slice(0, afterIndex + 1), value, ...values.slice(afterIndex + 1)];
};

export const getInvestigationClassificationUiSchema = (
  key: InvestigationDocumentKey,
  schema: RJSFSchema,
  uiSchema: UiSchema,
  reportedMisconduct: boolean
): UiSchema => {
  const placement = getAvvikelseClassificationPlacement();
  if (placement.owner !== 'investigation') return uiSchema;

  const { policy } = placement;
  const legalBasesSegments = jsonPointerSegments(policy.legalBasesPointer);
  const legalBasesField = legalBasesSegments.at(-1) ?? '';
  const hideUiSchemaField = (current: UiSchema, segments: readonly string[]): UiSchema => {
    const [segment, ...remaining] = segments;
    if (!segment) return current;
    const child = (current[segment] ?? {}) as UiSchema;
    return {
      ...current,
      [segment]: remaining.length === 0 ? { ...child, 'ui:widget': 'hidden' } : hideUiSchemaField(child, remaining),
    };
  };
  // The legal bases of a misconduct are LEX's to state; the unit manager's investigation of one does not show its own.
  const contextualUiSchema: UiSchema =
    reportedMisconduct && key === policy.defaultOwnerDocumentKey
      ? hideUiSchemaField(uiSchema, legalBasesSegments)
      : uiSchema;

  if (!isClassificationDocumentKey(key, policy)) return contextualUiSchema;

  const targetSectionId =
    key === policy.defaultOwnerDocumentKey ? 'categorization-and-documentation' : 'categorization';
  const sections = Array.isArray(contextualUiSchema['ui:sections'])
    ? (contextualUiSchema['ui:sections'] as Array<Record<string, unknown>>)
    : [];

  const placedSections = sections.map((section) => {
    if (!Array.isArray(section.fields)) return section;
    const fieldsWithoutClassification = section.fields.filter(
      (field): field is string => typeof field === 'string' && field !== INVESTIGATION_CLASSIFICATION_SLOT
    );
    return {
      ...section,
      fields:
        section.id === targetSectionId
          ? insertAfter(fieldsWithoutClassification, legalBasesField, INVESTIGATION_CLASSIFICATION_SLOT)
          : fieldsWithoutClassification,
    };
  });
  const hasTargetSection = placedSections.some((section) => section.id === targetSectionId);

  return {
    ...contextualUiSchema,
    'ui:sections': hasTargetSection
      ? placedSections
      : [
          {
            id: targetSectionId,
            title: 'Kategorisering',
            icon: 'menu',
            defaultOpen: true,
            fields: [INVESTIGATION_CLASSIFICATION_SLOT],
          },
          ...placedSections,
        ],
  };
};
