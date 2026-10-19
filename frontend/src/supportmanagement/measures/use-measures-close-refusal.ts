'use client';

import { useSupportStore } from '@stores/index';
import { useEffect, useState } from 'react';

import { getSupportMeasures } from './support-measure-service';

/**
 * Why the errand may not be closed yet because of its measures, in the words the close itself would be refused
 * with. Undefined once nothing stands in the way, where measures are off, while it is being read, and when it
 * could not be read: the BFF refuses the close on the same rule either way, so the control is never the only guard.
 *
 * Read again whenever the errand's version moves, which a decision or a follow-up on a measure moves too.
 */
export function useMeasuresCloseRefusal(closes: boolean): string | undefined {
  const errandId = useSupportStore((state) => state.supportErrand?.id);
  const errandVersion = useSupportStore((state) => state.supportErrand?.version);
  const [answer, setAnswer] = useState<{ readFor: string; refusal?: string }>();

  const active = closes && Boolean(errandId) && true;
  const readFor = `${errandId}@${errandVersion}`;

  useEffect(() => {
    if (!active || !errandId) return;
    let cancelled = false;
    getSupportMeasures(errandId).then(
      (snapshot) => {
        if (!cancelled) setAnswer({ readFor, refusal: snapshot.closeRefusal });
      },
      () => {
        if (!cancelled) setAnswer({ readFor });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [active, errandId, readFor]);

  return active && answer?.readFor === readFor ? answer.refusal : undefined;
}
