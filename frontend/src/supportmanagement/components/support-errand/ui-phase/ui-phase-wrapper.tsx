import { useMetadataStore, useSupportStore } from '@stores/index';
import { getActiveSupportPhaseId, getSupportPhases } from '@supportmanagement/services/support-phase-service';
import { Fragment, useMemo } from 'react';

import { SupportUiPhaseComponent } from './ui-phase.component';

/**
 * Where the errand stands in the workflow. Display only: the phase is changed from the sidebar's
 * process button, as in CaseData, so the strip carries no controls of its own.
 */
export const SupportUiPhaseWrapper = () => {
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const supportErrand = useSupportStore((s) => s.supportErrand);

  const phases = useMemo(() => getSupportPhases(supportMetadata?.phases), [supportMetadata?.phases]);
  const activePhaseId = getActiveSupportPhaseId(supportErrand?.phases);
  const activeIndex = phases.findIndex((p) => p.id === activePhaseId);

  // Three names fit; the window follows the active phase. An errand that has not entered the
  // workflow has no active phase, and showing no names at all left the strip unreadable - it falls
  // back to the first three, which is where such an errand is about to start.
  const labelWindowStart = Math.min(Math.max(activeIndex - 1, 0), Math.max(phases.length - 3, 0));

  const arrow = (
    <span className="grow shrink flex items-center justify-center min-w-[28px]">
      <span className="border-t-2 border-r-2 h-[26px] w-[28px] rotate-45 shrink-0"></span>
    </span>
  );

  return (
    <div className="flex items-center gap-16 w-full min-w-0">
      <div className="flex items-center border-2 rounded-button h-[40px] min-w-0 grow" data-cy="phase-strip">
        {phases.map((phase, index) => (
          <Fragment key={phase.id ?? index}>
            {index > 0 ? arrow : null}
            <SupportUiPhaseComponent
              number={index + 1}
              phase={phase.displayName ?? phase.name}
              active={phase.id === activePhaseId}
              showLabel={index >= labelWindowStart && index < labelWindowStart + 3}
              last={index === phases.length - 1}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
};
