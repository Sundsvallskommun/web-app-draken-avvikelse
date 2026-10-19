import {
  FOLLOW_UP_FILTER_LABELS,
  type FollowUpFilterOptions,
  type UnitFollowUpFilters,
  type UnitFollowUpTab,
} from './unit-follow-up-filters';
import { followUpKeyFigureLabel } from './unit-follow-up-key-figures';
import {
  FOLLOW_UP_MEASURE_STATUSES,
  FOLLOW_UP_POLICE_REPORT,
  FOLLOW_UP_YES_NO,
  type FollowUpOption,
} from './unit-follow-up-rows';

/** One chosen value, as a chip names it, and the filters as they are once it is taken away. */
export interface ActiveFollowUpFilter {
  readonly key: string;
  readonly text: string;
  readonly without: UnitFollowUpFilters;
}

type ListFilterKey = {
  [TKey in keyof UnitFollowUpFilters]: UnitFollowUpFilters[TKey] extends readonly string[] ? TKey : never;
}[keyof UnitFollowUpFilters];

type RiskFilterKey = 'riskValueHsl' | 'riskValueSolLss';

const ERRAND_LIST_FILTERS: readonly ListFilterKey[] = [
  'reportTypes',
  'units',
  'categories',
  'subcategories',
  'causeAreas',
  'legalBases',
  'ivoNotification',
  'policeReport',
  'statuses',
];
const RISK_FILTERS: readonly RiskFilterKey[] = ['riskValueHsl', 'riskValueSolLss'];
/** The errand filters the Åtgärder tab neither offers nor applies. */
const ERRANDS_TAB_ONLY_FILTERS: readonly ListFilterKey[] = ['policeReport'];
const MEASURE_LIST_FILTERS: readonly ListFilterKey[] = ['measureTypes', 'measureStatuses', 'effects'];

const offeredOptions = (
  options: FollowUpFilterOptions
): Readonly<Record<ListFilterKey, readonly FollowUpOption[]>> => ({
  reportTypes: options.reportTypes,
  units: options.units,
  categories: options.categories,
  subcategories: options.subcategories,
  causeAreas: options.causeAreas,
  legalBases: options.legalBases,
  ivoNotification: FOLLOW_UP_YES_NO,
  policeReport: FOLLOW_UP_POLICE_REPORT,
  statuses: options.statuses,
  measureTypes: options.measureTypes,
  measureStatuses: FOLLOW_UP_MEASURE_STATUSES,
  effects: FOLLOW_UP_YES_NO,
});

/**
 * The chosen values that narrow the list on the given tab, one chip each. The measures' own filters are
 * kept while the errands are shown, but narrow nothing there, so they get no chip on that tab. A value no
 * longer offered - the period changed beneath it - is named by its stored key rather than hidden.
 */
export const describeActiveFollowUpFilters = (
  filters: UnitFollowUpFilters,
  options: FollowUpFilterOptions,
  tab: UnitFollowUpTab
): ActiveFollowUpFilter[] => {
  const offered = offeredOptions(options);
  const listChips = (key: ListFilterKey): ActiveFollowUpFilter[] =>
    filters[key].map((value) => ({
      key: `${key}:${value}`,
      text: `${FOLLOW_UP_FILTER_LABELS[key]}: ${offered[key].find((option) => option.value === value)?.label ?? value}`,
      without: { ...filters, [key]: filters[key].filter((chosen) => chosen !== value) },
    }));
  const riskChip = (key: RiskFilterKey): ActiveFollowUpFilter[] =>
    filters[key] === ''
      ? []
      : [{ key, text: `${FOLLOW_UP_FILTER_LABELS[key]}: ${filters[key]}`, without: { ...filters, [key]: '' } }];

  return [
    ...(filters.keyFigure === ''
      ? []
      : [
          {
            key: 'keyFigure',
            text: followUpKeyFigureLabel(filters.keyFigure),
            without: { ...filters, keyFigure: '' as const },
          },
        ]),
    ...ERRAND_LIST_FILTERS.filter((key) => tab === 'errands' || !ERRANDS_TAB_ONLY_FILTERS.includes(key)).flatMap(
      listChips
    ),
    ...RISK_FILTERS.flatMap(riskChip),
    ...(tab === 'measures' ? MEASURE_LIST_FILTERS.flatMap(listChips) : []),
  ];
};
