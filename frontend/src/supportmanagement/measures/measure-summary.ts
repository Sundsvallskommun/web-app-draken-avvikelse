import { useSupportStore } from '@stores/index';
import { useEffect } from 'react';
import { create } from 'zustand';

import { getSupportMeasures, type MeasuresSnapshot } from './support-measure-service';

/** What the rest of the errand page needs to know about an errand's measures without showing them. */
export interface MeasureSummary {
  /** The errand, and the version the page knew it at, when the measures were read. */
  readonly readFor?: string;
  readonly count: number;
  /** Why the errand may not go on to the follow-up yet, as the BFF says it; absent once nothing stands in the way. */
  readonly followUpRefusal?: string;
  /** Why the errand may not be closed yet, as the close would be refused; absent once nothing stands in the way. */
  readonly closeRefusal?: string;
}

interface MeasureSummaryState {
  readonly summaries: Readonly<Record<string, MeasureSummary>>;
  /** The read under way for each errand, so two askers in the same render make one request. */
  readonly pending: Readonly<Record<string, string>>;
}

const useMeasureSummaryStore = create<MeasureSummaryState>(() => ({ summaries: {}, pending: {} }));

const measureSummaryKey = (errandId: string, errandVersion: number | undefined): string =>
  `${errandId}@${errandVersion}`;

/** What a read of the errand's measures made now is for: the errand as the page knows it at this moment. */
export const currentMeasureSummaryKey = (errandId: string): string => {
  const errand = useSupportStore.getState().supportErrand;
  return measureSummaryKey(errandId, errand?.id === errandId ? errand.version : undefined);
};

/**
 * Takes in a read of the errand's measures. The Åtgärder tab records every load, so what is said outside the tab -
 * that the errand has no measures, that proposals wait for a decision, that the errand may not be closed yet -
 * follows what the handler just did there.
 */
export const recordMeasuresSnapshot = (
  errandId: string,
  snapshot: Pick<MeasuresSnapshot, 'measures' | 'followUpRefusal' | 'closeRefusal'>,
  readFor = currentMeasureSummaryKey(errandId)
): void => {
  useMeasureSummaryStore.setState((state) => {
    const { [errandId]: _finished, ...pending } = state.pending;
    return {
      summaries: {
        ...state.summaries,
        [errandId]: {
          readFor,
          count: snapshot.measures.length,
          followUpRefusal: snapshot.followUpRefusal,
          closeRefusal: snapshot.closeRefusal,
        },
      },
      pending,
    };
  });
};

const readMeasureSummary = (errandId: string, readFor: string): void => {
  if (useMeasureSummaryStore.getState().pending[errandId] === readFor) return;
  useMeasureSummaryStore.setState((state) => ({ pending: { ...state.pending, [errandId]: readFor } }));
  getSupportMeasures(errandId).then(
    (snapshot) => recordMeasuresSnapshot(errandId, snapshot, readFor),
    // Left unknown: whoever asked then says nothing about the measures, and the BFF holds the rules either way.
    () =>
      useMeasureSummaryStore.setState((state) => {
        if (state.pending[errandId] !== readFor) return state;
        const { [errandId]: _failed, ...pending } = state.pending;
        return { pending };
      })
  );
};

/**
 * The errand's measures in summary, or undefined while they are not known.
 *
 * `freshFor` says how current the answer has to be. `'version'` reads again whenever the errand is loaded anew - the
 * Åtgärder tab records its own reads, so a decision made there is in already - for a rule that has to hold now.
 * `'any'` is content with the last read there is, and asks only when there is none.
 */
export function useErrandMeasureSummary(
  errand: { readonly id?: string; readonly version?: number } | undefined,
  enabled: boolean,
  freshFor: 'version' | 'any' = 'version'
): MeasureSummary | undefined {
  const errandId = errand?.id;
  const readFor = errandId ? measureSummaryKey(errandId, errand?.version) : undefined;
  const summary = useMeasureSummaryStore((state) => (errandId ? state.summaries[errandId] : undefined));
  const current = summary !== undefined && (freshFor === 'any' || summary.readFor === readFor);

  useEffect(() => {
    if (!enabled || !errandId || !readFor || current) return;
    readMeasureSummary(errandId, readFor);
  }, [enabled, errandId, readFor, current]);

  return enabled && current ? summary : undefined;
}
