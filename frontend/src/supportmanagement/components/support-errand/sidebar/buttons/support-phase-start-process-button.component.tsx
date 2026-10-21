import { withRequestGroup } from '@common/services/api-service';
import { Button, useSnackbar } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import {
  getOngoingStatus,
  getSupportErrandById,
  setSupportErrandAdmin,
  setSupportErrandStatus,
  type SupportErrand,
  updateSupportErrandPhase,
} from '@supportmanagement/services/support-errand-service';
import {
  SupportErrandStatusAfterAssignmentError,
  supportErrandWriteErrorMessage,
} from '@supportmanagement/services/support-errand-write-error';
import {
  getActiveSupportPhaseId,
  getSupportPhases,
  isInitialSupportPhase,
  isStatusAllowedInPhase,
  resolveStartProcessPhaseAdvance,
} from '@supportmanagement/services/support-phase-service';
import { ArrowRight } from 'lucide-react';
import { FC, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';

/**
 * Starting handläggning where the namespace runs a workflow: the handler takes the errand and it
 * leaves the phase it was registered in, in one press. The status is the phase's to set.
 *
 * `onSubmit` saves what the sidebar holds a draft of first, and writes nothing when the form is
 * untouched. Either way the errand is started as this page last saw it: each write checks what it
 * depends on of that errand - the assignee, the phase, the status - against the errand as it is now.
 */
export const SupportPhaseStartProcessButtonComponent: FC<{
  disabled: boolean;
  onSubmit: () => Promise<boolean>;
  onError: () => void;
}> = ({ disabled, onSubmit, onError }) => {
  const user = useUserStore((s) => s.user);
  const administrators = useUserStore((s) => s.administrators);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const toast = useSnackbar();
  const starting = useRef(false);
  const [isStarting, setIsStarting] = useState(false);
  const { handleSubmit, reset } = useFormContext();
  const phases = useMemo(() => getSupportPhases(supportMetadata?.phases), [supportMetadata?.phases]);

  const startProcess = async () => {
    if (starting.current) return;
    starting.current = true;
    setIsStarting(true);
    try {
      if (!(await onSubmit())) return;

      // A save puts the errand as saved in the store, so the store holds the errand this page last saw.
      const seen = useSupportStore.getState().supportErrand;
      if (!seen?.id) throw new Error('The support errand is not loaded');

      let assigned = false;
      if (!seen.assignedUserId) {
        const currentAdmin = administrators.find((a) => a.adAccount === user.username);
        if (currentAdmin) {
          // Assignment only: the status is left to the steps below, because it is the phase that
          // declares which statuses the errand may have, and the phase an errand is registered in
          // allows nothing but Ny.
          await setSupportErrandAdmin(seen.id, currentAdmin.adAccount, seen, undefined, currentAdmin.adAccount);
          assigned = true;
        }
      }

      // Taking the errand on is the same event as leaving the phase it was registered in, so the
      // button moves it there. Two moves at most, because an errand that never entered the workflow
      // needs both: entering lands it in the registered phase, which is where it should have been
      // all along, so the same press continues out of it. Once the errand is past that phase,
      // moving on is the handler's choice and this button makes none.
      // The assignment moves neither the phase nor the status, so the moves start from the errand as it was seen.
      let started: SupportErrand = seen;
      for (let move = 0; move < 2; move += 1) {
        const activePhaseId = getActiveSupportPhaseId(started.phases);
        if (activePhaseId && !isInitialSupportPhase(activePhaseId, phases)) break;

        const advance = resolveStartProcessPhaseAdvance(activePhaseId, phases);
        if (!advance) break;

        started = await updateSupportErrandPhase(
          seen.id,
          advance.kind === 'transition' ? advance.transitionId : undefined,
          activePhaseId
        );
      }

      // Where a workflow is configured the status is the phase's to decide - each phase declares the
      // statuses it allows, and Support Management sets the one that belongs to the phase the errand
      // moves into. Only metadata without phases leaves nothing to set it, and there the button still
      // writes the ongoing status.
      const startedPhaseId = getActiveSupportPhaseId(started.phases);
      if (
        phases.length === 0 &&
        started.status !== getOngoingStatus() &&
        isStatusAllowedInPhase(getOngoingStatus(), startedPhaseId, phases)
      ) {
        try {
          await setSupportErrandStatus(seen.id, getOngoingStatus(), started);
        } catch (statusError) {
          throw assigned ? new SupportErrandStatusAfterAssignmentError(statusError) : statusError;
        }
      }

      const updated = await getSupportErrandById(seen.id);
      if (updated.error) throw new Error('Could not confirm the started support errand');
      setSupportErrand(updated.errand);
      reset(updated.errand);

      toast({ message: 'Handläggning startad', status: 'success', position: 'bottom' });
    } catch (err) {
      console.error(err);
      // Keep the caller's draft on every failure, including partial writes.
      toast({
        message: supportErrandWriteErrorMessage(err, 'Något gick fel vid start av handläggning'),
        status: 'error',
        position: 'bottom',
      });
    } finally {
      starting.current = false;
      setIsStarting(false);
    }
  };

  // Saving, taking the errand, the phase moves and the status are one action, so one notification.
  const handleStartProcess = () => withRequestGroup(startProcess);

  return (
    <Button
      className="w-full"
      type="button"
      disabled={disabled || isStarting}
      loading={isStarting}
      onClick={handleSubmit(handleStartProcess, onError)}
      variant="primary"
      color="vattjom"
      rightIcon={<ArrowRight size={18} />}
    >
      Starta handläggning
    </Button>
  );
};
