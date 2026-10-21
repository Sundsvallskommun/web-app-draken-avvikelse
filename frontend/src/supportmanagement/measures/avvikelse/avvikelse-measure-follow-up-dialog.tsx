import type { Measure } from '@common/data-contracts/supportmanagement/data-contracts';
import { Alert, Button, FormControl, FormLabel, Modal, RadioButton, Textarea, useConfirm } from '@sk-web-gui/react';
import { isSupportErrandWriteConflict } from '@supportmanagement/services/support-errand-write-error';
import { isAxiosError } from 'axios';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { measureCanBeFollowedUp, type MeasureFollowUpInput } from '../measure-follow-up';
import { MeasureConflictAlert } from './measure-conflict-alert';

export function AvvikelseMeasureFollowUpDialog({
  measure,
  unavailable = false,
  conflicted = false,
  title,
  onSave,
  onClose,
  onDirtyChange,
}: {
  measure: Measure;
  unavailable?: boolean;
  /** Somebody else changed the measure first: nothing more is sent, and the answers stay to be copied. */
  conflicted?: boolean;
  title: string;
  onSave: (values: MeasureFollowUpInput) => Promise<void>;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const heading = useRef<HTMLSpanElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [effect, setEffect] = useState<'yes' | 'no' | ''>('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();
  const confirm = useConfirm();
  const available = !unavailable && measureCanBeFollowedUp(measure);
  // Kept readable rather than disabled, so that the answers can still be copied.
  const locked = !available || conflicted;
  // Opening this dialog is the user's unsaved choice to mark the measure as completed.
  useEffect(() => {
    onDirtyChange(true);
    return () => onDirtyChange(false);
  }, [onDirtyChange]);
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error]);

  const requestClose = async () => {
    if (busy.current) return;
    if (
      (effect || description) &&
      !locked &&
      !(await confirm.showConfirmation(
        'Avbryt uppföljningen?',
        'Dina svar sparas inte och åtgärden markeras inte som utförd. Vill du fortsätta?',
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
    if (busy.current || locked) return;
    if (!effect || !description.trim()) {
      setError('Välj Ja eller Nej och beskriv vad som har hänt. Båda svaren är obligatoriska.');
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await onSave({ desiredEffectAchieved: effect === 'yes', followUpDescription: description.trim() });
    } catch (cause) {
      // A conflict is told by the container, which stops the dialog (`conflicted`).
      if (isSupportErrandWriteConflict(cause)) return;
      const status = isAxiosError(cause) ? cause.response?.status : undefined;
      setError(
        status === 401 || status === 403
          ? 'Du saknar behörighet att följa upp åtgärden. Dina svar finns kvar.'
          : status === 404
          ? 'Uppföljningen är inte tillgänglig. Ladda om åtgärderna och kontakta administratören om felet kvarstår. Dina svar finns kvar.'
          : 'Uppföljningen kunde inte bekräftas. Dina svar finns kvar. Ladda om åtgärderna innan du försöker igen.'
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      show
      // The title sits in the modal's own header, and takes the focus when the dialog opens so that it is
      // read first - rather than the close button, the first control the header holds.
      label={
        <span ref={heading} tabIndex={-1} className="focus-visible:outline focus-visible:outline-2">
          Följ upp åtgärd
        </span>
      }
      closeLabel="Stäng"
      closeButtonProps={{ disabled: saving }}
      disableCloseOutside
      initialFocus={heading}
      className="w-full max-w-[76rem]"
      onClose={() => void requestClose()}
    >
      <Modal.Content>
        <form onSubmit={submit} noValidate aria-busy={saving} className="flex flex-col gap-24">
          <section aria-label="Åtgärden som följs upp" className="border-1 rounded-12 p-16 flex flex-col gap-8">
            <h4 className="font-bold">{title}</h4>
            <p className="whitespace-pre-wrap break-words">{measure.description}</p>
            <p className="whitespace-pre-wrap break-words">
              <strong>Mål:</strong> {measure.goal}
            </p>
            {measure.acceptMotivation && (
              <p className="whitespace-pre-wrap break-words">
                <strong>Beslutskommentar:</strong> {measure.acceptMotivation}
              </p>
            )}
          </section>
          <p>När du sparar markeras åtgärden som utförd. Svaren visas tillsammans med åtgärden.</p>
          {conflicted && <MeasureConflictAlert title="Uppföljningen sparades inte" />}
          {!available && !conflicted && (
            <p role="status">
              Åtgärden kan inte längre följas upp. Dina svar finns kvar så att du kan kopiera dem innan du stänger.
            </p>
          )}
          {error && (
            <div
              ref={errorSummary}
              tabIndex={-1}
              role="alert"
              className="focus-visible:outline focus-visible:outline-2"
            >
              <Alert type="error">
                <Alert.Content>{error}</Alert.Content>
              </Alert>
            </div>
          )}
          <fieldset disabled={saving} className="flex flex-col gap-24">
            <legend className="sr-only">Uppföljningssvar</legend>
            <FormControl fieldset id={`${id}-effect`} className="w-full">
              <FormLabel>Har åtgärd lett till önskad effekt? (Obligatoriskt)</FormLabel>
              <RadioButton.Group>
                {(['yes', 'no'] as const).map((value) => (
                  <RadioButton
                    key={value}
                    id={`${id}-${value}`}
                    name={`${id}-effect`}
                    value={value}
                    checked={effect === value}
                    onChange={() => setEffect(value)}
                    disabled={locked}
                    aria-required
                  >
                    {value === 'yes' ? 'Ja' : 'Nej'}
                  </RadioButton>
                ))}
              </RadioButton.Group>
            </FormControl>
            <FormControl id={`${id}-description`} className="w-full">
              <FormLabel>Beskriv åtgärdens effekt (Obligatoriskt)</FormLabel>
              <Textarea
                id={`${id}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                readOnly={locked}
                aria-required
                maxLength={4000}
                rows={5}
                className="w-full"
              />
            </FormControl>
          </fieldset>
          <div className="flex flex-wrap gap-12">
            {!conflicted && (
              <Button type="submit" disabled={saving || locked} loading={saving}>
                Spara uppföljning
              </Button>
            )}
            <Button type="button" variant="secondary" disabled={saving} onClick={() => void requestClose()}>
              {conflicted ? 'Stäng' : 'Avbryt'}
            </Button>
          </div>
        </form>
      </Modal.Content>
    </Modal>
  );
}
