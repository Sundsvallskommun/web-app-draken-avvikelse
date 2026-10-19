import { useEffect } from 'react';
import { create } from 'zustand';

import { getSupportMeasures, type MeasuresSnapshot } from './support-measure-service';

/** What the rest of the errand page needs to know about an errand's measures without showing them. */
export interface MeasureSummary {
  /** The errand and version the measures were read at, where the read was made for one. */
  readonly readFor?: string;
  readonly count: number;
  /** Why the errand may not go on to the follow-up yet, as the BFF says it; absent once nothing stands in the way. */
  readonly followUpRefusal?: string;
}

interface MeasureSummaryState {
  readonly summaries: Readonly<Record<string, MeasureSummary>>;
  /** The read under way for each errand, so two askers in the same render make one request. */
  readonly pending: Readonly<Record<string, string>>;
}

const useMeasureSummaryStore = create<MeasureSummaryState>(() => ({ summaries: {}, pending: {} }));

const measureSummaryKey = (errandId: string, errandVersion: number | undefined): string =>
  `${errandId}@${errandVersion}`;

/**
 * Takes in a read of the errand's measures. The Åtgärder tab records every load, so what is said outside the tab -
 * that the errand has no measures, that proposals wait for a decision - follows what the handler just did there.
 */
export const recordMeasuresSnapshot = (
  errandId: string,
  snapshot: Pick<MeasuresSnapshot, 'measures' | 'errandVersion' | 'followUpRefusal'>,
  readFor = measureSummaryKey(errandId, snapshot.errandVersion)
): void => {
  useMeasureSummaryStore.setState((state) => {
    const { [errandId]: _finished, ...pending } = state.pending;
    return {
      summaries: {
        ...state.summaries,
        [errandId]: { readFor, count: snapshot.measures.length, followUpRefusal: snapshot.followUpRefusal },
      },
      pending,
    };
  });
};

const readMeasureSummary = (municipalityId: string, errandId: string, readFor: string): void => {
  if (useMeasureSummaryStore.getState().pending[errandId] === readFor) return;
  useMeasureSummaryStore.setState((state) => ({ pending: { ...state.pending, [errandId]: readFor } }));
  getSupportMeasures(municipalityId, errandId).then(
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
 * `freshFor` says how current the answer has to be. `'version'` reads again whenever the errand's version moves -
 * a decision on a measure moves it - for a rule that has to hold now. `'any'` is content with the last read there
 * is, and asks only when there is none.
 */
export function useErrandMeasureSummary(
  municipalityId: string | undefined,
  errand: { readonly id?: string; readonly version?: number } | undefined,
  enabled: boolean,
  freshFor: 'version' | 'any' = 'version'
): MeasureSummary | undefined {
  const errandId = errand?.id;
  const readFor = errandId ? measureSummaryKey(errandId, errand?.version) : undefined;
  const summary = useMeasureSummaryStore((state) => (errandId ? state.summaries[errandId] : undefined));
  const current = summary !== undefined && (freshFor === 'any' || summary.readFor === readFor);

  useEffect(() => {
    if (!enabled || !municipalityId || !errandId || !readFor || current) return;
    readMeasureSummary(municipalityId, errandId, readFor);
  }, [enabled, municipalityId, errandId, readFor, current]);

  return enabled && current ? summary : undefined;
}
