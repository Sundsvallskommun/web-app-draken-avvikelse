import type { Phase } from '@common/data-contracts/supportmanagement/data-contracts';
import { useMetadataStore, useSupportStore } from '@stores/index';
import { getInitialSupportPhaseToLeave } from '@supportmanagement/services/support-phase-service';
import { useMemo } from 'react';

/**
 * The phase sending messages waits for the errand to leave, or undefined when messages can be sent.
 *
 * A namespace that runs its errands through a workflow answers them once they have been taken on, not
 * while they are still in the phase they were registered in. Every other deployment sends messages
 * from the first minute, as it always has.
 */
export const useSupportMessagingPhase = (): Phase | undefined => {
  const errandPhases = useSupportStore((state) => state.supportErrand?.phases);
  const metadataPhases = useMetadataStore((state) => state.supportMetadata?.phases);
  return useMemo(() => getInitialSupportPhaseToLeave({ metadataPhases, errandPhases }), [errandPhases, metadataPhases]);
};
