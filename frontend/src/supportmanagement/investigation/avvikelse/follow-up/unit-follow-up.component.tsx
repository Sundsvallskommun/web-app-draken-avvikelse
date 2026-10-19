'use client';

import { getNameFromADUsername } from '@common/services/user-service';
import { countWithNoun } from '@common/utils/count-with-noun';
import { Alert, Spinner, Tabs } from '@sk-web-gui/react';
import { useConfigStore, useMetadataStore, useUserStore } from '@stores/index';
import { newStatuses } from '@supportmanagement/services/support-errand-service';
import { isAxiosError } from 'axios';
import dayjs from 'dayjs';
import { FC, ReactNode, useEffect, useMemo, useState } from 'react';

import { describeActiveFollowUpFilters } from './unit-follow-up-active-filters';
import { UnitFollowUpErrandsTable } from './unit-follow-up-errands-table.component';
import { UnitFollowUpFilterBar } from './unit-follow-up-filter-bar.component';
import { UnitFollowUpFilterChips } from './unit-follow-up-filter-chips.component';
import {
  EMPTY_UNIT_FOLLOW_UP_FILTERS,
  followUpFilterOptions,
  matchesFollowUpErrandFilters,
  matchesFollowUpMeasureFilters,
  matchesFollowUpUnits,
  toggleFollowUpKeyFigure,
  type UnitFollowUpFilters,
  type UnitFollowUpTab,
} from './unit-follow-up-filters';
import { countFollowUpKeyFigures, type FollowUpKeyFigureKey } from './unit-follow-up-key-figures';
import { UnitFollowUpKeyFigures } from './unit-follow-up-key-figures.component';
import { UnitFollowUpMeasuresTable } from './unit-follow-up-measures-table.component';
import { defaultUnitFollowUpPeriod, describeUnitFollowUpPeriod } from './unit-follow-up-period';
import { toFollowUpRows } from './unit-follow-up-rows';
import { unitFollowUpHeading } from './unit-follow-up-scope';
import { getUnitFollowUp, type UnitFollowUpPeriod, type UnitFollowUpSnapshot } from './unit-follow-up-service';
import {
  EMPTY_UNIT_FOLLOW_UP_VOCABULARY,
  loadUnitFollowUpVocabulary,
  type UnitFollowUpVocabulary,
} from './unit-follow-up-vocabulary';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; snapshot: UnitFollowUpSnapshot };

const TABS: readonly { key: UnitFollowUpTab; label: string }[] = [
  { key: 'errands', label: 'Ärenden' },
  { key: 'measures', label: 'Åtgärder' },
];

const readErrorMessage = (cause: unknown): string =>
  isAxiosError(cause) && [401, 403].includes(cause.response?.status ?? 0)
    ? 'Du saknar behörighet att läsa uppföljningen.'
    : 'Uppföljningen kunde inte hämtas. Försök igen om en stund.';

/**
 * Verksamhetsuppföljning - Enheter: the errands registered in a period on the units the user reaches, and
 * every measure on them, filtered on what the investigations and decisions say. Support Management decides
 * which errands the user reaches; this reads, it never writes.
 */
export const UnitFollowUp: FC = () => {
  const municipalityId = useConfigStore((state) => state.municipalityId);
  const supportMetadata = useMetadataStore((state) => state.supportMetadata);
  const administrators = useUserStore((state) => state.administrators);
  const user = useUserStore((state) => state.user);
  const [period, setPeriod] = useState<UnitFollowUpPeriod>(() => defaultUnitFollowUpPeriod());
  const [tab, setTab] = useState<UnitFollowUpTab>('errands');
  const [filters, setFilters] = useState<UnitFollowUpFilters>(EMPTY_UNIT_FOLLOW_UP_FILTERS);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [vocabulary, setVocabulary] = useState<UnitFollowUpVocabulary>(EMPTY_UNIT_FOLLOW_UP_VOCABULARY);

  useEffect(() => {
    if (!municipalityId) return;
    let current = true;
    getUnitFollowUp(municipalityId, period).then(
      (snapshot) => current && setState({ status: 'ready', snapshot }),
      (cause: unknown) => current && setState({ status: 'failed', message: readErrorMessage(cause) })
    );
    return () => {
      current = false;
    };
  }, [municipalityId, period]);

  useEffect(() => {
    if (!municipalityId) return;
    let current = true;
    // The vocabulary falls back to its own words on a schema that cannot be read; it never rejects.
    void loadUnitFollowUpVocabulary(municipalityId).then((loaded) => current && setVocabulary(loaded));
    return () => {
      current = false;
    };
  }, [municipalityId]);

  // A new period starts a new read; the lists wait for it rather than showing the old period's rows.
  const changePeriod = (next: UnitFollowUpPeriod) => {
    setState({ status: 'loading' });
    setPeriod(next);
  };

  const rows = useMemo(
    () =>
      toFollowUpRows(state.status === 'ready' ? state.snapshot.errands : [], {
        labelStructure: supportMetadata?.labels?.labelStructure,
        vocabulary,
        statusName: (status) =>
          supportMetadata?.statuses?.find((candidate) => candidate.name === status)?.displayName ?? undefined,
        personName: (account) => getNameFromADUsername(account, administrators),
        measureTypes: state.status === 'ready' ? state.snapshot.measureTypes : [],
        keyFigures: { today: dayjs(), notStartedStatuses: newStatuses },
      }),
    [state, supportMetadata, vocabulary, administrators]
  );
  const options = useMemo(() => followUpFilterOptions(rows, vocabulary.causeAreas), [rows, vocabulary]);
  const shownErrands = useMemo(
    () => rows.errands.filter((row) => matchesFollowUpErrandFilters(row, filters)),
    [rows, filters]
  );
  const shownMeasures = useMemo(
    () => rows.measures.filter((row) => matchesFollowUpMeasureFilters(row, filters)),
    [rows, filters]
  );
  // The cards count the period's errands on the chosen units, whatever else the lists are narrowed by.
  const keyFigures = useMemo(
    () => countFollowUpKeyFigures(rows.errands.filter((row) => matchesFollowUpUnits(row, filters.units))),
    [rows, filters.units]
  );
  const activeFilters = useMemo(() => describeActiveFollowUpFilters(filters, options, tab), [filters, options, tab]);
  const heading = unitFollowUpHeading(user, options.units.length);

  const selectKeyFigure = (key: FollowUpKeyFigureKey) => {
    setFilters((current) => toggleFollowUpKeyFigure(current, key));
    setTab('errands');
  };

  let content: ReactNode;
  if (state.status === 'loading') {
    content = (
      <div className="flex items-center gap-12 py-32" role="status">
        <Spinner size={3} />
        <span>Hämtar uppföljningen...</span>
      </div>
    );
  } else if (state.status === 'failed') {
    content = (
      <Alert type="error" data-cy="follow-up-error">
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Description>{state.message}</Alert.Content.Description>
        </Alert.Content>
      </Alert>
    );
  } else {
    const shown = tab === 'errands' ? shownErrands.length : shownMeasures.length;
    content = (
      <>
        {state.snapshot.truncated && (
          <Alert type="warning" data-cy="follow-up-truncated">
            <Alert.Icon />
            <Alert.Content>
              <Alert.Content.Description>
                Perioden har fler ärenden än som kan visas, så listorna är ofullständiga. Välj en kortare tidsperiod.
              </Alert.Content.Description>
            </Alert.Content>
          </Alert>
        )}
        <p className="m-0" role="status" data-cy="follow-up-summary">
          {tab === 'errands'
            ? `Visar ${countWithNoun(shown, 'ärende', 'ärenden')}`
            : `Visar ${countWithNoun(shown, 'åtgärd', 'åtgärder')}`}
        </p>
        {tab === 'errands' ? (
          <UnitFollowUpErrandsTable rows={shownErrands} />
        ) : (
          <UnitFollowUpMeasuresTable rows={shownMeasures} />
        )}
      </>
    );
  }

  return (
    <main className="pl-40 pb-40 w-full">
      <div className="container mx-auto p-0 w-full">
        <div className="mt-32 flex flex-col gap-24" role="region" aria-label={heading} data-cy="unit-follow-up">
          <div className="flex flex-col gap-4">
            <h1 className="p-0 m-0">{heading}</h1>
            <p className="m-0 text-dark-secondary text-small" data-cy="follow-up-period">
              {describeUnitFollowUpPeriod(period)}
            </p>
          </div>
          {state.status === 'ready' && (
            <UnitFollowUpKeyFigures figures={keyFigures} selected={filters.keyFigure} onSelect={selectKeyFigure} />
          )}
          <Tabs
            current={TABS.findIndex(({ key }) => key === tab)}
            onTabChange={(index: number) => setTab(TABS[index].key)}
            size="md"
          >
            {TABS.map(({ key, label }) => (
              <Tabs.Item key={key}>
                <Tabs.Button data-cy={`follow-up-tab-${key}`}>{label}</Tabs.Button>
                <Tabs.Content>
                  {/* Only the shown tab is drawn: the filters are shared, and one set of them is enough. */}
                  {key === tab && (
                    <div className="flex flex-col gap-24 pt-24">
                      <UnitFollowUpFilterBar
                        tab={key}
                        filters={filters}
                        onFiltersChange={setFilters}
                        options={options}
                        vocabulary={vocabulary}
                        period={period}
                        onPeriodChange={changePeriod}
                      />
                      <UnitFollowUpFilterChips active={activeFilters} onFiltersChange={setFilters} />
                      {content}
                    </div>
                  )}
                </Tabs.Content>
              </Tabs.Item>
            ))}
          </Tabs>
        </div>
      </div>
    </main>
  );
};
