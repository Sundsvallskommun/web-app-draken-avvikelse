import type { Errand, ErrandLabel, Measure } from '@/data-contracts/supportmanagement/data-contracts';
import type { SupportInvestigationProfileDto } from '@/dtos/support-investigation-profile.dto';

import {
  resolveIafVofInvestigationClassificationOwner,
  resolveIafVofInvestigationClassificationPolicy,
  resolveIafVofReportedLegalBases,
} from './iaf-vof-investigation-classification';

/**
 * Where each fact the unit follow-up shows is written, by the fixed IAF/VOF schema role that holds it.
 * The profile maps a role to its persistence key, so a deployment with its own keys still resolves.
 */
const FOLLOW_UP_SOURCES = Object.freeze({
  managerInvestigation: 'utredning-enhetschef',
  lexInvestigation: 'utredning-sol-lss',
  hslDecision: 'beslut-hsl',
  lexDecision: 'beslut-sol-lss',
});

interface UnitFollowUpInvestigation {
  /**
   * The legal bases the errand was investigated under, from the investigation that classifies it: LEX's for a
   * reported misconduct, the unit manager's otherwise. Until that investigation names any, the ones it was reported
   * under.
   */
  readonly legalBases: string[];
  /** The risk values the unit manager's investigation calculated, per legal base group. */
  readonly riskValueHsl?: number;
  readonly riskValueSolLss?: number;
  /** Cause area codes, from whichever investigations name them. */
  readonly causeAreas: string[];
  /** The unit manager's answer on whether the errand calls for a police report, asked where HSL applies. */
  readonly policeReportHsl?: string;
  /** The LEX investigation's answer on whether the misconduct calls for a police report. */
  readonly policeReportSolLss?: string;
  /** Whether the errand was reported to IVO, from the decision that applies to it. */
  readonly ivoNotification?: string;
  /** What LEX decided the report amounted to, as the lex Sarah decision's code. */
  readonly decidedMisconductDegree?: string;
}

/** A measure as the follow-up lists it: what was planned, by whom, and whether it had the effect sought. */
type UnitFollowUpMeasure = Pick<
  Measure,
  'id' | 'type' | 'addedByUser' | 'accept' | 'plannedStart' | 'plannedComplete' | 'executed' | 'result' | 'resultText' | 'description' | 'goal'
>;

export interface UnitFollowUpErrand {
  readonly id: string;
  readonly errandNumber: string;
  readonly title?: string;
  readonly status?: string;
  readonly created?: string;
  readonly labels: Pick<ErrandLabel, 'id' | 'classification' | 'displayName' | 'resourcePath'>[];
  readonly investigation: UnitFollowUpInvestigation;
  readonly measures: UnitFollowUpMeasure[];
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

const documentKey = (profile: SupportInvestigationProfileDto, schemaName: string): string | undefined =>
  profile.documents.find(document => document.schemaName === schemaName)?.key;

const readDocument = (errand: Errand, key: string | undefined): JsonRecord | undefined => {
  if (!key) return undefined;
  const value = errand.jsonParameters?.find(parameter => parameter.key === key)?.value;
  return isRecord(value) ? value : undefined;
};

const readRiskValue = (document: JsonRecord | undefined, assessment: string): number | undefined => {
  const value = isRecord(document?.[assessment]) ? (document[assessment] as JsonRecord).calculatedRiskValue : undefined;
  return typeof value === 'number' ? value : undefined;
};

const readCode = (document: JsonRecord | undefined, field: string): string | undefined => {
  const value = document?.[field];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

const readCodes = (document: JsonRecord | undefined, field: string): string[] => {
  const value = document?.[field];
  return Array.isArray(value) ? value.filter((code): code is string => typeof code === 'string') : [];
};

const toFollowUpMeasure = (measure: Measure): UnitFollowUpMeasure => ({
  id: measure.id,
  type: measure.type,
  addedByUser: measure.addedByUser,
  accept: measure.accept,
  plannedStart: measure.plannedStart,
  plannedComplete: measure.plannedComplete,
  executed: measure.executed,
  result: measure.result,
  resultText: measure.resultText,
  description: measure.description,
  goal: measure.goal,
});

/**
 * One errand as the unit follow-up shows it, read from what the errand list already carried: its labels,
 * the investigation and decision documents the user may read, and its measures. Nothing is fetched per
 * errand. A document the user cannot read is simply absent - Support Management leaves it out of the
 * list - so its facts come back empty rather than as an error.
 *
 * Codes stay codes. Their titles belong to the schemas, which the client already reads.
 */
export const toUnitFollowUpErrand = (profile: SupportInvestigationProfileDto, errand: Errand): UnitFollowUpErrand | undefined => {
  if (!errand.id || !errand.errandNumber) return undefined;

  const manager = readDocument(errand, documentKey(profile, FOLLOW_UP_SOURCES.managerInvestigation));
  const lex = readDocument(errand, documentKey(profile, FOLLOW_UP_SOURCES.lexInvestigation));
  const hslDecision = readDocument(errand, documentKey(profile, FOLLOW_UP_SOURCES.hslDecision));
  const lexDecision = readDocument(errand, documentKey(profile, FOLLOW_UP_SOURCES.lexDecision));
  const classificationPolicy = resolveIafVofInvestigationClassificationPolicy(profile);
  const classifying = classificationPolicy
    ? readDocument(errand, resolveIafVofInvestigationClassificationOwner(classificationPolicy, errand).documentKey)
    : undefined;
  const investigatedLegalBases = readCodes(classifying, 'legalBases');

  return {
    id: errand.id,
    errandNumber: errand.errandNumber,
    title: errand.title,
    status: errand.status,
    created: errand.created,
    labels: (errand.labels ?? []).map(({ id, classification, displayName, resourcePath }) => ({ id, classification, displayName, resourcePath })),
    investigation: {
      legalBases: investigatedLegalBases.length > 0 ? investigatedLegalBases : resolveIafVofReportedLegalBases(errand),
      riskValueHsl: readRiskValue(manager, 'riskAssessmentHsl'),
      riskValueSolLss: readRiskValue(manager, 'riskAssessmentSolLss'),
      causeAreas: [...new Set([...readCodes(manager, 'causeAreas'), ...readCodes(lex, 'causeAreas')])],
      policeReportHsl: readCode(manager, 'requiresPoliceReport'),
      policeReportSolLss: readCode(lex, 'requiresPoliceReport'),
      // An errand takes one decision, never both: lex Sarah for a misconduct, IVO for an HSL deviation.
      ivoNotification: readCode(lexDecision, 'ivoNotification') ?? readCode(hslDecision, 'ivoNotification'),
      decidedMisconductDegree: readCode(lexDecision, 'decidedMisconductDegree'),
    },
    measures: (errand.measures ?? []).map(toFollowUpMeasure),
  };
};
