import dayjs, { type Dayjs } from 'dayjs';

import { AVVIKELSE_CLASSIFICATION_POLICY } from '../avvikelse-classification-policy';

export type FollowUpKeyFigureKey = 'deviations' | 'misconducts' | 'legalBaseHsl' | 'legalBaseSolLss' | 'notStarted';

/**
 * What an errand's key figures are read from: its labels' resource paths, its legal bases as the BFF resolved them,
 * its status and its registration day.
 */
export interface FollowUpKeyFigureFacts {
  readonly labelPaths: readonly string[];
  readonly legalBases: readonly string[];
  readonly status?: string;
  readonly created?: string;
}

/** The day the follow-up is read on, and the statuses an errand nobody has started on is in. */
export interface FollowUpKeyFigureContext {
  readonly today: Dayjs;
  readonly notStartedStatuses: readonly string[];
}

interface FollowUpKeyFigureDefinition {
  readonly key: FollowUpKeyFigureKey;
  readonly label: string;
  /** The card is drawn as a warning while any errand counts. */
  readonly warnsWhenAny: boolean;
  readonly applies: (facts: FollowUpKeyFigureFacts, context: FollowUpKeyFigureContext) => boolean;
}

export interface FollowUpKeyFigureCount {
  readonly key: FollowUpKeyFigureKey;
  readonly label: string;
  readonly count: number;
  readonly warning: boolean;
}

const DEVIATION_REPORT_TYPE = 'REPORT_TYPE/DEVIATION';

/** An errand waiting longer than this in its first status is one nobody has started on. */
const NOT_STARTED_AFTER_DAYS = 30;

const { reportedMisconductSelector, classificationGroups } = AVVIKELSE_CLASSIFICATION_POLICY;

/** The legal bases of one classification group: HSL alone, or SoL and LSS together. */
const groupLegalBases = (groupKey: string): string[] =>
  (classificationGroups.find((group) => group.key === groupKey)?.legalBases ?? []).map(({ legalBase }) => legalBase);

const carriesAny =
  (paths: readonly string[]) =>
  ({ labelPaths }: FollowUpKeyFigureFacts): boolean =>
    labelPaths.some((path) => paths.includes(path));

const investigatedUnderAny =
  (codes: readonly string[]) =>
  ({ legalBases }: FollowUpKeyFigureFacts): boolean =>
    legalBases.some((code) => codes.includes(code));

const isNotStarted = ({ status, created }: FollowUpKeyFigureFacts, context: FollowUpKeyFigureContext): boolean =>
  status !== undefined &&
  context.notStartedStatuses.includes(status) &&
  created !== undefined &&
  context.today.startOf('day').diff(dayjs(created).startOf('day'), 'day') > NOT_STARTED_AFTER_DAYS;

/**
 * The follow-up's key figures, in the order the cards are drawn. Report type is read from the same label paths
 * the classification policy reads, so a misconduct LEX took over counts as one. Legal base is what the
 * investigation that classifies the errand says, or the one it was reported under until the investigation says.
 */
const FOLLOW_UP_KEY_FIGURES: readonly FollowUpKeyFigureDefinition[] = Object.freeze([
  {
    key: 'deviations',
    label: 'Rapporterade avvikelser',
    warnsWhenAny: false,
    applies: carriesAny([DEVIATION_REPORT_TYPE]),
  },
  {
    key: 'misconducts',
    label: 'Rapporterade missförhållanden',
    warnsWhenAny: false,
    applies: carriesAny(reportedMisconductSelector.labels.resourcePaths),
  },
  {
    key: 'legalBaseHsl',
    label: 'Ärenden med lagrum HSL',
    warnsWhenAny: false,
    applies: investigatedUnderAny(groupLegalBases('HSL')),
  },
  {
    key: 'legalBaseSolLss',
    label: 'Ärenden med lagrum SOL/LSS',
    warnsWhenAny: false,
    applies: investigatedUnderAny(groupLegalBases('SOL_LSS')),
  },
  {
    key: 'notStarted',
    label: `Ej påbörjade ärenden (>${NOT_STARTED_AFTER_DAYS} dagar)`,
    warnsWhenAny: true,
    applies: isNotStarted,
  },
]);

/** The key figures one errand counts towards. */
export const followUpKeyFiguresOf = (
  facts: FollowUpKeyFigureFacts,
  context: FollowUpKeyFigureContext
): FollowUpKeyFigureKey[] =>
  FOLLOW_UP_KEY_FIGURES.filter((figure) => figure.applies(facts, context)).map((figure) => figure.key);

export const followUpKeyFigureLabel = (key: FollowUpKeyFigureKey): string =>
  FOLLOW_UP_KEY_FIGURES.find((figure) => figure.key === key)?.label ?? key;

/** Every card with the number of errands behind it. */
export const countFollowUpKeyFigures = (
  errands: readonly { readonly keyFigures: readonly FollowUpKeyFigureKey[] }[]
): FollowUpKeyFigureCount[] =>
  FOLLOW_UP_KEY_FIGURES.map(({ key, label, warnsWhenAny }) => {
    const count = errands.filter((errand) => errand.keyFigures.includes(key)).length;
    return { key, label, count, warning: warnsWhenAny && count > 0 };
  });
