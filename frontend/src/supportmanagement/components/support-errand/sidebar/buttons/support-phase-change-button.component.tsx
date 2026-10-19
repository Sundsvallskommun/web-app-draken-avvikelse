import { Button, FormControl, FormLabel, Select } from '@sk-web-gui/react';
import { useSupportPhaseTransition } from '@supportmanagement/components/support-errand/ui-phase/use-support-phase-transition';
import { getInvestigationClosingReminder } from '@supportmanagement/investigation/investigation-variant-registry';
import { MeasuresCloseRefusal } from '@supportmanagement/measures/measures-close-refusal.component';
import { ArrowRight } from 'lucide-react';
import { FC, useId } from 'react';

/**
 * The step to the next phase, once handläggning is under way - the counterpart of CaseData's phase
 * changer. A single transition out of the phase is named the way the workflow names it ("Skicka till
 * utredning"); several are chosen between first. In the last phase, when it allows closing, the button
 * closes the errand; a phase with nowhere to go and no closing shows nothing. While the investigation
 * requires something before the chosen phase, the button is named for that instead. The button that closes the
 * errand carries the variant's reminder, if it has one, beneath it.
 */
export const SupportPhaseChangeButtonComponent: FC<{
  disabled: boolean;
  hasUnsavedChanges: boolean;
}> = ({ disabled, hasUnsavedChanges }) => {
  const {
    availableTransitions,
    selectedTransitionId,
    setSelectedTransitionId,
    entersWorkflow,
    isSaving,
    controlsDisabled,
    canAdvance,
    closeRefusal,
    advancePhase,
    closesErrand,
    closeErrand,
    heldActionLabel,
    phaseEntryRequirementDialog,
  } = useSupportPhaseTransition(hasUnsavedChanges);
  const closingReminderId = useId();

  if (!entersWorkflow && !closesErrand && availableTransitions.length === 0) return null;

  const singleTransition = availableTransitions.length === 1 ? availableTransitions[0] : undefined;
  const label = closesErrand
    ? 'Avsluta ärendet'
    : heldActionLabel ??
      (entersWorkflow
        ? 'Starta fasflödet'
        : singleTransition?.transition.description || (singleTransition ? 'Nästa fas' : 'Byt fas'));
  const closingReminder = closesErrand ? getInvestigationClosingReminder() : undefined;

  return (
    <div className="flex flex-col gap-8 w-full">
      {availableTransitions.length > 1 && (
        <FormControl id="phase-transition" className="w-full" disabled={disabled || controlsDisabled}>
          <FormLabel className="text-small">Välj nästa fas</FormLabel>
          <Select
            className="w-full"
            size="sm"
            value={selectedTransitionId}
            onChange={(event) => setSelectedTransitionId(event.target.value)}
            data-cy="phase-transition-select"
          >
            <Select.Option value="">Välj övergång</Select.Option>
            {availableTransitions.map(({ transition, target }) => (
              <Select.Option key={transition.id} value={transition.id}>
                {transition.description || target.displayName || target.name}
              </Select.Option>
            ))}
          </Select>
        </FormControl>
      )}
      <Button
        className="w-full"
        type="button"
        variant="primary"
        color="vattjom"
        rightIcon={closesErrand || heldActionLabel ? undefined : <ArrowRight size={18} />}
        loading={isSaving}
        loadingText={closesErrand ? 'Avslutar ärendet' : 'Byter fas'}
        disabled={disabled || !canAdvance}
        onClick={() => void (closesErrand ? closeErrand() : advancePhase())}
        aria-describedby={closingReminder ? closingReminderId : undefined}
        data-cy="next-phase-button"
      >
        {label}
      </Button>
      {closingReminder && (
        <p id={closingReminderId} className="text-small text-dark-secondary" data-cy="closing-reminder">
          {closingReminder}
        </p>
      )}
      {closesErrand && <MeasuresCloseRefusal refusal={closeRefusal} />}
      {phaseEntryRequirementDialog}
    </div>
  );
};
