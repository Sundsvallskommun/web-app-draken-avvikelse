import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';
import type { SupportInvestigationProfileDto } from '@/dtos/support-investigation-profile.dto';

import { IAF_VOF_HIGH_HSL_RISK_LABEL_SELECTOR } from './iaf-vof-high-hsl-risk';
import { normalizeSupportManagementResourcePath } from './supportmanagement-path';

export interface IafVofInvestigationClassificationLegalBaseRule {
  readonly legalBase: string;
  readonly allowedClassificationCategories: readonly string[];
}

/**
 * Legal bases whose categories are chosen in one selector. An errand is classified once in every group
 * one of its legal bases belongs to, so a deviation under both HSL and SoL has an HSL and a SoL/LSS
 * classification.
 */
export interface IafVofInvestigationClassificationGroup {
  readonly key: string;
  readonly legalBases: readonly string[];
}

export interface IafVofInvestigationClassificationLabelTree {
  readonly root: Readonly<{
    readonly resource: string;
    readonly classification: string;
  }>;
  readonly ownerClassification: string;
  readonly categoryClassification: string;
  readonly typeClassification: string;
}

export interface IafVofInvestigationClassificationPolicy {
  readonly defaultOwnerDocumentKey: string;
  readonly reportedMisconductOwnerDocumentKey: string;
  /** LEX-ansvarig's initial assessment, where the profile has one: it can decline a suspected lex Sarah matter. */
  readonly lexAssessmentDocumentKey?: string;
  readonly labelTree: IafVofInvestigationClassificationLabelTree;
  /** The legal bases a reported misconduct falls under: LEX chooses among them, and HSL is never one. */
  readonly reportedMisconductLegalBases: readonly string[];
  readonly legalBasesPointer: string;
  readonly legalBaseRules: readonly IafVofInvestigationClassificationLegalBaseRule[];
  readonly classificationGroups: readonly IafVofInvestigationClassificationGroup[];
  /** Group keys in the order they claim the errand's own classification field, which holds only one. */
  readonly errandClassificationGroupPriority: readonly string[];
}

export type IafVofInvestigationClassificationOwnerSelection = Readonly<{
  mode: 'default' | 'reported-misconduct';
  documentKey: string;
}>;

type ClassificationOwnerErrand = Pick<Errand, 'parameters' | 'labels'>;

/**
 * Which restricted investigation document an errand takes, if any: the lex Sarah decision for a
 * reported misconduct whatever its legal bases, the HSL decision for an ordinary deviation reported
 * under HSL or assessed a high HSL risk, nothing otherwise. One kind per errand, never two.
 */
export type IafVofInvestigationDocumentApplicability = 'reported-misconduct' | 'hsl-deviation';

const DEFAULT_OWNER_SCHEMA_NAME = 'utredning-enhetschef';
const REPORTED_MISCONDUCT_OWNER_SCHEMA_NAME = 'utredning-sol-lss';
const LEX_ASSESSMENT_SCHEMA_NAME = 'bedomning-sol-lss';
const REPORT_TYPE_PATH_PREFIX = 'REPORT_TYPE/';
const REPORT_TYPE_NAMES: readonly string[] = Object.freeze(['DEVIATION', 'ABUSE', 'ADVERSE_INCIDENT']);
const REPORTED_MISCONDUCT_PARAMETER = Object.freeze({ key: 'eventType', values: Object.freeze(['MISSFORHALLANDE']) });
const REPORTED_MISCONDUCT_LABELS = Object.freeze({
  resourcePaths: Object.freeze(['REPORT_TYPE/ABUSE', 'REPORT_TYPE/ADVERSE_INCIDENT']),
  resourceNames: Object.freeze(['ABUSE', 'ADVERSE_INCIDENT']),
});
/** The label classification an errand's reported legal bases carry, as `PROVISION/<legal base>`. */
const LEGAL_BASE_LABEL_CLASSIFICATION = 'PROVISION';
const HSL_LEGAL_BASE = 'HSL';

export const IAF_VOF_INVESTIGATION_CLASSIFICATION_LABEL_TREE: IafVofInvestigationClassificationLabelTree = Object.freeze({
  root: Object.freeze({ resource: 'CATEGORY', classification: 'CATEGORY_ROOT' }),
  ownerClassification: 'PROVISION_CATEGORY',
  categoryClassification: 'CATEGORY',
  typeClassification: 'TYPE',
});

export const IAF_VOF_INVESTIGATION_CLASSIFICATION_LEGAL_BASE_RULES: readonly IafVofInvestigationClassificationLegalBaseRule[] = Object.freeze([
  Object.freeze({ legalBase: 'HSL', allowedClassificationCategories: Object.freeze(['CATEGORY/HSL']) }),
  Object.freeze({ legalBase: 'SOL', allowedClassificationCategories: Object.freeze(['CATEGORY/SOL_LSS']) }),
  Object.freeze({ legalBase: 'LSS', allowedClassificationCategories: Object.freeze(['CATEGORY/SOL_LSS']) }),
]);

export const IAF_VOF_INVESTIGATION_CLASSIFICATION_GROUPS: readonly IafVofInvestigationClassificationGroup[] = Object.freeze([
  Object.freeze({ key: 'HSL', legalBases: Object.freeze(['HSL']) }),
  Object.freeze({ key: 'SOL_LSS', legalBases: Object.freeze(['SOL', 'LSS']) }),
]);

/** Every classification is kept as labels; the errand's classification field takes the SoL/LSS one when both exist. */
export const IAF_VOF_ERRAND_CLASSIFICATION_GROUP_PRIORITY = Object.freeze(['SOL_LSS', 'HSL']);

export const IAF_VOF_INVESTIGATION_LEGAL_BASES_POINTER = '/legalBases';
export const IAF_VOF_REPORTED_MISCONDUCT_LEGAL_BASES = Object.freeze(['SOL', 'LSS']);

const resolveUniqueDocumentKey = (profile: SupportInvestigationProfileDto, schemaName: string): string | undefined => {
  const matches = profile.documents.filter(document => document.schemaName === schemaName);
  return matches.length === 1 ? matches[0].key : undefined;
};

/**
 * Resolves the fixed IAF/VOF business rule to the profile's persistence keys. A profile without both owner
 * documents - the unit manager's investigation and the SoL/LSS investigation - has no classification policy.
 */
export const resolveIafVofInvestigationClassificationPolicy = (
  profile: SupportInvestigationProfileDto,
): IafVofInvestigationClassificationPolicy | undefined => {
  const defaultOwnerDocumentKey = resolveUniqueDocumentKey(profile, DEFAULT_OWNER_SCHEMA_NAME);
  const reportedMisconductOwnerDocumentKey = resolveUniqueDocumentKey(profile, REPORTED_MISCONDUCT_OWNER_SCHEMA_NAME);
  if (!defaultOwnerDocumentKey || !reportedMisconductOwnerDocumentKey) return undefined;
  const lexAssessmentDocumentKey = resolveUniqueDocumentKey(profile, LEX_ASSESSMENT_SCHEMA_NAME);

  return Object.freeze({
    defaultOwnerDocumentKey,
    reportedMisconductOwnerDocumentKey,
    ...(lexAssessmentDocumentKey ? { lexAssessmentDocumentKey } : {}),
    labelTree: IAF_VOF_INVESTIGATION_CLASSIFICATION_LABEL_TREE,
    reportedMisconductLegalBases: IAF_VOF_REPORTED_MISCONDUCT_LEGAL_BASES,
    legalBasesPointer: IAF_VOF_INVESTIGATION_LEGAL_BASES_POINTER,
    legalBaseRules: IAF_VOF_INVESTIGATION_CLASSIFICATION_LEGAL_BASE_RULES,
    classificationGroups: IAF_VOF_INVESTIGATION_CLASSIFICATION_GROUPS,
    errandClassificationGroupPriority: IAF_VOF_ERRAND_CLASSIFICATION_GROUP_PRIORITY,
  });
};

const normalizeCode = (value: string): string => value.trim().toUpperCase();
const normalizeResourcePath = (value: string): string => normalizeSupportManagementResourcePath(value);
const matchesSelectorParameterKey = (parameterKey: string): boolean => parameterKey.trim() === REPORTED_MISCONDUCT_PARAMETER.key;

type ClassificationOwnerLabel = NonNullable<ClassificationOwnerErrand['labels']>[number];

const isReportTypeLabel = (label: ClassificationOwnerLabel): boolean => {
  const resourcePath = label.resourcePath?.trim();
  if (resourcePath) return normalizeResourcePath(resourcePath).startsWith(REPORT_TYPE_PATH_PREFIX);
  return typeof label.resourceName === 'string' && REPORT_TYPE_NAMES.includes(normalizeCode(label.resourceName));
};

const isMisconductReportLabel = (label: ClassificationOwnerLabel): boolean => {
  const selectedPaths = new Set(REPORTED_MISCONDUCT_LABELS.resourcePaths.map(normalizeResourcePath));
  const selectedNames = new Set(REPORTED_MISCONDUCT_LABELS.resourceNames.map(normalizeCode));
  const resourcePath = label.resourcePath?.trim();
  if (resourcePath) return selectedPaths.has(normalizeResourcePath(resourcePath));
  return typeof label.resourceName === 'string' && selectedNames.has(normalizeCode(label.resourceName));
};

/**
 * Whether the errand is a reported misconduct. Its report type label decides: the label is the errand's own and a
 * handover moves it - to a misconduct when the unit manager suspects one, back to a deviation when LEX declines
 * it. The reported event type is the record of what was reported and never moves, so it only stands in for an
 * errand that carries no report type at all.
 */
const isReportedMisconduct = (errand: ClassificationOwnerErrand): boolean => {
  const reportTypes = errand.labels?.filter(isReportTypeLabel) ?? [];
  if (reportTypes.length > 0) return reportTypes.some(isMisconductReportLabel);

  const selectedValues = new Set(REPORTED_MISCONDUCT_PARAMETER.values.map(normalizeCode));
  return (
    errand.parameters?.some(
      parameter => matchesSelectorParameterKey(parameter.key) && parameter.values?.some(value => selectedValues.has(normalizeCode(value))),
    ) ?? false
  );
};

/** One label of the metadata: where it is, and what names it on an errand that carries it without its path. */
interface LabelSelector {
  readonly resourcePath: string;
  readonly classification: string;
  readonly resourceName: string;
}

const matchesLabelSelector = (label: ClassificationOwnerLabel, selector: LabelSelector): boolean => {
  const resourcePath = label.resourcePath?.trim();
  if (resourcePath) return normalizeResourcePath(resourcePath) === normalizeResourcePath(selector.resourcePath);
  // Without a path the name alone is ambiguous - CATEGORY/HSL is also named HSL - so the
  // fallback also requires the label's classification.
  return (
    typeof label.classification === 'string' &&
    normalizeCode(label.classification) === normalizeCode(selector.classification) &&
    typeof label.resourceName === 'string' &&
    normalizeCode(label.resourceName) === normalizeCode(selector.resourceName)
  );
};

const isLegalBaseLabel = (label: ClassificationOwnerLabel, legalBase: string): boolean =>
  matchesLabelSelector(label, {
    resourcePath: `${LEGAL_BASE_LABEL_CLASSIFICATION}/${legalBase}`,
    classification: LEGAL_BASE_LABEL_CLASSIFICATION,
    resourceName: legalBase,
  });

/**
 * The legal bases the errand was reported under: its `PROVISION` labels, as the policy's legal bases. What the report
 * said, not what an investigation found.
 */
export const resolveIafVofReportedLegalBases = (errand: Pick<Errand, 'labels'>): string[] =>
  IAF_VOF_INVESTIGATION_CLASSIFICATION_LEGAL_BASE_RULES.map(rule => rule.legalBase).filter(
    legalBase => errand.labels?.some(label => isLegalBaseLabel(label, legalBase)) ?? false,
  );

const hasHslLegalBase = (errand: ClassificationOwnerErrand): boolean => resolveIafVofReportedLegalBases(errand).includes(HSL_LEGAL_BASE);

/**
 * Whether the errand is marked with a high HSL risk: the unit manager's investigation assessed one. The label is
 * read rather than the investigation, so the answer is the same for everybody who reaches the errand, whichever
 * of its documents they may read.
 */
const carriesHighHslRisk = (errand: ClassificationOwnerErrand): boolean =>
  errand.labels?.some(label => matchesLabelSelector(label, IAF_VOF_HIGH_HSL_RISK_LABEL_SELECTOR)) ?? false;

/**
 * An ordinary deviation is MAS/MAR's to decide when it was reported under HSL, or when its investigation assessed
 * a high HSL risk. The report rarely names a legal base - the unit manager's investigation does - and the high
 * risk is what brings MAS/MAR to the errand, so without it the decision would be offered on no errand they reach.
 */
export const resolveIafVofInvestigationDocumentApplicability = (
  errand: ClassificationOwnerErrand,
): IafVofInvestigationDocumentApplicability | undefined => {
  if (isReportedMisconduct(errand)) return 'reported-misconduct';
  return hasHslLegalBase(errand) || carriesHighHslRisk(errand) ? 'hsl-deviation' : undefined;
};

/**
 * Whether a document declared for `appliesTo` belongs on the errand. `deviation` is every errand but a reported
 * misconduct - an ordinary deviation, one LEX has handed back among them - and the narrower kinds name the errand's
 * own, as `resolveIafVofInvestigationDocumentApplicability` resolves it.
 */
export const iafVofDocumentAppliesToErrand = (
  appliesTo: IafVofInvestigationDocumentApplicability | 'deviation' | 'all',
  errand: ClassificationOwnerErrand,
): boolean => {
  if (appliesTo === 'all') return true;
  const applicability = resolveIafVofInvestigationDocumentApplicability(errand);
  return appliesTo === 'deviation' ? applicability !== 'reported-misconduct' : applicability === appliesTo;
};

/**
 * What the unit manager's investigation records about its errand, from schema 1.8: whether it is a misconduct. The
 * unit manager risk-assesses deviations, so the schema neither shows nor requires the SoL/LSS risk assessment for a
 * misconduct - and which of the two the errand is, is not the browser's to say. The field is server-owned: the
 * answer is read from the errand on every save, so it follows an errand LEX hands back as a deviation.
 */
const UNIT_MANAGER_REPORTED_MISCONDUCT_FIELD = 'reportedMisconduct';

export const resolveIafVofUnitManagerErrandFacts = (errand: ClassificationOwnerErrand): Readonly<Record<string, boolean>> => ({
  [UNIT_MANAGER_REPORTED_MISCONDUCT_FIELD]: isReportedMisconduct(errand),
});

export const resolveIafVofInvestigationClassificationOwner = (
  policy: IafVofInvestigationClassificationPolicy,
  errand: ClassificationOwnerErrand,
): IafVofInvestigationClassificationOwnerSelection => {
  const reportedMisconduct = isReportedMisconduct(errand);
  return {
    mode: reportedMisconduct ? 'reported-misconduct' : 'default',
    documentKey: reportedMisconduct ? policy.reportedMisconductOwnerDocumentKey : policy.defaultOwnerDocumentKey,
  };
};

const selectorParameterSnapshot = (parameters: Errand['parameters']): string =>
  JSON.stringify(
    (parameters ?? [])
      .filter(parameter => matchesSelectorParameterKey(parameter.key))
      .map(parameter => ({ key: parameter.key, values: parameter.values ?? [] })),
  );

/** Prevents generic parameter writes from moving IAF/VOF classification to another owner document. */
export const preservesIafVofInvestigationClassificationOwnerParameter = (
  currentParameters: Errand['parameters'],
  requestedParameters: Errand['parameters'],
): boolean => selectorParameterSnapshot(currentParameters) === selectorParameterSnapshot(requestedParameters);

/**
 * The parameter key the classification owner rule reads. Command routes that write a single
 * parameter refuse this one, so the owner selector can only change through the classification
 * command that is built to move it.
 */
export const IAF_VOF_CLASSIFICATION_OWNER_PARAMETER_KEY = REPORTED_MISCONDUCT_PARAMETER.key;
