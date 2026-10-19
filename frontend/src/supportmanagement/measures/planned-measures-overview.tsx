import { getNameFromADUsername } from '@common/services/user-service';
import { Badge, Button, FormControl, FormLabel, Input, Label, Link, SearchField, Spinner } from '@sk-web-gui/react';
import { useConfigStore, useUserStore } from '@stores/index';
import { isAxiosError } from 'axios';
import dayjs from 'dayjs';
import { ExternalLink } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { measureDecisionPresentation } from './measure-decision';
import { measureTypeLabel } from './measure-types';
import {
  describeDeadlineDistance,
  emptyPlannedMeasureDateRange,
  filterPlannedMeasures,
  filterPlannedMeasuresByDate,
  formatDeadlineDay,
  groupPlannedMeasures,
  isPlannedMeasureDateRangeSet,
  isPlannedMeasureOverdue,
  plannedMeasureDeadline,
  type PlannedMeasureGroup,
  type PlannedSupportMeasure,
} from './planned-measures';
import { getPlannedSupportMeasures, type PlannedMeasuresSnapshot } from './support-measure-service';

type OverviewState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  // A refresh keeps the list on screen; only the first load shows the spinner.
  | { status: 'ready'; snapshot: PlannedMeasuresSnapshot; refreshing: boolean; refreshError?: string };

const readErrorMessage = (cause: unknown): string =>
  isAxiosError(cause) && [401, 403].includes(cause.response?.status ?? 0)
    ? 'Du saknar behörighet att läsa åtgärder.'
    : 'Planerade åtgärder kunde inte hämtas.';

const date = (value?: string) => (value ? dayjs(value).format('YYYY-MM-DD') : undefined);

/**
 * The planned work across every errand the user reaches, read from the BFF's planned overview: approved
 * (fully or partly), dated and not yet executed. Proposals never appear here. It is an agenda rather than a
 * register: rows sit in time buckets by deadline, nearest first, and each row unfolds in place to the full
 * measure. Every row links back to its errand; the measure itself is followed up there, so this view offers
 * no writes.
 */
export function PlannedMeasuresOverview() {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const administrators = useUserStore((s) => s.administrators);
  const [state, setState] = useState<OverviewState>({ status: 'loading' });
  const [text, setText] = useState('');
  const [dateRange, setDateRange] = useState(emptyPlannedMeasureDateRange);
  const generation = useRef(0);
  const id = useId();

  // Applies the outcome of one read unless a later read has superseded it. The first read finds the state
  // already loading; only the refreshes mark the list busy, and they do so from event handlers.
  const settle = useCallback((request: number, pending: Promise<PlannedMeasuresSnapshot>) => {
    pending.then(
      (snapshot) => {
        if (request === generation.current) setState({ status: 'ready', snapshot, refreshing: false });
      },
      (cause: unknown) => {
        if (request !== generation.current) return;
        const message = readErrorMessage(cause);
        setState((current) =>
          current.status === 'ready'
            ? { ...current, refreshing: false, refreshError: message }
            : { status: 'failed', message }
        );
      }
    );
  }, []);

  const refresh = useCallback(() => {
    setState((current) =>
      current.status === 'ready' ? { ...current, refreshing: true, refreshError: undefined } : { status: 'loading' }
    );
    settle(++generation.current, getPlannedSupportMeasures(municipalityId));
  }, [municipalityId, settle]);

  const cancelRead = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    if (municipalityId) settle(++generation.current, getPlannedSupportMeasures(municipalityId));
    return cancelRead;
  }, [municipalityId, settle, cancelRead]);

  // The list is a to-do across errands other people write to, so it refreshes when the user comes back to it
  // after following a link into an errand. No polling.
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [refresh]);

  const snapshot = state.status === 'ready' ? state.snapshot : undefined;
  const types = useMemo(() => snapshot?.metadata.measureTypes ?? [], [snapshot]);
  const roles = snapshot?.metadata.roles ?? [];
  const measures = useMemo(() => snapshot?.measures ?? [], [snapshot]);
  const shown = useMemo(
    () => filterPlannedMeasuresByDate(filterPlannedMeasures(measures, text, types), dateRange),
    [measures, text, types, dateRange]
  );
  const dateRangeSet = isPlannedMeasureDateRangeSet(dateRange);
  const groups = useMemo(() => groupPlannedMeasures(shown), [shown]);
  const overdueCount = useMemo(
    () => groupPlannedMeasures(measures).find((group) => group.bucket === 'overdue')?.measures.length ?? 0,
    [measures]
  );
  // Free text today; measures saved by the earlier picker hold an AD username, so resolve those.
  const userLabel = (username?: string) =>
    username ? getNameFromADUsername(username, administrators) || username : undefined;
  const roleLabel = (name?: string) => roles.find((role) => role.name === name)?.displayName || name;

  const errandHref = (measure: PlannedSupportMeasure) =>
    `${process.env.NEXT_PUBLIC_BASEPATH}/arende/${measure.errand.errandNumber}`;

  // Native details/summary: the row is the disclosure, keyboard-operable as is, and a link inside the summary
  // follows the link without toggling the row.
  const item = (measure: PlannedSupportMeasure) => {
    const title = measureTypeLabel(types, measure);
    const decision = measureDecisionPresentation(measure);
    const late = isPlannedMeasureOverdue(measure);
    const deadline = plannedMeasureDeadline(measure);
    const responsible = userLabel(measure.responsibleUser);
    const creator = userLabel(measure.addedByUser);
    const role = roleLabel(measure.addedByRole);
    return (
      <details
        key={`${measure.errand.id}-${measure.id}`}
        className="group border-b-1 border-divider last:border-b-0"
        data-cy="planned-measure-row"
      >
        <summary
          className="list-none [&::-webkit-details-marker]:hidden cursor-pointer grid grid-cols-[9.6rem_minmax(0,1fr)] sm:grid-cols-[9.6rem_minmax(0,1fr)_auto] items-center gap-x-16 gap-y-4 py-12 px-8 rounded-4 hover:bg-background-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={`${title}, ${measure.errand.errandNumber}, klar senast ${formatDeadlineDay(deadline)}${
            late ? ', försenad' : ''
          }. Visa detaljer`}
        >
          <div className={`flex flex-col leading-tight ${late ? 'text-error' : ''}`}>
            <span className="font-bold text-h4-md">{formatDeadlineDay(deadline)}</span>
            <span className={`text-small whitespace-nowrap ${late ? '' : 'text-dark-secondary'}`}>
              {describeDeadlineDistance(deadline)}
            </span>
          </div>
          <div className="flex flex-col min-w-0 gap-2">
            <span className="flex flex-wrap items-center gap-x-8">
              <span className="font-bold">{title}</span>
              <span className="text-dark-secondary" aria-hidden="true">
                ·
              </span>
              <Link
                href={errandHref(measure)}
                target="_blank"
                rel="noopener"
                aria-label={`Ärende ${measure.errand.errandNumber}, öppna ärende i ny flik`}
                className="whitespace-nowrap"
              >
                {measure.errand.errandNumber}
              </Link>
            </span>
            {responsible && (
              <span className="text-small text-dark-secondary truncate max-w-[20rem]">{responsible}</span>
            )}
          </div>
          <span className="col-start-2 sm:col-start-3 justify-self-start sm:justify-self-end">
            <Label rounded inverted color={decision.color} className="whitespace-nowrap">
              {decision.label}
            </Label>
          </span>
        </summary>
        <div className="flex flex-col gap-12 pb-20 pt-4 pl-8 sm:pl-[calc(9.6rem+1.6rem+0.8rem)] pr-8 max-w-[72rem]">
          {measure.description && <p className="m-0 whitespace-pre-wrap break-words">{measure.description}</p>}
          {measure.goal && (
            <p className="m-0 whitespace-pre-wrap break-words">
              <strong>Mål:</strong> {measure.goal}
            </p>
          )}
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-16 gap-y-4 text-small">
            {measure.plannedStart && (
              <>
                <dt className="text-dark-secondary">Påbörjas</dt>
                <dd className="m-0">{date(measure.plannedStart)}</dd>
              </>
            )}
            {measure.plannedComplete && (
              <>
                <dt className="text-dark-secondary">Klar senast</dt>
                <dd className="m-0">{date(measure.plannedComplete)}</dd>
              </>
            )}
            <dt className="text-dark-secondary">Ansvarig</dt>
            <dd className="m-0 break-words">{responsible ?? 'Ingen angiven'}</dd>
            {creator && (
              <>
                <dt className="text-dark-secondary">Registrerad av</dt>
                <dd className="m-0 break-words">
                  {creator}
                  {role ? ` (${role})` : ''}
                  {measure.created ? `, ${date(measure.created)}` : ''}
                </dd>
              </>
            )}
          </dl>
          {measure.acceptMotivation && (
            <div className={`min-w-0 rounded-8 border-l-4 p-12 ${decision.motivationClassName}`}>
              <h4 className="text-label-medium m-0">{decision.motivationLabel}</h4>
              <p className="m-0 whitespace-pre-wrap break-words">{measure.acceptMotivation}</p>
            </div>
          )}
          <div>
            <Link href={errandHref(measure)} target="_blank" rel="noopener" className="no-underline">
              <Button type="button" size="sm" variant="primary" rightIcon={<ExternalLink />}>
                Öppna ärendet
              </Button>
            </Link>
          </div>
        </div>
      </details>
    );
  };

  const section = (group: PlannedMeasureGroup) => (
    <section key={group.bucket} aria-labelledby={`${id}-${group.bucket}`} data-cy={`planned-measures-${group.bucket}`}>
      <h2
        id={`${id}-${group.bucket}`}
        className={`m-0 mb-4 flex items-center gap-8 text-label-medium uppercase tracking-wide ${
          group.bucket === 'overdue' ? 'text-error' : 'text-dark-secondary'
        }`}
      >
        {group.label}
        <Badge
          inverted
          color={group.bucket === 'overdue' ? 'error' : 'vattjom'}
          counter={group.measures.length}
          // Raleway's own figures are old style: 3, 4, 5, 7 and 9 drop below the line, and sit low in the badge.
          className="min-w-fit px-4 lining-nums"
        />
        <span className="grow border-t-1 border-divider" aria-hidden="true" />
      </h2>
      <div className="flex flex-col">{group.measures.map(item)}</div>
    </section>
  );

  let content: ReactNode;
  switch (state.status) {
    case 'loading':
      content = (
        <div role="status" className="py-32">
          <Spinner aria-label="Planerade åtgärder laddas" />
        </div>
      );
      break;
    case 'failed':
      content = (
        <div role="alert" className="flex flex-col gap-16 items-start">
          <p className="m-0">{state.message}</p>
          <Button type="button" variant="secondary" onClick={refresh}>
            Försök igen
          </Button>
        </div>
      );
      break;
    case 'ready':
      content = (
        <div aria-busy={state.refreshing} className="flex flex-col gap-24">
          {state.refreshError && (
            <div role="alert" className="flex flex-col gap-16 items-start">
              <p className="m-0">{state.refreshError} Listan kan vara inaktuell.</p>
              <Button type="button" variant="secondary" onClick={refresh}>
                Försök igen
              </Button>
            </div>
          )}
          {state.snapshot.truncated && (
            <p role="status" className="m-0">
              Listan är ofullständig: det finns fler ärenden med planerade åtgärder än vyn läser in.
            </p>
          )}
          {groups.length === 0 ? (
            <p className="m-0 py-16 text-dark-secondary" data-cy="planned-measures-empty">
              {measures.length === 0
                ? 'Det finns inga planerade åtgärder att arbeta med.'
                : dateRangeSet
                ? 'Inga planerade åtgärder matchar urvalet.'
                : 'Inga planerade åtgärder matchar sökningen.'}
            </p>
          ) : (
            groups.map(section)
          )}
        </div>
      );
      break;
  }

  const summary =
    text.trim() || dateRangeSet
      ? `Visar ${shown.length} av ${measures.length} åtgärder.`
      : `${measures.length} åtgärder${overdueCount ? ` · ${overdueCount} försenade` : ''}.`;

  // Same frame as the errand table and the attestation view: a filter strip on top, the heading and the
  // agenda in the container below.
  return (
    <div className="w-full">
      <div className="box-border py-10 px-40 w-full flex justify-center shadow-lg min-h-[8rem] max-small-device-max:px-24">
        <div className="w-full container px-0 flex flex-wrap items-center gap-16 py-19">
          <SearchField
            value={text}
            size="md"
            aria-label="Sök planerade åtgärder"
            placeholder="Sök ärende, åtgärd, mål eller ansvarig"
            showSearchButton={false}
            onChange={(event) => setText(event.target.value)}
            onReset={() => setText('')}
            className="flex-grow max-w-[48rem]"
            data-cy="planned-measures-search"
          />
          {/* A span of deadlines, either end open. Each field keeps the other from being set past it. */}
          <fieldset className="m-0 flex flex-wrap items-end gap-12 border-0 p-0" data-cy="planned-measures-date-range">
            <legend className="sr-only">Slutdatum inom datumspann</legend>
            <FormControl id={`${id}-from`} size="sm">
              <FormLabel>Slutdatum från</FormLabel>
              <Input
                id={`${id}-from`}
                type="date"
                size="sm"
                value={dateRange.from}
                max={dateRange.to || undefined}
                onChange={(event) => setDateRange((range) => ({ ...range, from: event.target.value }))}
              />
            </FormControl>
            <FormControl id={`${id}-to`} size="sm">
              <FormLabel>Slutdatum till</FormLabel>
              <Input
                id={`${id}-to`}
                type="date"
                size="sm"
                value={dateRange.to}
                min={dateRange.from || undefined}
                onChange={(event) => setDateRange((range) => ({ ...range, to: event.target.value }))}
              />
            </FormControl>
            {dateRangeSet && (
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                onClick={() => setDateRange(emptyPlannedMeasureDateRange)}
              >
                Rensa datum
              </Button>
            )}
          </fieldset>
          {state.status === 'ready' && (
            <p role="status" className="text-small m-0" data-cy="planned-measures-summary">
              {summary}
            </p>
          )}
        </div>
      </div>

      <main className="pl-40 pb-40 w-full">
        <div className="container mx-auto p-0 w-full">
          <div
            className="mt-32 flex flex-col gap-24"
            aria-label="Planerade åtgärder"
            role="region"
            data-cy="planned-measures-overview"
          >
            <div className="flex flex-col gap-4">
              <h1 className="p-0 m-0">Planerade åtgärder</h1>
              <p className="m-0 text-dark-secondary">
                Godkända åtgärder med planerat datum som inte är genomförda, från de ärenden du har tillgång till,
                närmast slutdatum först. Uppföljningen görs i ärendet.
              </p>
            </div>
            {content}
          </div>
        </div>
      </main>
    </div>
  );
}
