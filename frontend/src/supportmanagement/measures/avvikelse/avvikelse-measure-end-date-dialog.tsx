import type { Measure } from '@common/data-contracts/supportmanagement/data-contracts';
import {
  Alert,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  Textarea,
  useConfirm,
} from '@sk-web-gui/react';
import { isAxiosError } from 'axios';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { measureCanBeFollowedUp } from '../measure-follow-up';
import { measureDateLabels, measureDateTime, measureFormValues, plannedMeasureDateErrors } from './measure-form';

/**
 * Moves an approved measure's end date from the follow-up. The start is part of the decision, so it is shown and not
 * offered: only the end may slip. The description is open in the same step, so the one moving the date can write why.
 */
export function AvvikelseMeasureEndDateDialog({
  measure,
  unavailable = false,
  title,
  onSave,
  onClose,
  onDirtyChange,
}: {
  measure: Measure;
  unavailable?: boolean;
  title: string;
  /** Receives the new end date as the timestamp the API stores, and the description where it was rewritten. */
  onSave: (plannedComplete: string, description?: string) => Promise<void>;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const heading = useRef<HTMLSpanElement>(null);
  const busy = useRef(false);
  const { plannedStart, plannedComplete: savedEnd } = measureFormValues(measure);
  const savedDescription = measure.description ?? '';
  const [plannedComplete, setPlannedComplete] = useState(savedEnd);
  const [description, setDescription] = useState(savedDescription);
  const [dateError, setDateError] = useState<string>();
  const [descriptionError, setDescriptionError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const available = !unavailable && measureCanBeFollowedUp(measure);
  const dateChanged = plannedComplete !== savedEnd;
  const descriptionChanged = description !== savedDescription;
  const dirty = dateChanged || descriptionChanged;

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const requestClose = async () => {
    if (busy.current) return;
    if (
      dirty &&
      !(await confirm.showConfirmation(
        'Avbryt ändringen?',
        'Dina ändringar sparas inte. Vill du fortsätta?',
        'Ja, avbryt',
        'Nej, behåll',
        'warning',
        'question'
      ))
    )
      return;
    if (!busy.current) onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || !available) return;
    const error = plannedMeasureDateErrors(plannedStart, plannedComplete).plannedComplete;
    const missingDescription = description.trim() ? undefined : 'Beskriv vad åtgärden innebär.';
    setDateError(error);
    setDescriptionError(missingDescription);
    setSaveError(undefined);
    if (error || missingDescription) return;
    busy.current = true;
    setSaving(true);
    try {
      await onSave(measureDateTime(plannedComplete), descriptionChanged ? description : undefined);
    } catch (cause) {
      setSaveError(endDateSaveError(cause));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      show
      // Titled in the modal's own header, which takes the focus so that the title is read first.
      label={
        <span ref={heading} tabIndex={-1} className="focus-visible:outline focus-visible:outline-2">
          Ändra slutdatum
        </span>
      }
      closeLabel="Stäng"
      closeButtonProps={{ disabled: saving }}
      disableCloseOutside
      initialFocus={heading}
      className="w-full max-w-[60rem]"
      onClose={() => void requestClose()}
    >
      <Modal.Content>
        <form onSubmit={submit} noValidate aria-busy={saving} className="flex flex-col gap-24">
          <section aria-label="Åtgärden" className="border-1 rounded-12 p-16 flex flex-col gap-8">
            <h4 className="font-bold">{title}</h4>
            {plannedStart && (
              <p data-cy="measure-decided-start">
                <strong>Påbörjas:</strong> {plannedStart}
              </p>
            )}
          </section>
          <p>Startdatumet är beslutat och ändras inte. Slutdatumet kan flyttas om åtgärden tar längre tid.</p>
          {!available && <p role="status">Åtgärden är redan uppföljd, och slutdatumet kan inte längre ändras.</p>}
          {saveError && (
            <div role="alert">
              <Alert type="error">
                <Alert.Content>{saveError}</Alert.Content>
              </Alert>
            </div>
          )}
          <FormControl id={`${id}-plannedComplete`} invalid={Boolean(dateError)} className="w-full">
            <FormLabel>{measureDateLabels.plannedComplete} (Obligatoriskt)</FormLabel>
            <Input
              id={`${id}-plannedComplete`}
              type="date"
              value={plannedComplete}
              min={plannedStart || undefined}
              onChange={(event) => setPlannedComplete(event.target.value)}
              disabled={saving || !available}
              aria-required
              className="w-full"
            />
            {dateError && <FormErrorMessage>{dateError}</FormErrorMessage>}
          </FormControl>
          <FormControl id={`${id}-description`} invalid={Boolean(descriptionError)} className="w-full">
            <FormLabel>Beskrivning av åtgärd (Obligatoriskt)</FormLabel>
            <Textarea
              id={`${id}-description`}
              value={description}
              rows={6}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving || !available}
              aria-required
              aria-describedby={`${id}-description-help`}
              className="w-full"
            />
            <FormHelperText id={`${id}-description-help`}>
              Skriv här varför slutdatumet ändras. Beskrivningen sparas tillsammans med det nya datumet.
            </FormHelperText>
            {descriptionError && <FormErrorMessage>{descriptionError}</FormErrorMessage>}
          </FormControl>
          <div className="flex flex-wrap gap-12">
            {/* The step is the date's: the description is rewritten to explain a move, not on its own. */}
            <Button type="submit" disabled={saving || !available || !dateChanged} loading={saving}>
              Spara slutdatum
            </Button>
            <Button type="button" variant="secondary" disabled={saving} onClick={() => void requestClose()}>
              Avbryt
            </Button>
          </div>
        </form>
      </Modal.Content>
    </Modal>
  );
}

function endDateSaveError(cause: unknown): string {
  switch (isAxiosError(cause) ? cause.response?.status : undefined) {
    case 400:
      return 'Slutdatumet kunde inte sparas. Kontrollera att det inte ligger före startdatumet.';
    case 401:
    case 403:
      return 'Du saknar behörighet att ändra åtgärdens slutdatum.';
    case 409:
    case 412:
      return 'Åtgärden har ändrats av någon annan. Dina ändringar finns kvar: kontrollera dem och spara igen.';
    default:
      return 'Slutdatumet kunde inte sparas. Ladda om åtgärderna innan du försöker igen.';
  }
}
