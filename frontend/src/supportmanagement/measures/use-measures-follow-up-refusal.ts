'use client';

import { useMetadataStore, useSupportStore } from '@stores/index';
import {
  getActiveSupportPhaseId,
  getAvailablePhaseTransitions,
  getSupportPhases,
  isSupportPhaseNamed,
} from '@supportmanagement/services/support-phase-service';
import { useMemo } from 'react';

import { MEASURE_FOLLOW_UP_PHASE_NAME } from './measure-phases';
import { useErrandMeasureSummary } from './measure-summary';

/**
 * Why the open errand's measures keep it from the follow-up, in the words the phase change itself would be refused
 * with: proposals that wait for their decision. Undefined once nothing stands in the way, where measures are off,
 * where the errand has no way into the follow-up from its phase, and while it is not known - the BFF refuses the
 * move on the same rule either way.
 */
export function useMeasuresFollowUpRefusal(): string | undefined {
  const errand = useSupportStore((state) => state.supportErrand);
  const metadataPhases = useMetadataStore((state) => state.supportMetadata?.phases);
  const leadsToFollowUp = useMemo(
    () =>
      getAvailablePhaseTransitions(getActiveSupportPhaseId(errand?.phases), getSupportPhases(metadataPhases)).some(
        ({ target }) => isSupportPhaseNamed(target, MEASURE_FOLLOW_UP_PHASE_NAME)
      ),
    [errand?.phases, metadataPhases]
  );

  return useErrandMeasureSummary(errand, leadsToFollowUp)?.followUpRefusal;
}
