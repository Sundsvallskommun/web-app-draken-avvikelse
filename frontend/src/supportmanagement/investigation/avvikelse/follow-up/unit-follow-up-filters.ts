import type { FollowUpKeyFigureKey } from './unit-follow-up-key-figures';
import type { FollowUpErrandRow, FollowUpMeasureRow, FollowUpOption, FollowUpRows } from './unit-follow-up-rows';

/** The follow-up's two lists, which share one set of filters. */
export type UnitFollowUpTab = 'errands' | 'measures';

/**
 * The follow-up's filters. Every list is a set of chosen values, empty meaning "all"; a risk value and a key
 * figure are one value or empty. The period is not here: it decides what the BFF reads, while these narrow
 * what is shown.
 */
export interface UnitFollowUpFilters {
  readonly keyFigure: FollowUpKeyFigureKey | '';
  readonly reportTypes: readonly string[];
  readonly units: readonly string[];
  readonly categories: readonly string[];
  readonly subcategories: readonly string[];
  readonly causeAreas: readonly string[];
  readonly legalBases: readonly string[];
  readonly ivoNotification: readonly string[];
  readonly policeReport: readonly string[];
  readonly statuses: readonly string[];
  readonly riskValueHsl: string;
  readonly riskValueSolLss: string;
  readonly measureTypes: readonly string[];
  readonly measureStatuses: readonly string[];
  readonly effects: readonly string[];
}

export const EMPTY_UNIT_FOLLOW_UP_FILTERS: UnitFollowUpFilters = Object.freeze({
  keyFigure: '',
  reportTypes: [],
  units: [],
  categories: [],
  subcategories: [],
  causeAreas: [],
  legalBases: [],
  ivoNotification: [],
  policeReport: [],
  statuses: [],
  riskValueHsl: '',
  riskValueSolLss: '',
  measureTypes: [],
  measureStatuses: [],
  effects: [],
});

/** What each filter is called, in the filter bar and on the chips naming a chosen value. */
export const FOLLOW_UP_FILTER_LABELS: Readonly<Record<Exclude<keyof UnitFollowUpFilters, 'keyFigure'>, string>> =
  Object.freeze({
    reportTypes: 'Rapporttyp',
    units: 'Enhet',
    categories: 'Ärendetyp',
    subcategories: 'Underkategori',
    causeAreas: 'Orsak till avvikelse',
    legalBases: 'Lagrum',
    ivoNotification: 'IVO-anmälan',
    policeReport: 'Polisanmälan',
    statuses: 'Ärendestatus',
    riskValueHsl: 'Riskvärde HSL',
    riskValueSolLss: 'Riskvärde SOL/LSS',
    measureTypes: 'Åtgärdstyp',
    measureStatuses: 'Status',
    effects: 'Effekt',
  });

export const hasActiveFollowUpFilters = (filters: UnitFollowUpFilters): boolean =>
  Object.values(filters).some((value) => (Array.isArray(value) ? value.length > 0 : value !== ''));

const anyChosen = (chosen: readonly string[], options: readonly (FollowUpOption | undefined)[]): boolean =>
  chosen.length === 0 || options.some((option) => option !== undefined && chosen.includes(option.value));

const riskMatches = (chosen: string, value: number | undefined): boolean => chosen === '' || value === Number(chosen);

/** The errands on the chosen units, or on every unit while none is chosen - what the key figures count. */
export const matchesFollowUpUnits = (row: FollowUpErrandRow, units: readonly string[]): boolean =>
  anyChosen(units, [row.unit]);

export const matchesFollowUpErrandFilters = (row: FollowUpErrandRow, filters: UnitFollowUpFilters): boolean =>
  (filters.keyFigure === '' || row.keyFigures.includes(filters.keyFigure)) &&
  anyChosen(filters.reportTypes, [row.reportType]) &&
  matchesFollowUpUnits(row, filters.units) &&
  anyChosen(filters.categories, row.categories) &&
  anyChosen(filters.subcategories, row.subcategories) &&
  anyChosen(filters.causeAreas, row.causeAreas) &&
  anyChosen(filters.legalBases, row.legalBases) &&
  anyChosen(filters.ivoNotification, [row.ivoNotification]) &&
  anyChosen(filters.policeReport, row.policeReports) &&
  anyChosen(filters.statuses, [row.status]) &&
  riskMatches(filters.riskValueHsl, row.riskValueHsl) &&
  riskMatches(filters.riskValueSolLss, row.riskValueSolLss);

/**
 * A measure is shown when its errand passes the errand filters and the measure passes its own. The police reports
 * are the errands' alone: the Åtgärder tab does not offer them, and they narrow no measure.
 */
export const matchesFollowUpMeasureFilters = (row: FollowUpMeasureRow, filters: UnitFollowUpFilters): boolean =>
  matchesFollowUpErrandFilters(row.errand, { ...filters, policeReport: [] }) &&
  anyChosen(filters.measureTypes, [row.type]) &&
  anyChosen(filters.measureStatuses, [row.status]) &&
  anyChosen(filters.effects, [row.effect]);

/** The distinct options among the values, by name. */
export const distinctFollowUpOptions = (values: readonly (FollowUpOption | undefined)[]): FollowUpOption[] =>
  [
    ...new Map(
      values.filter((value): value is FollowUpOption => value !== undefined).map((value) => [value.value, value])
    ).values(),
  ].sort((left, right) => left.label.localeCompare(right.label, 'sv'));

/**
 * A key figure card shows the errands behind its number: choosing one keeps the chosen units, which the
 * cards count on, and lets go of every other filter so the list holds exactly what the card counted.
 * Choosing it again lets it go.
 */
export const toggleFollowUpKeyFigure = (
  filters: UnitFollowUpFilters,
  keyFigure: FollowUpKeyFigureKey
): UnitFollowUpFilters =>
  filters.keyFigure === keyFigure
    ? { ...filters, keyFigure: '' }
    : { ...EMPTY_UNIT_FOLLOW_UP_FILTERS, units: filters.units, keyFigure };

export interface FollowUpFilterOptions {
  readonly reportTypes: FollowUpOption[];
  readonly units: FollowUpOption[];
  readonly categories: FollowUpOption[];
  readonly subcategories: FollowUpOption[];
  readonly causeAreas: FollowUpOption[];
  readonly legalBases: FollowUpOption[];
  readonly statuses: FollowUpOption[];
  readonly measureTypes: FollowUpOption[];
}

/**
 * What each filter offers: the values the read errands and measures carry. Cause areas also offer every
 * area the schema names, so an area nobody has reported yet can still be looked for.
 */
export const followUpFilterOptions = (
  rows: FollowUpRows,
  causeAreaTitles: ReadonlyMap<string, string>
): FollowUpFilterOptions => ({
  reportTypes: distinctFollowUpOptions(rows.errands.map((row) => row.reportType)),
  units: distinctFollowUpOptions(rows.errands.map((row) => row.unit)),
  categories: distinctFollowUpOptions(rows.errands.flatMap((row) => row.categories)),
  subcategories: distinctFollowUpOptions(rows.errands.flatMap((row) => row.subcategories)),
  causeAreas: distinctFollowUpOptions([
    ...[...causeAreaTitles].map(([value, label]) => ({ value, label })),
    ...rows.errands.flatMap((row) => row.causeAreas),
  ]),
  legalBases: distinctFollowUpOptions(rows.errands.flatMap((row) => row.legalBases)),
  statuses: distinctFollowUpOptions(rows.errands.map((row) => row.status)),
  measureTypes: distinctFollowUpOptions(rows.measures.map((row) => row.type)),
});
