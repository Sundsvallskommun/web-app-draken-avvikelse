import { deepFlattenToObject } from '@common/services/helper-service';
import { closeErrandTabSoon } from '@common/utils/close-errand-tab';
import { getToastOptions } from '@common/utils/toast-message-settings';
import { Button, Modal, useSnackbar } from '@sk-web-gui/react';
import { useConfigStore, useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { getInvestigationEarlyClose } from '@supportmanagement/investigation/investigation-variant-registry';
import {
  getSupportErrandById,
  readSupportErrandWriteSnapshot,
  setSupportErrandAdmin,
  setSupportErrandStatus,
  Status,
  SupportErrand,
} from '@supportmanagement/services/support-errand-service';
import { SupportErrandStatusSnapshot } from '@supportmanagement/services/support-errand-status-transition';
import { supportErrandWriteErrorMessage } from '@supportmanagement/services/support-errand-write-version';
import {
  closesFromActivePhase,
  getActiveSupportPhaseId,
  getSupportPhases,
} from '@supportmanagement/services/support-phase-service';
import { Check } from 'lucide-react';
import React, { useState } from 'react';
import { useFormContext, UseFormReturn } from 'react-hook-form';

import { SupportEarlyCloseDialog } from './support-early-close-dialog.component';

export const SupportCloseErrandButtonComponent: React.FC<{ disabled: boolean }> = ({ disabled }) => {
  const user = useUserStore((s) => s.user);
  const administrators = useUserStore((s) => s.administrators);
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const toastMessage = useSnackbar();
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showEarlyCloseDialog, setShowEarlyCloseDialog] = useState(false);

  const formControls: UseFormReturn<SupportErrand, any, undefined> = useFormContext();
  const hasUnsavedChanges = Object.values(deepFlattenToObject(formControls.formState.dirtyFields)).some((v) => v);
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  // A close before the workflow's last phase is an early one; where the investigation asks why, the handler says so.
  const asksEarlyCloseMotivation =
    Boolean(getInvestigationEarlyClose()) &&
    !closesFromActivePhase(getActiveSupportPhaseId(supportErrand?.phases), getSupportPhases(supportMetadata?.phases));

  const showCloseErrorToast = (message = 'Något gick fel när ärendet skulle avslutas') => {
    toastMessage({
      position: 'bottom',
      closeable: false,
      message,
      status: 'error',
    });
  };

  // When an errand is closed without a handler (e.g. directly from status NEW), the user who
  // closes it becomes the handler so the errand has a responsible person. Returns the resulting
  // assigned user (the existing handler if one is already set) together with the snapshot the
  // close must be conditional on: the loaded errand when nothing was written, and the version our
  // own assignment produced when it was.
  const ensureHandlerAssigned = async (
    errandId: string
  ): Promise<{ assignedUserId?: string; expected: SupportErrandStatusSnapshot }> => {
    if (supportErrand?.assignedUserId) {
      return { assignedUserId: supportErrand.assignedUserId, expected: supportErrand };
    }
    const currentAdmin = administrators.find((a) => a.adAccount === user.username);
    if (!currentAdmin) return { assignedUserId: undefined, expected: supportErrand ?? {} };

    await setSupportErrandAdmin(
      errandId,
      municipalityId,
      currentAdmin.adAccount,
      supportErrand?.version,
      undefined,
      currentAdmin.adAccount
    );

    return {
      assignedUserId: currentAdmin.adAccount,
      expected: await readSupportErrandWriteSnapshot(errandId, municipalityId),
    };
  };

  /**
   * The workflow closes errands with the status alone and records no resolution: its last phase allows closing, and
   * Support Management moves an errand closed earlier into that phase in the same write. Reads the closed errand
   * back into the page and then closes the tab. Answers whether it closed.
   */
  const closeWithoutResolution = async (closingMotivation?: string): Promise<boolean> => {
    if (!supportErrand?.id) return false;
    const errandId = supportErrand.id;
    setIsLoading(true);
    try {
      const assignment = await ensureHandlerAssigned(errandId);
      await setSupportErrandStatus(errandId, municipalityId, Status.SOLVED, assignment.expected, closingMotivation);
      const closed = await getSupportErrandById(errandId, municipalityId);
      if (closed.error) throw new Error('Could not read back the closed support errand');
      setSupportErrand(closed.errand);
      formControls.reset(closed.errand);
      toastMessage(getToastOptions({ message: 'Ärendet avslutades', status: 'success' }));
      closeErrandTabSoon();
      return true;
    } catch (e) {
      console.error('Failed to close support errand', e);
      showCloseErrorToast(supportErrandWriteErrorMessage(e, 'Något gick fel när ärendet skulle avslutas'));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        className="w-full"
        // The workflow moves and closes the errand with its phase button; this one stays secondary beside it.
        data-cy="solved-button"
        leftIcon={<Check />}
        variant="secondary"
        disabled={disabled || isLoading}
        loading={isLoading}
        loadingText="Avslutar ärendet"
        onClick={() => {
          // Unsaved changes are explained in the dialog; otherwise the errand closes at once.
          if (hasUnsavedChanges) setShowModal(true);
          else if (asksEarlyCloseMotivation) setShowEarlyCloseDialog(true);
          else void closeWithoutResolution();
        }}
      >
        Avsluta ärendet
      </Button>
      {asksEarlyCloseMotivation && (
        <SupportEarlyCloseDialog
          show={showEarlyCloseDialog}
          closing={isLoading}
          onCancel={() => setShowEarlyCloseDialog(false)}
          onConfirm={(motivation) =>
            void closeWithoutResolution(motivation).then((closed) => {
              if (closed) setShowEarlyCloseDialog(false);
            })
          }
        />
      )}
      <Modal
        show={showModal}
        label="Du har osparade ändringar"
        className="w-[52rem]"
        onClose={() => setShowModal(false)}
      >
        <Modal.Content>
          <p>Ärendet kan inte avslutas då du har osparade ändringar. Var god spara för att fortsätta.</p>
        </Modal.Content>
        <Modal.Footer>
          <Button onClick={() => setShowModal(false)} variant="primary" color="vattjom">
            Ok
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};
