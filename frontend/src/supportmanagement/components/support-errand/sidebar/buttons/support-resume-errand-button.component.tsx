import { getToastOptions } from '@common/utils/toast-message-settings';
import { Button, useConfirm, useSnackbar } from '@sk-web-gui/react';
import { useConfigStore, useMetadataStore, useSupportStore } from '@stores/index';
import {
  getSupportErrandById,
  resolveWorkingStatus,
  setSupportErrandStatus,
  shouldShowResumeErrandButton,
  Status,
} from '@supportmanagement/services/support-errand-service';
import { supportErrandWriteErrorMessage } from '@supportmanagement/services/support-errand-write-version';
import { CirclePlay } from 'lucide-react';
import { useState } from 'react';

export const SupportResumeErrandButton: React.FC<{ disabled: boolean }> = ({ disabled }) => {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const confirm = useConfirm();
  const toastMessage = useSnackbar();
  const [isLoading, setIsLoading] = useState(false);

  const activateErrand = () => {
    setIsLoading(true);
    // Resuming returns the errand to the status it works in: its phase's main status where the
    // namespace runs a workflow, the ongoing status everywhere else.
    const workingStatus = resolveWorkingStatus(supportErrand?.phases, supportMetadata?.phases);
    return setSupportErrandStatus(supportErrand!.id!, municipalityId, workingStatus, supportErrand!)
      .then(() => {
        toastMessage(
          getToastOptions({
            message: 'Ärende återupptogs',
            status: 'success',
          })
        );
        return getSupportErrandById(supportErrand!.id!, municipalityId).then((res) => {
          setSupportErrand(res.errand);
          setIsLoading(false);
        });
      })
      .catch((e) => {
        toastMessage({
          position: 'bottom',
          closeable: false,
          message: supportErrandWriteErrorMessage(e, 'Något gick fel när ärendet återupptogs'),
          status: 'error',
        });
        setIsLoading(false);
      });
  };

  if (!shouldShowResumeErrandButton(supportErrand?.status as Status)) {
    return null;
  }

  return (
    <Button
      className="w-full"
      color="vattjom"
      data-cy="resume-button"
      leftIcon={<CirclePlay />}
      variant={shouldShowResumeErrandButton(supportErrand?.status as Status) ? 'primary' : 'secondary'}
      disabled={disabled}
      loading={isLoading}
      loadingText="Återupptar"
      onClick={() => {
        confirm
          .showConfirmation('Återuppta ärende', 'Vill du återuppta ärendet?', 'Ja', 'Nej', 'info', 'info')
          .then((confirmed) => {
            if (confirmed) {
              activateErrand();
            }
          });
      }}
    >
      Återuppta ärende
    </Button>
  );
};
