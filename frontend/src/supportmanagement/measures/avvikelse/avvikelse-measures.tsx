import type { Measure } from '@common/data-contracts/supportmanagement/data-contracts';
import { Modal, useConfirm, useSnackbar } from '@sk-web-gui/react';
import { useMetadataStore } from '@stores/index';
import { useUserStore } from '@stores/user-store';
import { isSupportErrandLocked, type SupportErrand } from '@supportmanagement/services/support-errand-service';
import {
  isSupportErrandWriteConflict,
  supportErrandWriteErrorMessage,
} from '@supportmanagement/services/support-errand-write-error';
import { isInSupportPhase } from '@supportmanagement/services/support-phase-service';
import { useCallback, useId, useRef, useState } from 'react';

import { MeasureActionPlanButton } from '../measure-action-plan-button';
import { measureCanBeDecided, type MeasureDecisionInput } from '../measure-decision';
import { MeasureFilterBar } from '../measure-filter-bar';
import { emptyMeasureFilters, filterMeasures, isMeasureFilterActive, measureFilterOptions } from '../measure-filters';
import {
  measureBelongsInFollowUp,
  measureCanBeFollowedUp,
  type MeasureFollowUpInput,
  measureHoldsFollowUp,
} from '../measure-follow-up';
import { MeasureList } from '../measure-list';
import { MEASURES_PHASE_NAME } from '../measure-phases';
import type { MeasureSort } from '../measure-sort';
import { measureTypeLabel } from '../measure-types';
import {
  changeSupportMeasurePlannedComplete,
  createSupportMeasure,
  decideSupportMeasure,
  deleteSupportMeasure,
  followUpSupportMeasure,
  type MeasuresSnapshot,
  updateSupportMeasure,
} from '../support-measure-service';
import { AvvikelseMeasureDecisionDialog } from './avvikelse-measure-decision-dialog';
import { AvvikelseMeasureEndDateDialog } from './avvikelse-measure-end-date-dialog';
import { AvvikelseMeasureFollowUpDialog } from './avvikelse-measure-follow-up-dialog';
import { AvvikelseMeasureForm, confirmDiscardMeasureDraft } from './avvikelse-measure-form';
import { type MeasureForm, measureFormChanges, measureFormCreate } from './measure-form';

/** Avvikelse owns its form and workflow; the tab flag and transport do not select business rules. */
export function AvvikelseMeasures({
  snapshot,
  errand,
  onDirtyChange,
  onSaved,
  followUp = false,
}: {
  snapshot: MeasuresSnapshot;
  errand: SupportErrand;
  onDirtyChange: (dirty: boolean) => void;
  /** Reloads the tab and hands back what it read. */
  onSaved: () => Promise<MeasuresSnapshot | undefined>;
  followUp?: boolean;
}) {
  const { metadata, creationRoles, registration } = snapshot;
  const user = useUserStore((state) => state.user);
  const snackbar = useSnackbar();
  const confirm = useConfirm();
  const [filters, setFilters] = useState(emptyMeasureFilters);
  const [sort, setSort] = useState<MeasureSort>('created');
  // `conflicted`: the dialog's write was refused because somebody else changed the measure first (`stopOnConflict`).
  const [dialog, setDialog] = useState<
    | { kind: 'edit' | 'decide'; measure: Measure; conflicted?: boolean }
    | { kind: 'follow-up' | 'end-date'; measure: Measure; unavailable?: boolean; conflicted?: boolean }
  >();
  const editing = dialog?.kind === 'edit' ? dialog.measure : undefined;
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const listHeadingId = useId();
  const editHeading = useRef<HTMLSpanElement>(null);
  const editHeadingId = useId();
  const reportDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange(value);
    },
    [onDirtyChange]
  );
  // Support Management decides whether the measures are writable; the registration roles only decide how.
  const canWrite = snapshot.canWrite && user.permissions.canEditSupportManagement && !isSupportErrandLocked(errand);
  const metadataPhases = useMetadataStore((state) => state.supportMetadata?.phases);
  // While the errand is investigated a decided measure may still be put right, and its registrar may remove it.
  const errandIsInvestigated = isInSupportPhase(MEASURES_PHASE_NAME, { metadataPhases, errandPhases: errand.phases });
  const canEdit = !followUp && canWrite;
  const canDecide =
    canEdit &&
    registration.status === 'ready' &&
    creationRoles.some((role) => registration.roleTypes.some((rule) => rule.roleName === role.name && rule.decides));

  // The page form only ever creates; editing happens in a modal so the two are never confused.
  const resetNewForm = () => {
    setRevision((value) => value + 1);
    listHeading.current?.focus();
  };
  const closeEditing = () => setDialog(undefined);
  /**
   * Closes the open dialog. One whose write ran into somebody else's change reads the list again as it closes, so
   * the change is made anew on the measures as they now stand.
   */
  const closeDialog = () => {
    const conflicted = dialog?.conflicted;
    setDialog(undefined);
    if (conflicted) void onSaved();
  };
  const requestCloseEditing = async () => {
    // A draft that ran into somebody else's change can no longer be saved, as the dialog already says.
    if (!dialog?.conflicted && dirty && !(await confirmDiscardMeasureDraft(confirm))) return;
    closeDialog();
  };
  /**
   * A write refused because somebody else changed the measure first stops there. The dialog keeps what the user
   * wrote, locked so that it can be copied, and sends none of it again: a retry on the measure as it now stands
   * would write over the other change unseen. The change is made anew once the dialog is closed and the list read.
   */
  const stopOnConflict = (cause: unknown) => {
    if (isSupportErrandWriteConflict(cause)) setDialog((open) => (open ? { ...open, conflicted: true } : open));
  };
  const save = async (values: MeasureForm) => {
    if (!canEdit || !errand.id) throw new Error('SupportMeasure is not writable');
    if (editing) {
      if (!editing.id) throw new Error('SupportMeasure is missing its identity');
      const measureId = editing.id;
      const changes = measureFormChanges(values, editing, errandIsInvestigated);
      // Only what changed is written; a draft that changed nothing the measure holds - a responsible person with
      // only spaces added, say - has nothing to write.
      if (Object.keys(changes).length === 0) {
        closeEditing();
        return;
      }
      try {
        await updateSupportMeasure(errand.id, measureId, editing.version, changes);
      } catch (cause) {
        stopOnConflict(cause);
        throw cause;
      }
    } else {
      await createSupportMeasure(errand.id, measureFormCreate(values));
    }
    // Retire the saved draft before reloading so a failed read does not cause a duplicate write.
    if (editing) closeEditing();
    else resetNewForm();
    snackbar({ message: 'Åtgärden har sparats.', status: 'success' });
    await onSaved();
  };

  const removeMeasure = async (measure: Measure) => {
    if (!canEdit || !errand.id || !measure.id) throw new Error('SupportMeasure is not removable');
    const confirmed = await confirm.showConfirmation(
      'Ta bort åtgärden?',
      `Åtgärden ${measureTypeLabel(metadata.measureTypes, measure)} tas bort från ärendet.`,
      'Ja, ta bort',
      'Nej, behåll',
      'warning',
      'question'
    );
    if (!confirmed) return;
    try {
      await deleteSupportMeasure(errand.id, measure.id, measure.version);
      snackbar({ message: 'Åtgärden har tagits bort.', status: 'success' });
    } catch (cause) {
      snackbar({
        message: supportErrandWriteErrorMessage(
          cause,
          'Åtgärden kunde inte tas bort.',
          MEASURE_REMOVAL_CONFLICT_MESSAGE
        ),
        status: 'error',
      });
    }
    listHeading.current?.focus();
    await onSaved();
  };

  const saveDecision = async (decision: MeasureDecisionInput) => {
    const measure = dialog?.kind === 'decide' ? dialog.measure : undefined;
    if (!canDecide || !errand.id || !measure?.id || !measureCanBeDecided(measure))
      throw new Error('SupportMeasure is not decidable');
    const measureId = measure.id;
    try {
      await decideSupportMeasure(errand.id, measureId, measure.version, decision);
    } catch (cause) {
      // The dialog stays open on its own error: closing here would throw away a comment the user may want to keep.
      stopOnConflict(cause);
      throw cause;
    }
    // Clear the dialog before reloading so a failed read never invites a second submission.
    setDialog(undefined);
    listHeading.current?.focus();
    snackbar({ message: 'Beslutet har sparats.', status: 'success' });
    await onSaved();
  };

  const saveFollowUp = async (values: MeasureFollowUpInput) => {
    const measure = dialog?.kind === 'follow-up' && !dialog.unavailable ? dialog.measure : undefined;
    if (!followUp || !canWrite || !errand.id || !measure?.id || !measureCanBeFollowedUp(measure)) {
      throw new Error('Measure cannot be followed up');
    }
    let recovered = false;
    try {
      await followUpSupportMeasure(errand.id, measure.id, measure.version, values);
    } catch (cause) {
      // A failed save can still have been accepted, with only its response lost: the measure read back then holds
      // exactly these answers, and the follow-up is done rather than failed. The dialog stays on the measure it was
      // opened on, so nothing it holds is sent again over a change somebody else made.
      const snapshot = await onSaved();
      const current = snapshot?.measures.find((candidate) => candidate.id === measure.id);
      if (!current || !measureHoldsFollowUp(current, values)) {
        // A measure the read no longer finds cannot be followed up; the answers stay for the user to copy.
        if (snapshot && !current)
          setDialog((open) => (open?.kind === 'follow-up' ? { ...open, unavailable: true } : open));
        stopOnConflict(cause);
        throw cause;
      }
      recovered = true;
    }
    setDialog(undefined);
    listHeading.current?.focus();
    snackbar({ message: 'Åtgärden är markerad som utförd och uppföljningen har sparats.', status: 'success' });
    // A recovered save was found by the reload it has just had.
    if (!recovered) await onSaved();
  };

  const saveEndDate = async (plannedComplete: string, description?: string) => {
    const measure = dialog?.kind === 'end-date' && !dialog.unavailable ? dialog.measure : undefined;
    if (!canWrite || !errand.id || !measure?.id || !measureCanBeFollowedUp(measure)) {
      throw new Error('Measure end date cannot be changed');
    }
    const measureId = measure.id;
    try {
      await changeSupportMeasurePlannedComplete(errand.id, measureId, measure.version, plannedComplete, description);
    } catch (cause) {
      stopOnConflict(cause);
      throw cause;
    }
    setDialog(undefined);
    listHeading.current?.focus();
    snackbar({ message: 'Slutdatumet har ändrats.', status: 'success' });
    await onSaved();
  };

  const listActionsOpen = canWrite && !dirty && !dialog;
  const measures = followUp ? snapshot.measures.filter(measureBelongsInFollowUp) : snapshot.measures;
  const shownMeasures = filterMeasures(measures, filters, metadata.measureTypes ?? []);

  return (
    <div className="min-w-0 flex flex-col gap-32">
      {canEdit && creationRoles.length === 0 && (
        <div>
          <h3 className="text-h3-sm mb-8">Lägg till åtgärder</h3>
          <p role="status">{registrationMessage(registration.status)}</p>
        </div>
      )}
      {canEdit && creationRoles.length > 0 && (
        <AvvikelseMeasureForm
          key={`new-${revision}`}
          measureTypes={metadata.measureTypes}
          creationRoles={creationRoles}
          roles={metadata.roles}
          registration={registration}
          onSave={save}
          onDirtyChange={reportDirty}
        />
      )}
      {/* Mounted only while editing: an always-mounted Headless UI Transition throws when the tab's subtree is
          hidden and shown again during an in-place reload. */}
      {canEdit && editing && (
        <Modal
          show
          // Titled in the modal's own header, which takes the focus so that the title is read first. The form
          // names itself after it rather than showing a heading of its own.
          label={
            <span
              id={editHeadingId}
              ref={editHeading}
              tabIndex={-1}
              className="focus-visible:outline focus-visible:outline-2"
            >
              Redigera åtgärd
            </span>
          }
          closeLabel="Stäng"
          disableCloseOutside
          initialFocus={editHeading}
          className="w-full max-w-[84rem]"
          onClose={() => void requestCloseEditing()}
          data-cy="measure-edit-modal"
        >
          <Modal.Content>
            {editing && (
              <AvvikelseMeasureForm
                key={editing.id}
                measure={editing}
                measureTypes={metadata.measureTypes}
                creationRoles={creationRoles}
                roles={metadata.roles}
                registration={registration}
                onSave={save}
                errandIsInvestigated={errandIsInvestigated}
                conflicted={dialog?.conflicted}
                onCancel={closeDialog}
                onDirtyChange={reportDirty}
                titledBy={editHeadingId}
              />
            )}
          </Modal.Content>
        </Modal>
      )}
      {canDecide && dialog?.kind === 'decide' && (
        <AvvikelseMeasureDecisionDialog
          measure={dialog.measure}
          conflicted={dialog.conflicted}
          title={measureTypeLabel(metadata.measureTypes, dialog.measure)}
          onSave={saveDecision}
          onClose={closeDialog}
          onDirtyChange={reportDirty}
        />
      )}
      {followUp && canWrite && dialog?.kind === 'follow-up' && (
        <AvvikelseMeasureFollowUpDialog
          measure={dialog.measure}
          unavailable={dialog.unavailable}
          conflicted={dialog.conflicted}
          title={measureTypeLabel(metadata.measureTypes, dialog.measure)}
          onSave={saveFollowUp}
          onClose={closeDialog}
          onDirtyChange={reportDirty}
        />
      )}
      {/* Offered in both views: whoever follows a measure up moves its end, from wherever they see it. */}
      {canWrite && dialog?.kind === 'end-date' && (
        <AvvikelseMeasureEndDateDialog
          measure={dialog.measure}
          unavailable={dialog.unavailable}
          conflicted={dialog.conflicted}
          title={measureTypeLabel(metadata.measureTypes, dialog.measure)}
          onSave={saveEndDate}
          onClose={closeDialog}
          onDirtyChange={reportDirty}
        />
      )}
      {!canWrite && <p>Åtgärderna visas skrivskyddade.</p>}
      <section aria-labelledby={listHeadingId} className="border-t-1 pt-24 flex flex-col gap-16">
        <div className="flex flex-wrap items-start justify-between gap-16">
          <h3
            id={listHeadingId}
            ref={listHeading}
            tabIndex={-1}
            className="text-h3-sm focus-visible:outline focus-visible:outline-2"
          >
            {followUp ? 'Åtgärder att följa upp' : 'Tillagda åtgärder'} ({measures.length})
          </h3>
          {/* The plan is made from the stored measures by the BFF; follow-up shows the same list but offers no plan. */}
          {!followUp && canWrite && (
            <MeasureActionPlanButton errand={errand} measureCount={measures.length} onCreated={onSaved} />
          )}
        </div>
        {measures.length > 0 && (
          <MeasureFilterBar
            filters={filters}
            onChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            {...measureFilterOptions(measures, metadata.measureTypes ?? [], metadata.roles ?? [])}
            shown={shownMeasures.length}
            total={measures.length}
          />
        )}
        <MeasureList
          measures={shownMeasures}
          sort={sort}
          emptyMessage={
            isMeasureFilterActive(filters)
              ? 'Inga åtgärder matchar filtret.'
              : followUp
              ? 'Det finns inga planerade och godkända åtgärder att följa upp.'
              : 'Det finns inga åtgärder registrerade.'
          }
          types={metadata.measureTypes ?? []}
          roles={metadata.roles ?? []}
          currentUser={user.username}
          mayFollowUp={snapshot.mayFollowUp}
          onEdit={canEdit && !dirty && !dialog ? (measure) => setDialog({ kind: 'edit', measure }) : undefined}
          onRemove={canEdit && !dirty && !dialog ? (measure) => void removeMeasure(measure) : undefined}
          errandIsInvestigated={errandIsInvestigated}
          onDecide={canDecide && !dirty && !dialog ? (measure) => setDialog({ kind: 'decide', measure }) : undefined}
          onFollowUp={followUp && listActionsOpen ? (measure) => setDialog({ kind: 'follow-up', measure }) : undefined}
          onChangeEndDate={listActionsOpen ? (measure) => setDialog({ kind: 'end-date', measure }) : undefined}
        />
      </section>
    </div>
  );
}

/** A removal refused because somebody else changed the measure first. The list is read again right after it. */
const MEASURE_REMOVAL_CONFLICT_MESSAGE =
  'Åtgärden togs inte bort: någon annan har ändrat den sedan du öppnade den. Listan visar nu åtgärden som den ser ut; ta bort den igen om den fortfarande ska bort.';

function registrationMessage(status: MeasuresSnapshot['registration']['status']): string {
  switch (status) {
    case 'unconfigured':
      return 'Registrering av åtgärder är inte konfigurerad för den här verksamheten. Kontakta administratören. Du kan fortfarande läsa befintliga åtgärder.';
    case 'invalid':
      return 'Inställningarna för åtgärdernas roller och typer behöver ses över. Kontakta administratören. Du kan fortfarande läsa befintliga åtgärder.';
    case 'ready':
      return 'Du har ingen registreringsroll för åtgärder i den här verksamheten. Kontakta administratören om du behöver kunna lägga till åtgärder.';
  }
}
