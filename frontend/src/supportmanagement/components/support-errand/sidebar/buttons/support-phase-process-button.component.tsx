import { useSupportStore } from '@stores/index';
import { Status } from '@supportmanagement/services/support-errand-service';
import { FC } from 'react';

import { SupportPhaseChangeButtonComponent } from './support-phase-change-button.component';
import { SupportPhaseStartProcessButtonComponent } from './support-phase-start-process-button.component';

/**
 * The process button for a namespace that runs a workflow, as CaseData's phase changer does: it
 * starts handläggning while the errand is new, and moves it on to the next phase after that.
 */
export const SupportPhaseProcessButtonComponent: FC<{
  disabled: boolean;
  hasUnsavedChanges: boolean;
  onSubmit: () => Promise<boolean>;
  onError: () => void;
}> = ({ disabled, hasUnsavedChanges, onSubmit, onError }) => {
  const supportErrand = useSupportStore((s) => s.supportErrand);
  if (!supportErrand) return null;

  return supportErrand.status === Status.NEW ? (
    <SupportPhaseStartProcessButtonComponent disabled={disabled} onSubmit={onSubmit} onError={onError} />
  ) : (
    <SupportPhaseChangeButtonComponent disabled={disabled} hasUnsavedChanges={hasUnsavedChanges} />
  );
};
