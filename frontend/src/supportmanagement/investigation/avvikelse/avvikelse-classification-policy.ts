import type { SupportLabelTreeProfile } from '../../services/support-label-classification-projector';
import { normalizeSupportManagementResourcePath } from '../../services/supportmanagement-path';
import type { SupportErrandClassificationPlacement } from '../classification-placement';
import { HIGH_HSL_RISK_LABEL_PATH } from './assignment/avvikelse-access-labels';
import { LEX_INVESTIGATION_SCHEMA_NAME, UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME } from './avvikelse-schema-names';
import type { AvvikelseClassificationGroup } from './label-classification/avvikelse-supportmanagement-label-classification';

export interface AvvikelseClassificationLegalBaseRule {
  readonly legalBase: string;
  readonly allowedClassificationCategories: readonly string[];
}

export interface AvvikelseClassificationLabelTree extends SupportLabelTreeProfile {
  readonly root: Readonly<{
    readonly resource: string;
    readonly classification: string;
  }>;
  readonly ownerClassification: string;
}

export const AVVIKELSE_CLASSIFICATION_POLICY = Object.freeze({
  defaultOwnerSchemaName: UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME,
  reportedMisconductOwnerSchemaName: LEX_INVESTIGATION_SCHEMA_NAME,
  reportedMisconductSelector: Object.freeze({
    parameter: Object.freeze({ key: 'eventType', values: Object.freeze(['MISSFORHALLANDE']) }),
    labels: Object.freeze({
      resourcePaths: Object.freeze(['REPORT_TYPE/ABUSE', 'REPORT_TYPE/ADVERSE_INCIDENT']),
      resourceNames: Object.freeze(['ABUSE', 'ADVERSE_INCIDENT']),
    }),
  }),
  /** The errand's legal base labels; an HSL label marks the errand for the HSL decision. */
  hslLegalBaseSelector: Object.freeze({
    labels: Object.freeze({
      classification: 'PROVISION',
      resourcePaths: Object.freeze(['PROVISION/HSL']),
      resourceNames: Object.freeze(['HSL']),
    }),
  }),
  /**
   * The mark of a high HSL risk, set once the unit manager's investigation has assessed one. It marks the errand
   * for the HSL decision as well: the report rarely names a legal base - the investigation does - and the high risk
   * is what brings MAS/MAR to the errand.
   */
  highHslRiskSelector: Object.freeze({
    labels: Object.freeze({
      classification: 'RISK',
      resourcePaths: Object.freeze([HIGH_HSL_RISK_LABEL_PATH]),
      resourceNames: Object.freeze(['HIGH_HSL']),
    }),
  }),
  labelTree: Object.freeze({
    root: Object.freeze({ resource: 'CATEGORY', classification: 'CATEGORY_ROOT' }),
    ownerClassification: 'PROVISION_CATEGORY',
    categoryClassification: 'CATEGORY',
    typeClassification: 'TYPE',
  }) satisfies AvvikelseClassificationLabelTree,
  /**
   * The legal bases a reported misconduct falls under: SoL and LSS, never HSL. LEX chooses among them in the lex
   * Sarah investigation; the unit manager's investigation of a misconduct is given both.
   */
  reportedMisconductLegalBases: Object.freeze(['SOL', 'LSS']),
  legalBasesPointer: '/legalBases',
  legalBaseRules: Object.freeze([
    Object.freeze({ legalBase: 'HSL', allowedClassificationCategories: Object.freeze(['CATEGORY/HSL']) }),
    Object.freeze({ legalBase: 'SOL', allowedClassificationCategories: Object.freeze(['CATEGORY/SOL_LSS']) }),
    Object.freeze({ legalBase: 'LSS', allowedClassificationCategories: Object.freeze(['CATEGORY/SOL_LSS']) }),
  ]) satisfies readonly AvvikelseClassificationLegalBaseRule[],
  /**
   * The legal bases whose categories are chosen in one selector. An errand is classified once in every
   * group one of its legal bases belongs to: HSL in one selector, SoL and LSS together in the other.
   */
  classificationGroups: Object.freeze([
    Object.freeze({ key: 'HSL', legalBases: Object.freeze([Object.freeze({ legalBase: 'HSL', label: 'HSL' })]) }),
    Object.freeze({
      key: 'SOL_LSS',
      legalBases: Object.freeze([
        Object.freeze({ legalBase: 'SOL', label: 'SoL' }),
        Object.freeze({ legalBase: 'LSS', label: 'LSS' }),
      ]),
    }),
  ]) satisfies readonly AvvikelseClassificationGroup[],
  /** Every classification is kept as labels; the errand's classification field takes the SoL/LSS one when both exist. */
  errandClassificationGroupPriority: Object.freeze(['SOL_LSS', 'HSL']),
});

type AvvikelseClassificationPolicy = typeof AVVIKELSE_CLASSIFICATION_POLICY;
type ResolvedAvvikelseClassificationPolicy = AvvikelseClassificationPolicy &
  Readonly<{
    defaultOwnerDocumentKey: string;
    reportedMisconductOwnerDocumentKey: string;
  }>;

/**
 * The avvikelse placement. Structurally a SupportErrandClassificationPlacement, plus the policy
 * payload that only avvikelse code reads - which is why shared consumers take the shared type and
 * never see this one.
 */
export type AvvikelseClassificationPlacement = SupportErrandClassificationPlacement &
  (
    | Readonly<{ owner: 'basics' | 'unavailable'; policy: AvvikelseClassificationPolicy }>
    | Readonly<{ owner: 'investigation'; policy: ResolvedAvvikelseClassificationPolicy }>
  ) &
  Readonly<{ labelTree: AvvikelseClassificationLabelTree }>;

interface ClassificationPolicyProfile {
  readonly state: 'active' | 'inactive' | 'unavailable';
  readonly documents: readonly Readonly<{ key: string; schemaName: string }>[];
}

interface ResolveClassificationPlacementOptions {
  readonly profile: ClassificationPolicyProfile | null | undefined;
}

interface ClassificationOwnerErrand {
  readonly parameters?: readonly {
    readonly key: string;
    readonly values?: readonly string[];
  }[];
  readonly labels?: readonly {
    readonly classification?: string;
    readonly resourcePath?: string;
    readonly resourceName?: string;
  }[];
}

/**
 * Which decision an errand takes, if any. Reported misconduct always takes the lex Sarah decision,
 * whatever its legal bases; an ordinary deviation takes the HSL decision when it was reported under HSL
 * or is marked with a high HSL risk; every other errand takes none. One decision per errand, never two.
 */
export type AvvikelseDocumentApplicability = 'reported-misconduct' | 'hsl-deviation';

const iafVofBasicsPlacement: AvvikelseClassificationPlacement = Object.freeze({
  owner: 'basics',
  labelTree: AVVIKELSE_CLASSIFICATION_POLICY.labelTree,
  policy: AVVIKELSE_CLASSIFICATION_POLICY,
});
const iafVofUnavailablePlacement: AvvikelseClassificationPlacement = Object.freeze({
  owner: 'unavailable',
  labelTree: AVVIKELSE_CLASSIFICATION_POLICY.labelTree,
  policy: AVVIKELSE_CLASSIFICATION_POLICY,
});

const findUniqueDocumentKey = (
  documents: ClassificationPolicyProfile['documents'],
  schemaName: string
): string | undefined => {
  const matches = documents.filter((document) => document.schemaName === schemaName);
  return matches.length === 1 ? matches[0].key : undefined;
};

/**
 * The runtime profile decides whether investigation is active and maps fixed
 * IAF/VOF schema roles to persistence keys. It cannot redefine the business rule.
 */
export function resolveSupportErrandClassificationPlacement({
  profile,
}: ResolveClassificationPlacementOptions): AvvikelseClassificationPlacement {
  if (!profile || profile.state === 'unavailable') return iafVofUnavailablePlacement;
  if (profile.state !== 'active') return iafVofBasicsPlacement;

  const defaultOwnerDocumentKey = findUniqueDocumentKey(
    profile.documents,
    AVVIKELSE_CLASSIFICATION_POLICY.defaultOwnerSchemaName
  );
  const reportedMisconductOwnerDocumentKey = findUniqueDocumentKey(
    profile.documents,
    AVVIKELSE_CLASSIFICATION_POLICY.reportedMisconductOwnerSchemaName
  );
  if (!defaultOwnerDocumentKey || !reportedMisconductOwnerDocumentKey) return iafVofBasicsPlacement;

  return Object.freeze({
    owner: 'investigation',
    labelTree: AVVIKELSE_CLASSIFICATION_POLICY.labelTree,
    policy: Object.freeze({
      ...AVVIKELSE_CLASSIFICATION_POLICY,
      defaultOwnerDocumentKey,
      reportedMisconductOwnerDocumentKey,
    }),
  });
}

const normalizeCode = (value: string): string => value.trim().toUpperCase();
const normalizeResourcePath = (value: string): string => normalizeSupportManagementResourcePath(value);

type ClassificationOwnerLabel = NonNullable<ClassificationOwnerErrand['labels']>[number];

const REPORT_TYPE_PATH_PREFIX = 'REPORT_TYPE/';
const REPORT_TYPE_NAMES: readonly string[] = ['DEVIATION', 'ABUSE', 'ADVERSE_INCIDENT'];

const isReportTypeLabel = (label: ClassificationOwnerLabel): boolean => {
  const resourcePath = label.resourcePath?.trim();
  if (resourcePath) return normalizeResourcePath(resourcePath).startsWith(REPORT_TYPE_PATH_PREFIX);
  return typeof label.resourceName === 'string' && REPORT_TYPE_NAMES.includes(normalizeCode(label.resourceName));
};

const isMisconductReportLabel = (label: ClassificationOwnerLabel): boolean => {
  const selector = AVVIKELSE_CLASSIFICATION_POLICY.reportedMisconductSelector.labels;
  const selectedPaths = new Set<string>(selector.resourcePaths);
  const selectedNames = new Set<string>(selector.resourceNames);
  const resourcePath = label.resourcePath?.trim();
  if (resourcePath) return selectedPaths.has(normalizeResourcePath(resourcePath));
  return typeof label.resourceName === 'string' && selectedNames.has(normalizeCode(label.resourceName));
};

/**
 * Whether the errand is a reported misconduct. Its report type label decides: the label is the errand's own and
 * a handover moves it - to a misconduct when the unit manager suspects one, back to a deviation when LEX declines
 * it. The reported event type is the record of what was reported and never moves, so it only stands in for an
 * errand that carries no report type at all. The BFF applies the same rule.
 */
export const isAvvikelseReportedMisconductErrand = (errand: ClassificationOwnerErrand | undefined): boolean => {
  if (!errand) return false;
  const reportTypes = errand.labels?.filter(isReportTypeLabel) ?? [];
  if (reportTypes.length > 0) return reportTypes.some(isMisconductReportLabel);

  const selector = AVVIKELSE_CLASSIFICATION_POLICY.reportedMisconductSelector;
  const selectedValues = new Set<string>(selector.parameter.values);
  return (
    errand.parameters?.some(
      (parameter) =>
        parameter.key.trim() === selector.parameter.key &&
        parameter.values?.some((candidate) => selectedValues.has(normalizeCode(candidate)))
    ) ?? false
  );
};

/** Labels of one classification: where they are, and what names them on an errand that carries them without a path. */
interface ClassifiedLabelSelector {
  readonly classification: string;
  readonly resourcePaths: readonly string[];
  readonly resourceNames: readonly string[];
}

const carriesSelectedLabel = (errand: ClassificationOwnerErrand, selector: ClassifiedLabelSelector): boolean => {
  const selectedPaths = new Set<string>(selector.resourcePaths);
  const selectedNames = new Set<string>(selector.resourceNames);
  return (
    errand.labels?.some((label) => {
      const resourcePath = label.resourcePath?.trim();
      if (resourcePath) return selectedPaths.has(normalizeResourcePath(resourcePath));
      // Without a path the name alone is ambiguous - CATEGORY/HSL is also named HSL - so the
      // fallback also requires the label's classification.
      return (
        typeof label.classification === 'string' &&
        normalizeCode(label.classification) === selector.classification &&
        typeof label.resourceName === 'string' &&
        selectedNames.has(normalizeCode(label.resourceName))
      );
    }) ?? false
  );
};

/**
 * An ordinary deviation is MAS/MAR's to decide when it was reported under HSL, or when its investigation assessed a
 * high HSL risk. The labels are read rather than the investigation, so the answer is the same for everybody who
 * reaches the errand, whichever of its documents they may read. The BFF applies the same rule
 * (`resolveIafVofInvestigationDocumentApplicability`).
 */
export const resolveAvvikelseDocumentApplicability = (
  errand: ClassificationOwnerErrand | undefined
): AvvikelseDocumentApplicability | undefined => {
  if (!errand) return undefined;
  if (isAvvikelseReportedMisconductErrand(errand)) return 'reported-misconduct';
  const { hslLegalBaseSelector, highHslRiskSelector } = AVVIKELSE_CLASSIFICATION_POLICY;
  return carriesSelectedLabel(errand, hslLegalBaseSelector.labels) ||
    carriesSelectedLabel(errand, highHslRiskSelector.labels)
    ? 'hsl-deviation'
    : undefined;
};

export const resolveAvvikelseClassificationOwnerDocumentKey = (
  placement: Extract<AvvikelseClassificationPlacement, { owner: 'investigation' }>,
  errand: ClassificationOwnerErrand
): string =>
  isAvvikelseReportedMisconductErrand(errand)
    ? placement.policy.reportedMisconductOwnerDocumentKey
    : placement.policy.defaultOwnerDocumentKey;
