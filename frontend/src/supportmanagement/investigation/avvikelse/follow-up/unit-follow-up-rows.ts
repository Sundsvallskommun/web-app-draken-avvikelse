import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { normalizeClassification } from '@supportmanagement/services/support-label-classification-projector';
import { normalizeSupportManagementResourcePath } from '@supportmanagement/services/supportmanagement-path';
import dayjs from 'dayjs';

import { resolveErrandPlace } from '../assignment/errand-location';
import { isPlaceLabel } from '../place-label';
import {
  type FollowUpKeyFigureContext,
  type FollowUpKeyFigureKey,
  followUpKeyFiguresOf,
} from './unit-follow-up-key-figures';
import type {
  UnitFollowUpErrand,
  UnitFollowUpLabel,
  UnitFollowUpMeasure,
  UnitFollowUpMeasureType,
} from './unit-follow-up-service';
import type { UnitFollowUpVocabulary } from './unit-follow-up-vocabulary';

/** A value shown in a column and offered in a filter: its stable key and what it is called. */
export interface FollowUpOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The label classifications the follow-up filters on. Support Management spells them its own way (`report-type`,
 * `category`, `type`), so they are compared normalized.
 */
const FOLLOW_UP_LABEL_CLASSIFICATIONS = Object.freeze({
  reportType: 'REPORT_TYPE',
  category: 'CATEGORY',
  subcategory: 'TYPE',
});

export interface FollowUpErrandRow {
  readonly id: string;
  readonly errandNumber: string;
  readonly unit?: FollowUpOption;
  readonly reportType?: FollowUpOption;
  readonly causeAreas: FollowUpOption[];
  readonly created?: string;
  readonly riskValueHsl?: number;
  readonly riskValueSolLss?: number;
  readonly ivoNotification?: FollowUpOption;
  /** The police reports the investigations call for: HSL from the unit manager's, SoL/LSS from LEX's. */
  readonly policeReports: FollowUpOption[];
  readonly decidedMisconduct?: FollowUpOption;
  readonly status?: FollowUpOption;
  readonly legalBases: FollowUpOption[];
  readonly categories: FollowUpOption[];
  readonly subcategories: FollowUpOption[];
  readonly measureCount: number;
  /** Every label the errand carries, by its normalized resource path. */
  readonly labelPaths: readonly string[];
  readonly keyFigures: readonly FollowUpKeyFigureKey[];
}

export type FollowUpMeasureStatus = 'executed' | 'planned' | 'proposed' | 'rejected';

export const FOLLOW_UP_MEASURE_STATUSES: readonly FollowUpOption[] = Object.freeze([
  { value: 'executed', label: 'Genomförd' },
  { value: 'planned', label: 'Planerad' },
  // The word the measure cards and their filter use for a proposal nobody has decided on.
  { value: 'proposed', label: 'Ej bedömd' },
  { value: 'rejected', label: 'Avslagen' },
]);

/** Ja or Nej - for IVO and a measure's effect alike. */
export const FOLLOW_UP_YES_NO: readonly FollowUpOption[] = Object.freeze([
  { value: 'yes', label: 'Ja' },
  { value: 'no', label: 'Nej' },
]);

/**
 * The police reports an errand may call for, each answered by the investigation of its legal bases: the unit
 * manager's for HSL, the lex Sarah investigation's for SoL/LSS. An errand calls for one where the answer is Ja.
 */
const POLICE_REPORTS = [
  { value: 'hsl', label: 'Polisanmälan HSL', answer: 'policeReportHsl' },
  { value: 'sol_lss', label: 'Polisanmälan SoL/LSS', answer: 'policeReportSolLss' },
] as const;

export const FOLLOW_UP_POLICE_REPORT: readonly FollowUpOption[] = Object.freeze(
  POLICE_REPORTS.map(({ value, label }) => ({ value, label }))
);

export interface FollowUpMeasureRow {
  readonly key: string;
  readonly errand: FollowUpErrandRow;
  readonly type: FollowUpOption;
  readonly addedBy?: string;
  readonly status: FollowUpOption;
  readonly started?: string;
  readonly completed?: string;
  readonly effect?: FollowUpOption;
  readonly description?: string;
  readonly goal?: string;
  readonly resultText?: string;
}

/** What the rows are named with: the label tree, the schemas' vocabulary, the statuses and the people. */
export interface FollowUpRowContext {
  readonly labelStructure: readonly Label[] | undefined;
  readonly vocabulary: UnitFollowUpVocabulary;
  readonly statusName: (status: string) => string | undefined;
  readonly personName: (adAccount: string) => string | undefined;
  readonly measureTypes: readonly UnitFollowUpMeasureType[];
  readonly keyFigures: FollowUpKeyFigureContext;
}

const day = (value: string | undefined): string | undefined => (value ? dayjs(value).format('YYYY-MM-DD') : undefined);

const yesNo = (value: string | undefined): FollowUpOption | undefined =>
  FOLLOW_UP_YES_NO.find((option) => option.value === value);

const labelsOf = (labels: readonly UnitFollowUpLabel[], classification: string): FollowUpOption[] =>
  labels
    .filter(
      (label) => normalizeClassification(label.classification) === normalizeClassification(classification) && label.id
    )
    .map((label) => ({ value: label.id!, label: label.displayName || label.resourcePath || label.id! }));

const coded = (code: string | undefined, titles: ReadonlyMap<string, string>): FollowUpOption | undefined =>
  code ? { value: code, label: titles.get(code) ?? code } : undefined;

/**
 * The unit an errand belongs to: the deepest place its labels carry, named as the place structure names it.
 * Without a structure to resolve it in, the last place label the errand carries stands in.
 */
const unitOf = (
  labels: readonly UnitFollowUpLabel[],
  labelStructure: readonly Label[] | undefined
): FollowUpOption | undefined => {
  const place = resolveErrandPlace(labels as Label[], labelStructure);
  if (place?.node.label.id) return { value: place.node.label.id, label: place.presentation.place };
  const location = labels.filter(isPlaceLabel).at(-1);
  return location?.id ? { value: location.id, label: location.displayName || location.id } : undefined;
};

const toFollowUpErrandRow = (errand: UnitFollowUpErrand, context: FollowUpRowContext): FollowUpErrandRow => {
  const labelPaths = errand.labels
    .map((label) => normalizeSupportManagementResourcePath(label.resourcePath))
    .filter((path) => path !== '');
  const created = day(errand.created);
  const { legalBases } = errand.investigation;
  return {
    id: errand.id,
    errandNumber: errand.errandNumber,
    unit: unitOf(errand.labels, context.labelStructure),
    reportType: labelsOf(errand.labels, FOLLOW_UP_LABEL_CLASSIFICATIONS.reportType)[0],
    causeAreas: errand.investigation.causeAreas.map((code) => coded(code, context.vocabulary.causeAreas)!),
    created,
    riskValueHsl: errand.investigation.riskValueHsl,
    riskValueSolLss: errand.investigation.riskValueSolLss,
    ivoNotification: yesNo(errand.investigation.ivoNotification),
    policeReports: POLICE_REPORTS.filter(({ answer }) => errand.investigation[answer] === 'yes').map(
      ({ value, label }) => ({ value, label })
    ),
    decidedMisconduct: coded(errand.investigation.decidedMisconductDegree, context.vocabulary.misconductDegrees),
    status: errand.status
      ? { value: errand.status, label: context.statusName(errand.status) ?? errand.status }
      : undefined,
    // What the investigation that classifies the errand says; the BFF falls back to the reported legal base.
    legalBases: legalBases.map((code) => coded(code, context.vocabulary.legalBases)!),
    categories: labelsOf(errand.labels, FOLLOW_UP_LABEL_CLASSIFICATIONS.category),
    subcategories: labelsOf(errand.labels, FOLLOW_UP_LABEL_CLASSIFICATIONS.subcategory),
    measureCount: errand.measures.length,
    labelPaths,
    keyFigures: followUpKeyFiguresOf({ labelPaths, legalBases, status: errand.status, created }, context.keyFigures),
  };
};

/**
 * Where a measure stands: carried out once it has an execution date, otherwise as its decision leaves it -
 * planned when approved in full or in part, rejected, or still a proposal nobody has decided on.
 */
export const measureStatus = (measure: Pick<UnitFollowUpMeasure, 'executed' | 'accept'>): FollowUpMeasureStatus => {
  if (measure.executed) return 'executed';
  if (measure.accept === 'TRUE' || measure.accept === 'REWORK') return 'planned';
  if (measure.accept === 'FALSE') return 'rejected';
  return 'proposed';
};

/** The follow-up's answer to whether the measure had the effect sought; no answer is no effect recorded. */
const measureEffect = (result: string | null | undefined): FollowUpOption | undefined => {
  if (result === 'COMPLETED') return yesNo('yes');
  if (result === 'NOT_COMPLETED') return yesNo('no');
  return undefined;
};

const toFollowUpMeasureRows = (
  errand: UnitFollowUpErrand,
  errandRow: FollowUpErrandRow,
  context: FollowUpRowContext
): FollowUpMeasureRow[] =>
  errand.measures.map((measure, index) => {
    const typeName = measure.type ?? '';
    const status = measureStatus(measure);
    return {
      key: `${errand.id}:${measure.id ?? index}`,
      errand: errandRow,
      type: {
        value: typeName,
        label: context.measureTypes.find((type) => type.name === typeName)?.displayName || typeName || 'Typ saknas',
      },
      addedBy: measure.addedByUser ? context.personName(measure.addedByUser) ?? measure.addedByUser : undefined,
      status: FOLLOW_UP_MEASURE_STATUSES.find((option) => option.value === status)!,
      started: day(measure.plannedStart),
      completed: day(measure.executed),
      effect: measureEffect(measure.result),
      description: measure.description,
      goal: measure.goal,
      resultText: measure.resultText,
    };
  });

export interface FollowUpRows {
  readonly errands: FollowUpErrandRow[];
  readonly measures: FollowUpMeasureRow[];
}

export const toFollowUpRows = (errands: readonly UnitFollowUpErrand[], context: FollowUpRowContext): FollowUpRows => {
  const errandRows: FollowUpErrandRow[] = [];
  const measureRows: FollowUpMeasureRow[] = [];
  for (const errand of errands) {
    const errandRow = toFollowUpErrandRow(errand, context);
    errandRows.push(errandRow);
    measureRows.push(...toFollowUpMeasureRows(errand, errandRow, context));
  }
  return { errands: errandRows, measures: measureRows };
};
