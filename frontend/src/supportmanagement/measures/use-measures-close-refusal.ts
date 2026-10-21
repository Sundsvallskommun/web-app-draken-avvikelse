'use client';

import { useSupportStore } from '@stores/index';

import { useErrandMeasureSummary } from './measure-summary';

/**
 * Why the errand may not be closed yet because of its measures, in the words the close itself would be refused
 * with. Undefined once nothing stands in the way, where measures are off, while it is being read, and when it
 * could not be read: the BFF refuses the close on the same rule either way, so the control is never the only guard.
 *
 * Read again whenever the errand is loaded anew, and taken from every read the Åtgärder tab makes, so a decision or a
 * follow-up made there is in at once.
 */
export function useMeasuresCloseRefusal(closes: boolean): string | undefined {
  const errand = useSupportStore((state) => state.supportErrand);
  return useErrandMeasureSummary(errand, closes)?.closeRefusal;
}
