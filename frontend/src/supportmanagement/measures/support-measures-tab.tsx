import { Button, Spinner } from '@sk-web-gui/react';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { isAxiosError } from 'axios';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

// One composition point, with business rules in their own module.
// Imported statically on purpose: next/dynamic suspends again when this tab re-renders while its content stays
// mounted (the in-place reload after a save), which hides and re-shows the surrounding subtree and makes the
// design system's Headless UI transitions throw "Did you forget to passthrough the ref".
import { AvvikelseMeasures } from './avvikelse/avvikelse-measures';
import { currentMeasureSummaryKey, recordMeasuresSnapshot } from './measure-summary';
import { getSupportMeasures, type MeasuresSnapshot } from './support-measure-service';

type MeasuresState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  // A reload after our own write keeps the snapshot on screen; only the first load shows the spinner.
  | { status: 'ready'; snapshot: MeasuresSnapshot; refreshing: boolean; refreshError?: string };

const readErrorMessage = (cause: unknown): string =>
  isAxiosError(cause) && [401, 403].includes(cause.response?.status ?? 0)
    ? 'Du saknar behörighet att läsa åtgärder.'
    : 'Åtgärder eller åtgärdsmetadata kunde inte hämtas.';

export function SupportMeasuresTab({
  errand,
  onDirtyChange,
  isActive,
  followUp = false,
}: {
  errand: SupportErrand;
  onDirtyChange: (dirty: boolean) => void;
  isActive: boolean;
  followUp?: boolean;
}) {
  const [state, setState] = useState<MeasuresState>({ status: 'loading' });
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (): Promise<MeasuresSnapshot | undefined> => {
    const request = ++generation.current;
    setState((current) =>
      current.status === 'ready' ? { ...current, refreshing: true, refreshError: undefined } : { status: 'loading' }
    );
    try {
      if (!errand.id) throw new Error('Missing errand ID');
      const readFor = currentMeasureSummaryKey(errand.id);
      const snapshot = await getSupportMeasures(errand.id);
      // What is told outside the tab about the errand's measures - that it has none, that proposals wait for a
      // decision - follows every read.
      recordMeasuresSnapshot(errand.id, snapshot, readFor);
      if (request !== generation.current) return undefined;
      setState({ status: 'ready', snapshot, refreshing: false });
      return snapshot;
    } catch (cause) {
      if (request !== generation.current) return undefined;
      const message = readErrorMessage(cause);
      setState((current) =>
        current.status === 'ready'
          ? { ...current, refreshing: false, refreshError: message }
          : { status: 'failed', message }
      );
      return undefined;
    }
  }, [errand.id]);

  const cancelLoad = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    if (isActive) void load();
    return cancelLoad;
  }, [load, cancelLoad, isActive]);

  // Measures are written by several people, so a view left open goes stale: its decide and edit buttons keep
  // offering work that upstream has already taken. Writes stay guarded by If-Match either way; this only stops
  // the list from lying while nobody is looking at it. Refreshing on return is enough - no polling, no socket.
  useEffect(() => {
    if (!isActive) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load, isActive]);

  let content: ReactNode;
  switch (state.status) {
    case 'loading':
      content = (
        <div role="status">
          <Spinner aria-label="Åtgärder laddas" />
        </div>
      );
      break;
    case 'failed':
      content = (
        <div role="alert" className="flex flex-col gap-16 items-start">
          <p>{state.message}</p>
          <Button type="button" variant="secondary" onClick={() => void load()}>
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
              <p>{state.refreshError} Listan kan vara inaktuell.</p>
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Försök igen
              </Button>
            </div>
          )}
          <AvvikelseMeasures
            snapshot={state.snapshot}
            errand={errand}
            onDirtyChange={onDirtyChange}
            onSaved={() => load()}
            followUp={followUp}
          />
        </div>
      );
      break;
  }

  return (
    <section
      className="p-16 sm:p-32 flex flex-col gap-24"
      aria-label={followUp ? 'Uppföljning' : 'Åtgärder'}
      data-cy={followUp ? 'support-follow-up-tab' : 'support-measures-tab'}
    >
      <h2 ref={heading} tabIndex={-1} className="text-h2-md focus-visible:outline focus-visible:outline-2">
        {followUp ? 'Uppföljning' : 'Åtgärder'}
      </h2>
      {followUp && (
        <p>
          Här visas åtgärderna i det aktuella ärendet. Du kan lägga till nya åtgärder. För att kunna avsluta åtgärderna,
          beskriv vilken effekt de fått. För att kunna avsluta ärendet måste alla åtgärder vara utförda.
        </p>
      )}
      {content}
    </section>
  );
}
