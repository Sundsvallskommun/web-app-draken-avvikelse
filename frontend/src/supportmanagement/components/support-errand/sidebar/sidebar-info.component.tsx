import { findHandlerForOption, optionValueForHandler } from '@common/components/handler-select/handler-option-value';
import { HandlerSelectOptions } from '@common/components/handler-select/handler-select-options.component';
import iconMap from '@common/components/lucide-icon-map/lucide-icon-map.component';
import { withRequestGroup } from '@common/services/api-service';
import { hasDirtyFields, prettyTime } from '@common/services/helper-service';
import { type Admin, getAssignableHandlers, type HandlerDirectory } from '@common/services/user-service';
import { Button, Divider, FormControl, FormLabel, Label, Select, useSnackbar } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { SupportStatusLabelComponent } from '@supportmanagement/components/ongoing-support-errands/components/support-status-label.component';
import { RegisterSupportErrandFormModel } from '@supportmanagement/interfaces/errand';
import { Priority } from '@supportmanagement/interfaces/priority';
import {
  applyInvestigationHandover,
  type InvestigationHandoverStep,
} from '@supportmanagement/investigation/avvikelse/assignment/avvikelse-assignment-service';
import { useInvestigationProfileStore } from '@supportmanagement/investigation/investigation-profile-store';
import {
  getInvestigationClosesOnlyAtWorkflowEnd,
  getInvestigationEarlyClose,
  getInvestigationHandlerFields,
} from '@supportmanagement/investigation/investigation-variant-registry';
import { useInvestigationNextStep } from '@supportmanagement/investigation/use-investigation-next-step';
import {
  getSupportErrandById,
  isSupportErrandLocked,
  readSupportErrandWriteSnapshot,
  resolveWorkingStatus,
  setSupportErrandAdmin,
  Status,
  supportErrandIsEmpty,
  updateSupportErrand,
  validateAction,
} from '@supportmanagement/services/support-errand-service';
import { supportErrandWriteErrorMessage } from '@supportmanagement/services/support-errand-write-version';
import {
  closesFromActivePhase,
  getActiveSupportPhaseId,
  getSupportPhases,
  hasReachedSupportPhase,
} from '@supportmanagement/services/support-phase-service';
import dayjs from 'dayjs';
import { CirclePause, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FC, useEffect, useMemo, useState } from 'react';
import { useFormContext, UseFormReturn } from 'react-hook-form';

import {
  saveParticipantsInTurn,
  selectDirtyParticipants,
  selectHasDirtyParticipant,
  unsavedParticipantsMessage,
  useErrandSaveParticipantsStore,
} from '../errand-save/errand-save-participants';
import { useSupportMessagingPhase } from '../tabs/messages/use-support-messaging-phase';
import { SupportCloseErrandButtonComponent } from './buttons/support-close-errand-button.component';
import { SupportPhaseProcessButtonComponent } from './buttons/support-phase-process-button.component';
import { SupportResumeErrandButton } from './buttons/support-resume-errand-button.component';
import { SupportNextStepCard } from './support-next-step-card.component';

export const SidebarInfo: FC<{
  hasUnsavedChanges: boolean;
}> = (props) => {
  const user = useUserStore((s) => s.user);
  const investigationProfile = useInvestigationProfileStore((s) => s.profile);
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const administrators = useUserStore((s) => s.administrators);
  const handlerRoles = useUserStore((s) => s.handlerRoles);
  const router = useRouter();
  const handlerFields = getInvestigationHandlerFields();
  const nextStep = useInvestigationNextStep();
  // Who may be given *this* errand, which is not the same question as who is a handler at all.
  // Until it answers - and if it cannot - the full directory stands, so the selector is never empty.
  const [assignable, setAssignable] = useState<HandlerDirectory>();
  const assignableHandlers = assignable?.administrators ?? administrators;
  const assignableRoles = assignable?.roles ?? handlerRoles;
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const closesOnlyAtWorkflowEnd =
    getInvestigationClosesOnlyAtWorkflowEnd()?.({
      errand: supportErrand,
      profile: investigationProfile,
      labelStructure: supportMetadata?.labels?.labelStructure,
      viewer: user,
    }) ?? false;
  // Where the investigation holds the early close back to a phase, it is offered from that phase on.
  const earlyClose = getInvestigationEarlyClose();
  const earlyCloseReached =
    !earlyClose ||
    hasReachedSupportPhase(earlyClose.fromPhaseName, {
      metadataPhases: supportMetadata?.phases,
      errandPhases: supportErrand?.phases,
    });
  // In the last phase of a workflow the phase button closes the errand, so it is not offered twice; and an errand the
  // investigation closes only at the end of its workflow is not closed early.
  const offersEarlyClose =
    !closesFromActivePhase(getActiveSupportPhaseId(supportErrand?.phases), getSupportPhases(supportMetadata?.phases)) &&
    !closesOnlyAtWorkflowEnd &&
    earlyCloseReached;
  const selectablePriorities = useMemo(() => {
    if (supportErrand?.priority && supportErrand?.status) {
      return [
        { key: 'LOW', label: Priority.LOW },
        { key: 'MEDIUM', label: Priority.MEDIUM },
        { key: 'HIGH', label: Priority.HIGH },
      ];
    }
    return [];
  }, [supportErrand]);
  const [isLoading, setIsLoading] = useState<boolean>();
  const [error, setError] = useState(false);
  const toastMessage = useSnackbar();
  // Not memoized: whether an errand counts as empty depends on who owns its classification, which the investigation
  // profile says, and the profile can arrive after the errand. An errand the investigation classifies is not an
  // unfinished registration, and its handler acts on it.
  const allowed = (() => {
    // A limited read carries almost nothing of the errand, so it would pass for an empty or unassigned one.
    if (supportErrand?.limitedAccess) return false;
    if (!supportErrandIsEmpty(supportErrand!)) {
      let _a = validateAction(supportErrand!, user);
      if (supportErrand!.assignedUserId?.toLocaleLowerCase() === undefined) {
        if (
          supportErrand!.channel === 'EMAIL' ||
          supportErrand!.channel === 'ESERVICE' ||
          supportErrand!.channel === 'ESERVICE_INTERNAL'
        ) {
          _a = true;
        }
      }
      return _a;
    }
    // Accounts are one account whatever their case, as when the errand's own handler is compared.
    const username = user.username.toLocaleLowerCase();
    return administrators.some((a) => a.adAccount.toLocaleLowerCase() === username);
  })();

  const toast = (kind: 'success' | 'error', label: string) =>
    toastMessage({
      position: 'bottom',
      closeable: false,
      message: label,
      status: kind,
    });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    getValues,
    getFieldState,
    formState,
    formState: { errors },
  }: UseFormReturn<
    Partial<RegisterSupportErrandFormModel> & any & { admin: string; priority: any },
    any,
    undefined
  > = useFormContext();

  const formIsNotValid = useMemo(() => !formState.isValid, [formState.isValid]);

  const { admin, priority } = watch();

  const errandId = supportErrand?.id;
  // Who may be given the errand follows its saved state - a completed investigation that suspects a misconduct
  // makes LEX-ansvarig one - so the directory is read again whenever the saved errand moves on.
  const errandVersion = supportErrand?.version;
  useEffect(() => {
    if (!errandId) {
      setAssignable(undefined);
      return;
    }

    let cancelled = false;
    getAssignableHandlers(errandId)
      .then((directory) => {
        if (!cancelled) setAssignable(directory);
      })
      .catch((error) => {
        // The full directory is already what is on screen; saying so beats an empty selector.
        console.error('Failed to load the handlers assignable to this errand.', error);
      });

    return () => {
      cancelled = true;
    };
  }, [errandId, errandVersion]);

  // Resolved from the list the selector actually offered: a manager reached through AccessMapper
  // need not be in any configured handler group, so looking only in the full directory would
  // silently find nobody and skip the assignment. The option names the role it was chosen under,
  // which is what tells a handover to LEX from an ordinary assignment to the same person.
  const findChosenAdmin = () => findHandlerForOption([...assignableHandlers, ...administrators], getValues().admin);

  /** The option showing the errand's handler, from the list the selector offers and, failing that, the full directory. */
  const assignedOptionValue = (adAccount: string) =>
    optionValueForHandler(assignableHandlers, assignableRoles, adAccount) ??
    optionValueForHandler(administrators, handlerRoles, adAccount);

  // The errand's own directory arrives after the errand. A handler only it knows - a manager reached through
  // AccessMapper - is shown as the assignee once it is there, unless somebody else has been chosen meanwhile.
  useEffect(() => {
    const assignedUserId = supportErrand?.assignedUserId;
    if (!assignable || !assignedUserId || getFieldState('admin').isDirty) return;
    const assigned = assignedOptionValue(assignedUserId);
    if (assigned) setValue('admin', assigned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignable]);

  /** The person the selector gives the errand to, when that is a named handover - to LEX - and not an assignment. */
  const findChosenHandover = () => {
    const chosen = findChosenAdmin();
    return chosen?.handoverStep && supportErrand?.assignedUserId !== chosen.adAccount ? chosen : undefined;
  };

  /**
   * Gives the errand away in its named handover, which moves its access with it. That leaves the errand out of
   * reach, so it is the last write of a save and the page leaves the errand. Answers whether it was handed over.
   */
  const handOver = async (recipient: Admin): Promise<boolean> => {
    try {
      const current = await readSupportErrandWriteSnapshot(supportErrand!.id!);
      if (typeof current.version !== 'number') throw new Error('The support errand version is missing');
      await applyInvestigationHandover(
        supportErrand!.id!,
        recipient.handoverStep as InvestigationHandoverStep,
        current.version,
        recipient.adAccount
      );
      router.push('/oversikt');
      return true;
    } catch (e) {
      console.error('Error when handing the errand over:', e);
      toastMessage({
        position: 'bottom',
        closeable: false,
        message: supportErrandWriteErrorMessage(e, 'Ärendet kunde inte lämnas över. Försök igen.'),
        status: 'error',
      });
      setError(true);
      return false;
    }
  };

  /** Writes the errand's own fields; answers whether they were saved. A failure is told in a toast. */
  const saveErrandFields = async (): Promise<boolean> => {
    try {
      // An errand taken over while it waits accepts nothing but its new handler, so nothing else of it is written.
      if (!takesOverWaitingErrand) {
        await updateSupportErrand(getValues(), supportErrand?.version, supportErrand?.parameters);
      }

      // Handle admin change. The update above is ours and moved the version on, so the version
      // the form was loaded with can no longer be used as the precondition here - unless there was none.
      const newAdmin = findChosenAdmin();
      const newAdminAccount = newAdmin?.adAccount;
      if (supportErrand?.assignedUserId !== newAdminAccount) {
        const assigner = administrators.find((a) => a.adAccount === user.username);
        // A handover is not an assignment: the caller takes it once everything else is saved (handOver).
        if (newAdminAccount && assigner && !newAdmin?.handoverStep) {
          const newStatus =
            newAdminAccount === assigner.adAccount
              ? resolveWorkingStatus(supportErrand?.phases, supportMetadata?.phases)
              : Status.ASSIGNED;
          const expectedVersion = takesOverWaitingErrand
            ? supportErrand?.version
            : (await readSupportErrandWriteSnapshot(supportErrand!.id!)).version;
          await setSupportErrandAdmin(
            supportErrand!.id!,
            newAdminAccount,
            expectedVersion,
            newStatus,
            assigner.adAccount
          );
        }
      }

      // Single fetch + reset after all operations complete
      const e = await getSupportErrandById(getValues().id!);
      if (e.error) throw new Error('Could not confirm the saved support errand');
      setSupportErrand(e.errand);
      reset(e.errand);
      return true;
    } catch (e) {
      console.error('Error when updating errand:', e);
      toastMessage({
        position: 'bottom',
        closeable: false,
        message: supportErrandWriteErrorMessage(e, 'Något gick fel när ärendet uppdaterades'),
        status: 'error',
      });
      setError(true);
      return false;
    }
  };

  /**
   * The save Starta handläggning makes before it takes the errand: the errand's own fields, when they hold a
   * draft, and a handover chosen in Ansvarig after them. An untouched form has nothing to save and writes
   * nothing. Answers whether the start may go on.
   *
   * One save is one action for Support Management: its writes become one notification, not one each.
   */
  const onSubmit = (): Promise<boolean> =>
    withRequestGroup(async () => {
      if (!errandFieldsDirty) return true;
      setError(false);
      setIsLoading(true);
      try {
        // Read before the save resets the form to the errand as saved.
        const handover = findChosenHandover();
        const saved = await saveErrandFields();
        if (saved && handover) {
          // The errand has left; whatever was to follow the save must not act on it.
          if (await handOver(handover)) toast('success', 'Ärendet lämnades över');
          return false;
        }
        if (saved) toast('success', 'Ärendet uppdaterades');
        return saved;
      } finally {
        setIsLoading(false);
      }
    });

  const errandFieldsDirty = hasDirtyFields(formState.dirtyFields);
  const hasDirtyParticipant = useErrandSaveParticipantsStore(selectHasDirtyParticipant);
  const { admin: assigneeChanged, ...otherDirtyFields } = formState.dirtyFields ?? {};
  /**
   * An errand that waits for its handler to resume it is shut to every change. Nobody takes an errand here, though:
   * Ansvarig is how another handler takes it over - a LEX manager from another, say - so a save that changes the
   * assignee and nothing else still goes ahead.
   */
  const takesOverWaitingErrand =
    supportErrand?.status === Status.ASSIGNED &&
    !supportErrand?.limitedAccess &&
    Boolean(assigneeChanged) &&
    !hasDirtyFields(otherDirtyFields) &&
    !hasDirtyParticipant;

  /**
   * Spara ärende saves the errand's own fields, then each part of the errand that holds a draft - the
   * investigation documents - validated and saved on its own. A part that could not be saved is shown,
   * with why, in its own place. A handover chosen in Ansvarig comes last, since it takes the errand
   * out of reach: the errand's own fields first, because the drafts' writes move its version on.
   */
  const saveErrand = () =>
    withRequestGroup(async () => {
      setError(false);
      setIsLoading(true);
      try {
        // Read before the save resets the form to the errand as saved.
        const handover = findChosenHandover();
        if (errandFieldsDirty && !(await saveErrandFields())) return;

        const unsaved = await saveParticipantsInTurn(
          selectDirtyParticipants(useErrandSaveParticipantsStore.getState())
        );
        if (unsaved.length > 0) {
          setError(true);
          toast('error', unsavedParticipantsMessage(unsaved));
          unsaved[0].reveal();
          return;
        }
        if (handover) {
          if (await handOver(handover)) toast('success', 'Ärendet lämnades över');
          return;
        }
        toast('success', 'Ärendet uppdaterades');
      } finally {
        setIsLoading(false);
      }
    });

  useEffect(() => {
    if (administrators && supportErrand?.assignedUserId) {
      setValue('admin', assignedOptionValue(supportErrand.assignedUserId) || '');
    } else {
      setValue('admin', 'Välj handläggare');
    }

    if (supportErrand?.priority) {
      setValue('priority', supportErrand.priority);
    } else {
      setValue('priority', 'Välj prioritet');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportErrand, administrators]);

  const solutionComponent = (label: string, info: string, icon: string) => (
    <>
      <div className="flex">
        <Label rounded>
          {(() => {
            const DynIcon = iconMap[icon];
            return DynIcon ? <DynIcon size="1.5rem" /> : undefined;
          })()}{' '}
          {label}
        </Label>{' '}
        <p className="text-small ml-8">{dayjs(supportErrand?.modified).format('DD MMM, HH:mm')}</p>
      </div>
      <p className="text-small">
        <strong>{findChosenAdmin()?.displayName}</strong> {info}
      </p>
    </>
  );

  // Ny is not a reason to keep the handler from writing: `allowed` already says the errand is
  // theirs, and an errand that arrives from an e-service is a real errand from the first minute.
  // The parked and closed states are locked for every action and stay that way. A workflow is the
  // exception: there messages are sent once the errand has left its first phase.
  const messagingPhase = useSupportMessagingPhase();
  const messageSidebarIsDisabled =
    !supportErrand ||
    isSupportErrandLocked(supportErrand!) ||
    !allowed ||
    !!messagingPhase ||
    [Status.SUSPENDED, Status.ASSIGNED, Status.SOLVED].includes(supportErrand.status as Status);

  const onError = () => {
    console.error('Something went wrong when saving');
  };

  return (
    <div className="relative h-full flex flex-col justify-start">
      <div className="px-0 flex justify-between items-center">
        <span className="text-base md:text-large xl:text-lead font-semibold">Handläggning</span>
      </div>

      <div className="w-full mt-md flex flex-col gap-12">
        <>
          {nextStep && <SupportNextStepCard step={nextStep} />}
          <FormControl id="administrator" className="w-full" disabled={!!supportErrand?.limitedAccess}>
            <FormLabel className="text-small">Ansvarig</FormLabel>
            <Select
              className="w-full"
              size="sm"
              data-cy="admin-input"
              placeholder="Tilldela handläggare"
              aria-label="Tilldela handläggare"
              {...register('admin')}
              value={admin}
            >
              {!supportErrand?.assignedUserId ? <Select.Option>Tilldela handläggare</Select.Option> : null}
              <HandlerSelectOptions administrators={assignableHandlers} roles={assignableRoles} />
            </Select>
          </FormControl>

          {handlerFields?.({ locked: isSupportErrandLocked(supportErrand!) })}
          {supportErrand?.status !== Status.SOLVED && supportErrand?.status !== Status.REOPENED && (
            <FormControl id="priority" className="w-full" disabled={!allowed}>
              <FormLabel className="text-small">Prioritet</FormLabel>
              <Select
                className="w-full"
                size="sm"
                data-cy="priority-input"
                placeholder="Välj prioritet"
                aria-label="Välj prioritet"
                {...register('priority')}
                value={priority}
              >
                {!supportErrand?.priority ? <Select.Option>Välj prioritet</Select.Option> : null}
                {selectablePriorities.map((c: { key: string; label: string }, index) => (
                  <Select.Option value={c.key} key={`${c}-${index}`}>
                    {c.label}
                  </Select.Option>
                ))}
              </Select>
            </FormControl>
          )}
        </>

        <div className="w-full">
          <Button
            className="w-full my-8"
            data-cy="save-button"
            type="button"
            disabled={
              isLoading === true ||
              (isSupportErrandLocked(supportErrand!) && !takesOverWaitingErrand) ||
              !(errandFieldsDirty || hasDirtyParticipant) ||
              (errandFieldsDirty && formIsNotValid)
            }
            // The errand's fields are validated before anything is saved; the parts validate themselves.
            onClick={errandFieldsDirty ? handleSubmit(saveErrand, onError) : () => void saveErrand()}
            variant="primary"
            color="primary"
            loading={isLoading === true}
            loadingText="Sparar"
          >
            Spara ärende
          </Button>
          <>
            <Divider className="mt-16 mb-24" />

            {supportErrand?.status === Status.SOLVED ? (
              <>
                {/* A workflow records no resolution, so a closed errand is simply closed. */}
                {solutionComponent('Avslutat', 'avslutade ärendet.', 'check')}
              </>
            ) : supportErrand?.status === Status.SUSPENDED || supportErrand?.status === Status.ASSIGNED ? (
              <>
                <div className="flex">
                  <Label>
                    <CirclePause size="1.5rem" />{' '}
                    {supportErrand?.status === Status.SUSPENDED ? 'Parkerat ' : 'Tilldelat '}
                  </Label>
                  <p className="text-small ml-8">{dayjs(supportErrand?.modified).format('DD MMM, HH:mm')}</p>
                </div>
                <p className="text-small">
                  {getValues('admin') === 'Välj handläggare' ? (
                    <span className="mb-24">Ärendet parkerades utan en handläggare.</span>
                  ) : (
                    <span className="mb-24">
                      <strong>{findChosenAdmin()?.displayName}</strong>
                      {supportErrand?.status === Status.SUSPENDED
                        ? ' parkerade ärendet med en påminnelse '
                        : ' tilldelades ärendet'}{' '}
                      {supportErrand.suspension?.suspendedTo
                        ? dayjs(supportErrand.suspension?.suspendedTo).format('DD MMM, HH:mm')
                        : supportErrand?.status === Status.SUSPENDED && '(datum saknas)'}
                    </span>
                  )}
                </p>

                <SupportResumeErrandButton disabled={!allowed} />
              </>
            ) : supportErrand?.status === Status.REOPENED ? (
              <div className="flex flex-col gap-8">
                <div className="flex w-fit">
                  <SupportStatusLabelComponent status={supportErrand?.status} />
                  <p className="text-small ml-8">{prettyTime(supportErrand?.modified ?? '')}</p>
                </div>
                <span className="text-dark-secondary text-small">Ärendet har återöppnats</span>
                <SupportCloseErrandButtonComponent disabled={!allowed || supportErrandIsEmpty(supportErrand!)} />
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {allowed && !supportErrandIsEmpty(supportErrand!) && (
                  <>
                    <SupportResumeErrandButton disabled={!allowed || supportErrandIsEmpty(supportErrand!)} />
                    {/* The workflow starts and moves errands through its phases here. */}
                    <SupportPhaseProcessButtonComponent
                      disabled={!allowed || supportErrandIsEmpty(supportErrand!)}
                      hasUnsavedChanges={props.hasUnsavedChanges}
                      onSubmit={onSubmit}
                      onError={onError}
                    />
                    {!messageSidebarIsDisabled && (
                      <Button
                        leftIcon={<Mail />}
                        className="w-full"
                        color="vattjom"
                        data-cy="sidebar-new-message-button"
                        variant="secondary"
                        onClick={() => window.dispatchEvent(new CustomEvent('openMessage'))}
                      >
                        Nytt meddelande
                      </Button>
                    )}
                    {offersEarlyClose && <Divider className="mt-8 mb-16" />}
                  </>
                )}
                {offersEarlyClose && (
                  <SupportCloseErrandButtonComponent disabled={!allowed || supportErrandIsEmpty(supportErrand!)} />
                )}
              </div>
            )}
          </>
        </div>
      </div>
    </div>
  );
};
