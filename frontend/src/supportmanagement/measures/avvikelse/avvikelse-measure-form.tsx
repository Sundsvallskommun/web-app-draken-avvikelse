import type { Measure, MeasureType, Role } from '@common/data-contracts/supportmanagement/data-contracts';
import {
  Alert,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  RadioButton,
  Select,
  Textarea,
  useConfirm,
} from '@sk-web-gui/react';
import {
  isSupportErrandWriteConflict,
  supportErrandWriteErrorMessage,
} from '@supportmanagement/services/support-errand-write-version';
import { isAxiosError } from 'axios';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { measureContentIsLocked, measureDecisionPresentation } from '../measure-decision';
import { selectableMeasureTypes } from '../measure-types';
import type { MeasuresSnapshot } from '../support-measure-service';
import {
  lockedMeasureDateHelp,
  measureCanExecute,
  measureDateFields,
  measureDateLabels,
  type MeasureForm,
  type MeasureFormErrors,
  measureFormErrors,
  measureFormRebase,
  measureFormValues,
  measureIsUndatedProposal,
  measurePlannedDateIsLocked,
  plannedDateField,
  todayIsoDate,
} from './measure-form';

/** Spelled out instead of an asterisk so the label itself says what is required. */
const Required = () => <span className="font-normal"> (Obligatoriskt)</span>;

export function AvvikelseMeasureForm({
  measure,
  measureTypes,
  creationRoles,
  roles,
  registration,
  onSave,
  errandIsInvestigated = false,
  onCancel,
  onDirtyChange,
}: {
  measure?: Measure;
  measureTypes: readonly MeasureType[];
  creationRoles: readonly Role[];
  roles: readonly Role[];
  registration: MeasuresSnapshot['registration'];
  onSave: (values: MeasureForm) => Promise<void>;
  /** Whether the errand is in Utredning, where a decided measure's content may still be put right. */
  errandIsInvestigated?: boolean;
  /** Abandons the edit of an existing measure; a new measure's form has nothing to abandon. */
  onCancel?: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const defaults = measureFormValues(measure, creationRoles);

  const {
    register,
    watch,
    handleSubmit,
    setValue,
    getValues,
    formState: { isDirty, dirtyFields },
  } = useForm<MeasureForm>({ defaultValues: defaults });
  const timing = watch('timing');
  const roleName = watch('addedByRole');
  const registrationRole = roles.find((role) => role.name === (measure?.addedByRole ?? roleName));
  const roleLabel = registrationRole?.displayName || measure?.addedByRole || roleName;
  const roleRule = registration.roleTypes.find((rule) => rule.roleName === (measure?.addedByRole ?? roleName));
  const availableTypes = roleRule?.measureTypes ?? [];
  // Draken's role policy decides: a deciding role adds accepted measures, every other role adds proposals.
  const contentLocked = Boolean(measure && measureContentIsLocked(measure, errandIsInvestigated));
  const decision = measure ? measureDecisionPresentation(measure) : undefined;
  const proposes = !measure && Boolean(roleName) && !roleRule?.decides;
  // Before a role is chosen the details are disabled anyway; show the full choice until the policy is known.
  const canExecute = !measure && !roleName ? true : measureCanExecute(measure, Boolean(roleRule?.decides));
  // A proposal is planned without dates: the one who approves it says when it runs.
  const undatedProposal =
    (Boolean(measure) || Boolean(roleName)) && measureIsUndatedProposal(measure, Boolean(roleRule?.decides));
  const types = selectableMeasureTypes(measureTypes, availableTypes, measure?.type);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  // One granted role is preselected; the role step only exists when there is an actual choice to make.
  const chooseRole = !measure && creationRoles.length > 1;
  const detailsDisabled = saving || (!measure && !roleName);
  const [errors, setErrors] = useState<MeasureFormErrors>({});
  const [saveError, setSaveError] = useState<string>();
  // Held apart from saveError because the container swaps in the current measure while this catch runs: the right
  // wording depends on what the measure looks like after the rebase, so it is derived at render, not at catch.
  const [conflict, setConflict] = useState<{ fields: string[] } | undefined>();
  // The measure the open draft was started from. A rebase moves this forward; without it there is no way to
  // tell a field the other writer changed from one this user simply never edited.
  const baseline = useRef(measure);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (measure) heading.current?.focus();
  }, [measure]);

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (saveError || conflict || Object.keys(errors).length > 0) errorSummary.current?.focus();
  }, [errors, saveError, conflict]);

  // The container swaps in the current measure after a rejected write. The form is keyed by id, so it is not
  // remounted and the draft survives - but its baseline has moved, and the fields nobody here touched have to
  // follow it. Otherwise the retry would pass If-Match and quietly restore this user's stale values over the
  // other writer's edit, which is the very thing the version check exists to prevent.
  useEffect(() => {
    if (!measure || measure === baseline.current || measure.version === baseline.current?.version) return;
    const previous = baseline.current;
    baseline.current = measure;
    if (!previous) return;
    const { adopt, conflicts } = measureFormRebase(getValues(), dirtyFields, previous, measure);
    // Same widening as in measureFormRebase: the entries come from one MeasureForm, so each value fits its own
    // field, but Object.entries flattens that into string. Left non-dirty so these stay the other writer's.
    for (const [field, value] of Object.entries(adopt) as [keyof MeasureForm, MeasureForm['timing']][]) {
      setValue(field, value, { shouldDirty: false });
    }
    // Only rebaseOnCurrent ever swaps this prop, and it only runs after a rejected write, so the rebase owns
    // the conflict state outright. Making it depend on setConflict having landed first would tie the warning to
    // two components' updates being batched together.
    setConflict({ fields: conflicts });
  }, [measure, getValues, dirtyFields, setValue]);

  // Validation runs in submit(); aria-required instead of the required attribute keeps the theme's :invalid
  // styling off untouched fields, so only reported errors render red.
  // FormControl derives "<id>-error" and "<id>-helptext" from its id and wires aria-describedby itself.
  // The create form and the edit modal can be mounted at the same time, so ids are unique per instance.
  const uid = useId();
  const fieldId = (key: keyof MeasureForm) => `measure${uid}${key}`;
  const headingId = `measure${uid}heading`;
  const detailsId = `measure${uid}details`;
  const errorText = (key: keyof MeasureForm) =>
    errors[key] ? <FormErrorMessage>{errors[key]}</FormErrorMessage> : null;

  const cancel = async () => {
    if (isDirty && !(await confirmDiscardMeasureDraft(confirm))) return;
    onCancel?.();
  };

  const submit = handleSubmit(async (values) => {
    if (saving) return;
    const nextErrors = measureFormErrors(values, measure, { canExecute, undatedProposal });
    setErrors(nextErrors);
    setSaveError(undefined);
    setConflict(undefined);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      // A proposal sends no timing, so no dates either - whatever an earlier role choice left in the form.
      await onSave(undatedProposal ? { ...values, timing: '' } : values);
    } catch (cause) {
      // Only an existing measure can be rebased. A create that conflicts means the errand itself moved on
      // (status guard, 409), and there is nothing merged to report - say that instead.
      if (measure && isSupportErrandWriteConflict(cause)) setConflict({ fields: [] });
      else setSaveError(measureSaveError(cause));
    } finally {
      setSaving(false);
    }
  });

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby={headingId}
      aria-busy={saving}
      className="flex flex-col gap-24 min-w-0 max-w-[76rem]"
    >
      <div className="flex flex-col gap-8">
        <h3
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="text-h3-sm focus-visible:outline focus-visible:outline-2"
        >
          {measure ? 'Redigera åtgärd' : 'Lägg till åtgärder'}
        </h3>
        <p>
          {measure
            ? contentLocked
              ? 'Ärendet har lämnat Utredning, så beslutet låser typ, beskrivning och mål. Du kan uppdatera ansvarig och planering samt rapportera genomförande för en godkänd åtgärd.'
              : 'Uppdatera vad som ska göras, när det ska ske och vilket mål åtgärden har.'
            : chooseRole
            ? 'Börja med att välja vilken roll åtgärden registreras för. Välj sedan åtgärdstyp och beskriv vad som ska göras. Du kan lägga till flera åtgärder.'
            : 'Du kan välja att lägga till flera åtgärder.'}
        </p>
        {measure?.acceptMotivation && decision && (
          <div className={`min-w-0 rounded-8 border-l-4 p-12 ${decision.motivationClassName}`}>
            <p className="text-label-medium">{decision.motivationLabel}</p>
            <p className="whitespace-pre-wrap break-words">{measure.acceptMotivation}</p>
          </div>
        )}
        {proposes && (
          <p data-cy="measure-proposal-notice">
            Åtgärden registreras som ett förslag som den beslutande rollen tar ställning till.
          </p>
        )}
        {measure && (
          <p data-cy="measure-registration-role">
            Åtgärden är registrerad för rollen <strong>{roleLabel || 'okänd'}</strong>. Rollen kan inte ändras i
            efterhand.
          </p>
        )}
      </div>
      {(saveError || conflict || Object.keys(errors).length > 0) && (
        <div
          ref={errorSummary}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="focus-visible:outline focus-visible:outline-2"
          data-cy="measure-form-error"
        >
          <Alert type={conflict ? 'warning' : 'error'}>
            <Alert.Icon />
            <Alert.Content>
              <Alert.Content.Title>
                {conflict
                  ? 'Åtgärden har ändrats av någon annan'
                  : saveError
                  ? 'Åtgärden kunde inte sparas'
                  : 'Kontrollera uppgifterna innan du sparar'}
              </Alert.Content.Title>
              <Alert.Content.Description>
                {conflict
                  ? contentLocked
                    ? 'Ett beslut har fattats, så typ, beskrivning och mål är nu låsta. Dina övriga ändringar ligger kvar - kontrollera vad som fortfarande går att spara.'
                    : conflict.fields.length > 0
                    ? `Fälten är uppdaterade med den andra ändringen, utom där ni båda skrivit: ${conflict.fields.join(
                        ', '
                      )}. Där ligger din text kvar och ersätter den andras om du sparar.`
                    : 'Fälten är uppdaterade med den andra ändringen och din text ligger kvar. Kontrollera dem och spara igen.'
                  : saveError}
                {Object.keys(errors).length > 0 && (
                  <ul className="list-disc ml-20 mt-8">
                    {(Object.keys(errors) as Array<keyof MeasureForm>).map((key) => (
                      <li key={key}>
                        <a
                          className="underline"
                          href={`#${fieldId(key)}`}
                          onClick={(event) => {
                            event.preventDefault();
                            document.getElementById(fieldId(key))?.focus();
                          }}
                        >
                          {errors[key]}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Alert.Content.Description>
            </Alert.Content>
          </Alert>
        </div>
      )}
      {chooseRole && (
        <fieldset
          disabled={saving}
          className="min-w-0 rounded-12 border-1 bg-background-content p-16 sm:p-24 flex flex-col gap-16"
        >
          <legend className="sr-only">Registreringsroll</legend>
          <div className="flex flex-col gap-8">
            <h4 className="text-h3-sm">1. Välj registreringsroll</h4>
            <p>
              Rollen avgör vilka åtgärdstyper du kan välja. Rollen sparas på åtgärden och kan inte ändras i efterhand.
            </p>
          </div>
          <FormControl id={fieldId('addedByRole')} invalid={Boolean(errors.addedByRole)} className="w-full">
            <FormLabel>
              Registrera åtgärden för rollen
              <Required />
            </FormLabel>
            <Select
              id={fieldId('addedByRole')}
              {...register('addedByRole', {
                onChange: (event: { target: { value: string } }) => {
                  setValue('type', '', { shouldDirty: true });
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.addedByRole;
                    delete next.type;
                    return next;
                  });
                },
              })}
              aria-controls={detailsId}
              aria-required
              className="w-full"
            >
              <Select.Option value="">Välj registreringsroll</Select.Option>
              {creationRoles.map((role) => (
                <Select.Option key={role.name} value={role.name}>
                  {role.displayName || role.name}
                </Select.Option>
              ))}
            </Select>
            <FormHelperText role="status">
              {roleName
                ? `Du registrerar åtgärden för ${roleLabel}.`
                : 'Välj en registreringsroll för att fylla i åtgärden.'}
            </FormHelperText>
            {errorText('addedByRole')}
          </FormControl>
        </fieldset>
      )}
      <fieldset id={detailsId} disabled={detailsDisabled} className="flex flex-col gap-24 min-w-0">
        <legend className="sr-only">Uppgifter om åtgärden</legend>
        {chooseRole && <h4 className="text-h3-sm">2. Beskriv åtgärden</h4>}
        <FormControl id={fieldId('type')} invalid={Boolean(errors.type)} className="w-full">
          <FormLabel>
            Åtgärd
            <Required />
          </FormLabel>
          <Select id={fieldId('type')} {...register('type')} disabled={contentLocked} aria-required className="w-full">
            <Select.Option value="">
              {!measure && !roleName ? 'Välj registreringsroll först' : 'Välj typ av åtgärd'}
            </Select.Option>
            {measure?.type && !types.some((type) => type.name === measure.type) && (
              <Select.Option value={measure.type}>{measure.type} (saknas i metadata)</Select.Option>
            )}
            {types.map((type) => (
              <Select.Option key={type.name} value={type.name}>
                {type.displayName || type.name}
                {type.deprecated ? ' (utgången)' : ''}
              </Select.Option>
            ))}
          </Select>
          {contentLocked ? (
            <FormHelperText>Åtgärdstypen är låst efter beslut när ärendet har lämnat Utredning.</FormHelperText>
          ) : (
            registrationRole &&
            types.length === 0 && (
              <FormHelperText>
                Det finns inga aktiva åtgärdstyper kopplade till den valda rollen. Kontakta administratören.
              </FormHelperText>
            )
          )}
          {errorText('type')}
        </FormControl>
        {undatedProposal ? (
          <p data-cy="measure-undated-proposal">
            Ett förslag har inga datum. Start- och slutdatum anges av den som godkänner förslaget.
          </p>
        ) : (
          <>
            <FormControl fieldset id={fieldId('timing')} invalid={Boolean(errors.timing)} className="w-full">
              <FormLabel>
                {/* legend.sk-form-label is display: contents, so keep the text and marker in one box. */}
                <span>
                  Är åtgärden genomförd eller planerad?
                  <Required />
                </span>
              </FormLabel>
              {/* Remount when the option set changes so react-hook-form re-applies the current value to the inputs. */}
              <RadioButton.Group key={canExecute ? 'timing-all' : 'timing-planned'}>
                <RadioButton
                  id={fieldId('timing')}
                  {...register('timing')}
                  value="planned"
                  aria-required
                  disabled={Boolean(measure?.executed)}
                >
                  Planerade åtgärder
                </RadioButton>
                {canExecute && (
                  <RadioButton {...register('timing')} value="executed" aria-required>
                    Genomförda åtgärder
                  </RadioButton>
                )}
              </RadioButton.Group>
              {measure?.executed && <FormHelperText>Åtgärden är registrerad som genomförd.</FormHelperText>}
              {!canExecute && (
                <FormHelperText data-cy="measure-planned-only">
                  Åtgärden måste vara godkänd helt eller delvis innan den kan markeras som genomförd.
                </FormHelperText>
              )}
              {errorText('timing')}
            </FormControl>
            {measureDateFields(timing).length > 0 && (
              <div className="grid gap-24 sm:grid-cols-2">
                {measureDateFields(timing).map((key) => {
                  const plannedKey = plannedDateField(key);
                  const locked = plannedKey !== undefined && measurePlannedDateIsLocked(measure, plannedKey);
                  return (
                    <FormControl key={key} id={fieldId(key)} invalid={Boolean(errors[key])} className="w-full">
                      <FormLabel>
                        {measureDateLabels[key]}
                        <Required />
                      </FormLabel>
                      <Input
                        id={fieldId(key)}
                        type="date"
                        {...register(key)}
                        aria-required
                        max={key === 'executed' ? todayIsoDate() : undefined}
                        readOnly={locked}
                        className="w-full"
                      />
                      {locked && plannedKey && <FormHelperText>{lockedMeasureDateHelp[plannedKey]}</FormHelperText>}
                      {errorText(key)}
                    </FormControl>
                  );
                })}
              </div>
            )}
          </>
        )}
        <FormControl id={fieldId('responsibleUser')} className="w-full">
          <FormLabel>Ansvarig för åtgärden</FormLabel>
          <Input
            id={fieldId('responsibleUser')}
            type="text"
            {...register('responsibleUser')}
            autoComplete="off"
            placeholder="Namn på den som ansvarar för åtgärden"
            className="w-full"
          />
          <FormHelperText>Valfritt. Skriv namn i fritext.</FormHelperText>
        </FormControl>
        <FormControl id={fieldId('description')} invalid={Boolean(errors.description)} className="w-full">
          <FormLabel>
            Beskrivning av åtgärd
            <Required />
          </FormLabel>
          <Textarea
            id={fieldId('description')}
            {...register('description')}
            readOnly={contentLocked}
            aria-required
            rows={6}
            placeholder="Beskriv vad som ska göras…"
            className="w-full"
          />
          {errorText('description')}
        </FormControl>
        <FormControl id={fieldId('goal')} invalid={Boolean(errors.goal)} className="w-full">
          <FormLabel>
            Beskriv syftet med åtgärden
            <Required />
          </FormLabel>
          <Textarea
            id={fieldId('goal')}
            {...register('goal')}
            readOnly={contentLocked}
            aria-required
            rows={3}
            placeholder="Beskriv vad åtgärden ska uppnå…"
            className="w-full"
          />
          {errorText('goal')}
        </FormControl>
      </fieldset>
      <div className="flex flex-wrap gap-12">
        <Button
          type="submit"
          disabled={detailsDisabled || !isDirty || (!measure && types.length === 0)}
          loading={saving}
        >
          {measure ? 'Spara ändringar' : proposes ? 'Lägg till förslag till åtgärd' : 'Lägg till åtgärd'}
        </Button>
        {measure && (
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void cancel()}>
            Avbryt redigering
          </Button>
        )}
      </div>
    </form>
  );
}

/** Shared by the form's own Avbryt redigering and the edit modal's close control. */
export function confirmDiscardMeasureDraft(confirm: ReturnType<typeof useConfirm>): Promise<boolean> {
  return confirm.showConfirmation(
    'Avbryt redigering?',
    'Dina ändringar av åtgärden sparas inte. Vill du fortsätta?',
    'Ja, avbryt',
    'Nej, behåll',
    'warning',
    'question'
  );
}

function measureSaveError(cause: unknown): string {
  switch (isAxiosError(cause) ? cause.response?.status : undefined) {
    case 401:
    case 403:
      return 'Du saknar behörighet att spara åtgärden. Dina uppgifter finns kvar.';
    case 400:
      return 'Uppgifterna kunde inte godkännas. Kontrollera datumen och att typen fortfarande är tillgänglig för rollen. Dina uppgifter finns kvar.';
    case 503:
      return 'Registreringen är inte tillgänglig just nu. Dina uppgifter finns kvar. Kontakta administratören om problemet kvarstår.';
    default:
      return supportErrandWriteErrorMessage(
        cause,
        'Åtgärden kunde inte sparas. Dina uppgifter finns kvar. Försök igen.'
      );
  }
}
