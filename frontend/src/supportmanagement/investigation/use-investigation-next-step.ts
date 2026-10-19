'use client';

import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { useMeasuresFollowUpRefusal } from '@supportmanagement/measures/use-measures-follow-up-refusal';
import { useMemo } from 'react';

import { useInvestigationProfileStore } from './investigation-profile-store';
import type { InvestigationNextStep } from './investigation-variant';
import { getInvestigationNextStep } from './investigation-variant-registry';

/**
 * What the open errand's handler does next, as the running variant tells it. Undefined where the variant says
 * nothing, which is every drake without the slot: the sidebar then shows no step and the errand lands as before.
 */
export function useInvestigationNextStep(): InvestigationNextStep | undefined {
  const errand = useSupportStore((state) => state.supportErrand);
  const supportMetadata = useMetadataStore((state) => state.supportMetadata);
  const profile = useInvestigationProfileStore((state) => state.profile);
  const user = useUserStore((state) => state.user);
  const nextStep = getInvestigationNextStep();
  const measuresFollowUpRefusal = useMeasuresFollowUpRefusal();

  return useMemo(
    () =>
      nextStep?.({
        errand,
        profile,
        labelStructure: supportMetadata?.labels?.labelStructure,
        viewer: user,
        viewerAccount: user.username,
        phases: { metadataPhases: supportMetadata?.phases, errandPhases: errand?.phases },
        measuresFollowUpRefusal,
      }),
    [
      errand,
      measuresFollowUpRefusal,
      nextStep,
      profile,
      supportMetadata?.labels?.labelStructure,
      supportMetadata?.phases,
      user,
    ]
  );
}
