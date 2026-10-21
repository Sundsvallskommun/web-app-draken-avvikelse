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
  RadioButton,
  Textarea,
  useConfirm,
} from '@sk-web-gui/react';
import { isSupportErrandWriteConflict } from '@supportmanagement/services/support-errand-write-error';
import { isAxiosError } from 'axios';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { type MeasureDecisionInput, measureDecisionSetsDates } from '../measure-decision';
import { MeasureConflictAlert } from './measure-conflict-alert';
import { measureDateLabels, measureDateTime, measureFormValues, plannedMeasureDateErrors } from './measure-form';

type DecisionErrors = { accept?: string; comment?: string; plannedStart?: string; plannedComplete?: string };

const options: { value: MeasureDecisionInput['accept']; label: string; description: string }[] = [
  { value: 'TRUE', label: 'Godkänn', description: 'Förslaget får genomföras som det är.' },
  { value: 'FALSE', label: 'Avslå', description: 'Förslaget ska inte genomföras. Förklara varför i kommentaren.' },
  {
    value: 'REWORK',
    label: 'Godkänn delvis',
    description: 'Beskriv vilka delar som godkänns, vad som ska genomföras och varför förslaget bara godkänns delvis.',
  },
];

/** Why a decision stopped, when somebody else changed the proposal or decided it first. */
const DECISION_CONFLICT_DESCRIPTION =
  'Någon annan har ändrat förslaget, eller redan fattat ett beslut om det, sedan du öppnade det. Kopiera det du vill behålla, stäng och gör om bedömningen på förslaget som det ser ut nu.';

export function AvvikelseMeasureDecisionDialog({
  measure,
  conflicted = false,
  title,
  onSave,
  onClose,
  onDirtyChange,
}: {
  measure: Measure;
  /** Somebody else changed the proposal or decided it first: nothing more is sent, and the comment stays to be copied. */
  conflicted?: boolean;
  title: string;
  onSave: (decision: MeasureDecisionInput) => Promise<void>;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = useId();
  // A proposal normally has no dates; one registered before that rule keeps its own as a starting point.
  const proposedDates = measureFormValues(measure);
  const [accept, setAccept] = useState<MeasureDecisionInput['accept'] | ''>('');
  const [comment, setComment] = useState('');
  const [plannedStart, setPlannedStart] = useState(proposedDates.plannedStart);
  const [plannedComplete, setPlannedComplete] = useState(proposedDates.plannedComplete);
  const [errors, setErrors] = useState<DecisionErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLSpanElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const dirty = Boolean(
    accept ||
      comment ||
      plannedStart !== proposedDates.plannedStart ||
      plannedComplete !== proposedDates.plannedComplete
  );
  const commentRequired = accept === 'FALSE' || accept === 'REWORK';
  // Approving, whole or in part, decides when the measure runs; a rejection has nothing to plan.
  const datesRequired = measureDecisionSetsDates(accept);
  const hasErrors = Boolean(
    saveError || errors.accept || errors.comment || errors.plannedStart || errors.plannedComplete
  );

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (hasErrors) errorSummary.current?.focus();
  }, [hasErrors, errors]);

  const requestClose = async () => {
    if (busy.current) return;
    if (
      dirty &&
      !conflicted &&
      !(await confirm.showConfirmation(
        'Avbryt bedömning?',
        'Ditt beslut och din kommentar sparas inte. Vill du fortsätta?',
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
    if (busy.current || conflicted) return;
    const motivation = comment.trim();
    const nextErrors: DecisionErrors = {
      accept: accept ? undefined : 'Välj ett beslut.',
      comment: commentRequired && !motivation ? 'Skriv en kommentar till beslutet.' : undefined,
      ...(datesRequired ? plannedMeasureDateErrors(plannedStart, plannedComplete) : {}),
    };
    setErrors(nextErrors);
    setSaveError(undefined);
    if (!accept || Object.values(nextErrors).some(Boolean)) return;
    busy.current = true;
    setSaving(true);
    try {
      const dates = { plannedStart: measureDateTime(plannedStart), plannedComplete: measureDateTime(plannedComplete) };
      await onSave(
        accept === 'FALSE'
          ? { accept, acceptMotivation: motivation }
          : accept === 'REWORK'
          ? { accept, acceptMotivation: motivation, ...dates }
          : { accept, ...(motivation ? { acceptMotivation: motivation } : {}), ...dates }
      );
    } catch (cause) {
      // A conflict is told by the container, which stops the dialog (`conflicted`).
      if (!isSupportErrandWriteConflict(cause)) setSaveError(decisionSaveError(cause));
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
        <span
          id={`${id}-heading`}
          ref={heading}
          tabIndex={-1}
          className="focus-visible:outline focus-visible:outline-2"
        >
          Bedöm åtgärdsförslag
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
        <form
          noValidate
          onSubmit={submit}
          aria-labelledby={`${id}-heading`}
          aria-busy={saving}
          className="flex flex-col gap-24"
        >
          <p>
            Beslutet gäller förslaget nedan. Originalförslaget bevaras och kommentaren visas tillsammans med beslutet.
          </p>
          <section aria-label="Förslaget som bedöms" className="border-1 rounded-12 p-16 flex flex-col gap-8">
            <h4 className="font-bold">{title}</h4>
            <p className="whitespace-pre-wrap break-words">{measure.description}</p>
            <p className="whitespace-pre-wrap break-words">
              <strong>Mål:</strong> {measure.goal}
            </p>
          </section>
          {conflicted && (
            <MeasureConflictAlert title="Beslutet sparades inte" description={DECISION_CONFLICT_DESCRIPTION} />
          )}
          {hasErrors && (
            <div
              ref={errorSummary}
              tabIndex={-1}
              role="alert"
              className="focus-visible:outline focus-visible:outline-2"
            >
              <Alert type="error">
                <Alert.Icon />
                <Alert.Content>
                  <Alert.Content.Title>
                    {saveError ? 'Beslutet kunde inte sparas' : 'Kontrollera beslutet innan du sparar'}
                  </Alert.Content.Title>
                  <Alert.Content.Description>
                    {saveError}
                    {errors.accept && (
                      <p>
                        <a
                          className="underline"
                          href={`#${id}-accept-TRUE`}
                          onClick={(event) => {
                            event.preventDefault();
                            document.getElementById(`${id}-accept-TRUE`)?.focus();
                          }}
                        >
                          {errors.accept}
                        </a>
                      </p>
                    )}
                    {(['comment', 'plannedStart', 'plannedComplete'] as const).map(
                      (field) =>
                        errors[field] && (
                          <p key={field}>
                            <a
                              className="underline"
                              href={`#${id}-${field}`}
                              onClick={(event) => {
                                event.preventDefault();
                                document.getElementById(`${id}-${field}`)?.focus();
                              }}
                            >
                              {errors[field]}
                            </a>
                          </p>
                        )
                    )}
                  </Alert.Content.Description>
                </Alert.Content>
              </Alert>
            </div>
          )}
          <fieldset disabled={saving} className="flex flex-col gap-24 min-w-0">
            <legend className="sr-only">Beslut om åtgärdsförslaget</legend>
            <FormControl fieldset id={`${id}-accept`} invalid={Boolean(errors.accept)} className="w-full">
              <FormLabel>Beslut (Obligatoriskt)</FormLabel>
              <RadioButton.Group>
                {options.map((option) => (
                  <RadioButton
                    key={option.value}
                    id={`${id}-accept-${option.value}`}
                    name={`${id}-decision`}
                    value={option.value}
                    checked={accept === option.value}
                    onChange={() => setAccept(option.value)}
                    disabled={conflicted}
                    aria-required
                    aria-invalid={Boolean(errors.accept)}
                    aria-describedby={`${id}-accept-helptext${errors.accept ? ` ${id}-accept-error` : ''}`}
                  >
                    {option.label}
                  </RadioButton>
                ))}
              </RadioButton.Group>
              <FormHelperText>
                {options.find((option) => option.value === accept)?.description ||
                  'Välj om förslaget godkänns helt, delvis eller avslås.'}
              </FormHelperText>
              {errors.accept && <FormErrorMessage>{errors.accept}</FormErrorMessage>}
            </FormControl>
            {datesRequired && (
              <div className="grid gap-24 sm:grid-cols-2" data-cy="measure-decision-dates">
                {(
                  [
                    ['plannedStart', plannedStart, setPlannedStart],
                    ['plannedComplete', plannedComplete, setPlannedComplete],
                  ] as const
                ).map(([field, value, setValue]) => (
                  <FormControl key={field} id={`${id}-${field}`} invalid={Boolean(errors[field])} className="w-full">
                    <FormLabel>{measureDateLabels[field]} (Obligatoriskt)</FormLabel>
                    <Input
                      id={`${id}-${field}`}
                      type="date"
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                      readOnly={conflicted}
                      aria-required
                      className="w-full"
                    />
                    {errors[field] && <FormErrorMessage>{errors[field]}</FormErrorMessage>}
                  </FormControl>
                ))}
                <FormHelperText className="sm:col-span-2">
                  När åtgärden ska påbörjas och vara klar. Det beslutas här, eftersom förslaget lämnar datumen öppna.
                </FormHelperText>
              </div>
            )}
            <FormControl id={`${id}-comment`} invalid={Boolean(errors.comment)} className="w-full">
              <FormLabel>Beslutskommentar{commentRequired ? ' (Obligatoriskt)' : ' (Valfritt)'}</FormLabel>
              <Textarea
                id={`${id}-comment`}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                readOnly={conflicted}
                aria-required={commentRequired}
                rows={5}
                className="w-full"
              />
              <FormHelperText>
                {accept === 'REWORK'
                  ? 'Ange vad som ska göras och vilka delar som inte godkänns, samt varför. Åtgärden får därefter genomföras enligt kommentaren.'
                  : 'Förklara beslutet. Kommentaren kan läsas av dem som har åtkomst till åtgärden.'}
              </FormHelperText>
              {errors.comment && <FormErrorMessage>{errors.comment}</FormErrorMessage>}
            </FormControl>
          </fieldset>
          <div className="flex flex-wrap gap-12">
            {!conflicted && (
              <Button type="submit" disabled={saving} loading={saving}>
                Spara beslut
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

function decisionSaveError(cause: unknown): string {
  switch (isAxiosError(cause) ? cause.response?.status : undefined) {
    case 400:
      return 'Beslutet kunde inte godkännas. Kontrollera valet, kommentaren och datumen. Dina uppgifter finns kvar.';
    case 401:
    case 403:
      return 'Du saknar behörighet att fatta beslut om förslaget. Dina uppgifter finns kvar.';
    case 503:
      return 'Beslutsfunktionen är inte tillgänglig just nu. Dina uppgifter finns kvar.';
    default:
      return 'Beslutet kunde inte bekräftas. Dina uppgifter finns kvar. Kontrollera åtgärdens aktuella beslut innan du försöker igen.';
  }
}
