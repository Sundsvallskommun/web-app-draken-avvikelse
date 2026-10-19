import { closeErrandTabSoon } from '@common/utils/close-errand-tab';
import { getToastOptions } from '@common/utils/toast-message-settings';
import { useConfirm, useSnackbar } from '@sk-web-gui/react';
import { useConfigStore, useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { useInvestigationProfileStore } from '@supportmanagement/investigation/investigation-profile-store';
import { findHeldPhaseEntryRequirement, hidesPhaseEntry } from '@supportmanagement/investigation/investigation-variant';
import { getInvestigationVariant } from '@supportmanagement/investigation/investigation-variant-registry';
import { getSupportMeasures } from '@supportmanagement/measures/support-measure-service';
import { useMeasuresCloseRefusal } from '@supportmanagement/measures/use-measures-close-refusal';
import { useMeasuresFollowUpRefusal } from '@supportmanagement/measures/use-measures-follow-up-refusal';
import {
  getSupportErrandById,
  isSupportErrandLocked,
  setSupportErrandStatus,
  Status,
  SupportErrand,
  updateSupportErrandPhase,
} from '@supportmanagement/services/support-errand-service';
import { supportErrandWriteErrorMessage } from '@supportmanagement/services/support-errand-write-version';
import {
  closesFromActivePhase,
  getActiveSupportPhaseId,
  getAvailablePhaseTransitions,
  getSupportPhases,
  isDecisionPhase,
  isSupportPhaseNamed,
} from '@supportmanagement/services/support-phase-service';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';

/**
 * Moving a support errand through its workflow: the transitions out of the active phase, the one the
 * handler has picked, and the write that applies it.
 *
 * The move is explicit - a transition id resolved against the active phase - so a branched phase
 * is never advanced by guessing. With a single transition out it is picked up front; with several
 * the handler chooses.
 */
export const useSupportPhaseTransition = (hasUnsavedChanges: boolean) => {
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const canEditSupportManagement = useUserStore((s) => s.user.permissions.canEditSupportManagement);
  const user = useUserStore((s) => s.user);
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const investigationProfile = useInvestigationProfileStore((s) => s.profile);
  const form = useFormContext<SupportErrand>();
  const toastMessage = useSnackbar();
  const confirm = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTransitionId, setSelectedTransitionId] = useState('');
  const [requirementShown, setRequirementShown] = useState(false);

  const phases = useMemo(() => getSupportPhases(supportMetadata?.phases), [supportMetadata?.phases]);
  const activePhaseId = getActiveSupportPhaseId(supportErrand?.phases);
  // What the investigation requires before a phase is entered is the variant's to say, not this hook's.
  const phaseEntryRequirements = getInvestigationVariant().phaseEntryRequirements;
  // What the errand's measures say about the move is the BFF's answer, read where the move is on offer.
  const measuresFollowUpRefusal = useMeasuresFollowUpRefusal();
  const phaseEntryContext = useMemo(
    () => ({
      errand: supportErrand,
      profile: investigationProfile,
      labelStructure: supportMetadata?.labels?.labelStructure,
      viewer: user,
      measuresFollowUpRefusal,
    }),
    [supportErrand, investigationProfile, supportMetadata?.labels?.labelStructure, user, measuresFollowUpRefusal]
  );
  // A move that is never this viewer's to make is not offered at all.
  const availableTransitions = useMemo(
    () =>
      getAvailablePhaseTransitions(activePhaseId, phases).filter(
        ({ target }) =>
          !hidesPhaseEntry(
            phaseEntryRequirements,
            (phaseName) => isSupportPhaseNamed(target, phaseName),
            phaseEntryContext
          )
      ),
    [activePhaseId, phases, phaseEntryRequirements, phaseEntryContext]
  );
  const selectedTransition = availableTransitions.find(({ transition }) => transition.id === selectedTransitionId);
  const locked = !supportErrand || isSupportErrandLocked(supportErrand);
  // An errand created outside the workflow has no phase to move from. Entering the first one is the
  // only move it has, and it names no transition - so the button must not wait for one.
  const entersWorkflow = phases.length > 0 && !activePhaseId;
  // In the last phase, when it allows closing, closing is the step left to take and the button takes it.
  const closesErrand = !entersWorkflow && closesFromActivePhase(activePhaseId, phases);

  // While a requirement is unmet for the chosen move, the button does what it asks instead of moving the
  // errand - and says so, rather than promising a phase change the handler will not get.
  const heldRequirement = findHeldPhaseEntryRequirement(
    phaseEntryRequirements,
    (phaseName) => isSupportPhaseNamed(selectedTransition?.target, phaseName),
    phaseEntryContext
  );

  useEffect(() => {
    setSelectedTransitionId(availableTransitions.length === 1 ? availableTransitions[0].transition.id : '');
  }, [availableTransitions]);

  /**
   * Entering the decision phase with no measure registered is asked about first: there is nothing
   * to decide on yet, and the phase change is a deliberate step past that. The measures are read
   * fresh at the moment of the click, since the tab may have added one since the page loaded. A
   * lookup that fails leaves the phase alone rather than guessing either way; the user retries.
   */
  const confirmMissingMeasures = async (errandId: string): Promise<boolean> => {
    if (!isDecisionPhase(selectedTransition?.target)) return true;
    let measureCount: number;
    try {
      measureCount = (await getSupportMeasures(municipalityId, errandId)).measures.length;
    } catch {
      toastMessage({
        position: 'bottom',
        closeable: false,
        message: 'Ärendets åtgärder kunde inte kontrolleras. Fasen ändrades inte.',
        status: 'error',
      });
      return false;
    }
    if (measureCount > 0) return true;
    return confirm.showConfirmation(
      'Gå till beslutsfasen?',
      'Ärendet har inga registrerade åtgärder. Vill du verkligen gå till beslutsfasen utan att ha skapat några åtgärder?',
      'Ja, byt fas',
      'Nej',
      'warning',
      'question'
    );
  };

  const advancePhase = async () => {
    if (!municipalityId || !supportErrand?.id) return;
    if (!entersWorkflow && !selectedTransition?.transition.id) return;
    if (heldRequirement) {
      setRequirementShown(true);
      return;
    }
    setIsSaving(true);
    try {
      if (!(await confirmMissingMeasures(supportErrand.id))) return;
      const savedErrand = await updateSupportErrandPhase(
        municipalityId,
        supportErrand.id,
        entersWorkflow ? undefined : selectedTransition?.transition.id,
        activePhaseId
      );
      setSupportErrand(savedErrand);
      form.reset(savedErrand);
    } catch (error) {
      // A move the BFF refuses for a reason it names - an investigation not yet completed - says why.
      toastMessage({
        position: 'bottom',
        closeable: false,
        message: supportErrandWriteErrorMessage(error, 'Något gick fel när fasen skulle uppdateras'),
        status: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Closes the errand from the last phase with the status alone - this workflow records no resolution.
   * The status is conditioned on the errand as the page shows it, the closed errand is read back, and then
   * the tab closes, as it does wherever an errand is closed.
   */
  const closeErrand = async () => {
    if (!municipalityId || !supportErrand?.id || typeof supportErrand.version !== 'number') return;
    setIsSaving(true);
    try {
      await setSupportErrandStatus(supportErrand.id, municipalityId, Status.SOLVED, {
        status: supportErrand.status,
        version: supportErrand.version,
      });
      const closed = await getSupportErrandById(supportErrand.id, municipalityId);
      if (closed.error) throw new Error('Could not read back the closed support errand');
      setSupportErrand(closed.errand);
      form.reset(closed.errand);
      toastMessage(getToastOptions({ message: 'Ärendet avslutades', status: 'success' }));
      closeErrandTabSoon();
    } catch (error) {
      toastMessage({
        position: 'bottom',
        closeable: false,
        message: supportErrandWriteErrorMessage(error, 'Något gick fel när ärendet skulle avslutas'),
        status: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // A close that the measures still stand in the way of is not offered: the handler reports them first.
  const closeRefusal = useMeasuresCloseRefusal(closesErrand);

  // The controls are unusable while anything would be lost or overwritten by the move; advancing
  // additionally needs a transition to apply, unless the errand is only entering the workflow or closing.
  const controlsDisabled = !canEditSupportManagement || locked || hasUnsavedChanges || isSaving;
  const canAdvance =
    !controlsDisabled &&
    Boolean(supportErrand?.id) &&
    typeof supportErrand?.version === 'number' &&
    (entersWorkflow || (closesErrand && !closeRefusal) || Boolean(selectedTransition));

  /** The requirement that holds the move, shown while the handler deals with it. */
  const phaseEntryRequirementDialog: ReactNode =
    requirementShown && heldRequirement
      ? heldRequirement.render({ onClose: () => setRequirementShown(false), context: phaseEntryContext })
      : null;

  return {
    availableTransitions,
    selectedTransitionId,
    setSelectedTransitionId,
    entersWorkflow,
    isSaving,
    controlsDisabled,
    canAdvance,
    closeRefusal,
    advancePhase,
    /** Set in the last phase when it allows closing: the button closes the errand instead of moving it. */
    closesErrand,
    closeErrand,
    /** Set while the chosen move is held by a requirement: the button does that instead, and says so. */
    heldActionLabel: heldRequirement?.actionLabel,
    phaseEntryRequirementDialog,
  };
};
