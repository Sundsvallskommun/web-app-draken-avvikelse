'use client';

import type { NotificationChannel } from '@common/data-contracts/supportmanagement/data-contracts';
import { useToastMessages } from '@common/hooks/use-toast-messages';
import { Alert, Button, Checkbox, Modal, Spinner } from '@sk-web-gui/react';
import { useConfigStore } from '@stores/index';
import {
  getMySubscriber,
  updateMyNotificationChannels,
} from '@supportmanagement/services/support-subscription-service';
import { FC, useEffect, useState } from 'react';

import {
  chosenNotificationChannels,
  hasNotificationChannelChange,
  NOTIFICATION_CHANNEL_LABELS,
  type SelectableNotificationChannel,
  toggleNotificationChannel,
  toSubscriberChannels,
} from './notification-channel-settings';

interface NotificationSettingsProps {
  /** The channels offered beside the notifications in Draken. */
  channels: readonly SelectableNotificationChannel[];
  onClose: () => void;
}

type LoadState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; stored: NotificationChannel[] };

/**
 * The choice itself. Mounted while the dialog is shown, so that every opening reads what Support Management holds
 * now rather than what an earlier opening left behind.
 */
const NotificationSettingsForm: FC<NotificationSettingsProps> = ({ channels, onClose }) => {
  const municipalityId = useConfigStore((state) => state.municipalityId);
  const { showSuccess, showError } = useToastMessages();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [chosen, setChosen] = useState<SelectableNotificationChannel[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!municipalityId) return;
    let current = true;
    getMySubscriber(municipalityId).then(
      (subscriber) => {
        if (!current) return;
        setChosen(chosenNotificationChannels(subscriber.channels, channels));
        setState({ status: 'ready', stored: subscriber.channels ?? [] });
      },
      () => current && setState({ status: 'failed' })
    );
    return () => {
      current = false;
    };
  }, [municipalityId, channels]);

  const save = async () => {
    setIsSaving(true);
    try {
      await updateMyNotificationChannels(municipalityId, toSubscriberChannels(chosen, channels));
      showSuccess('Dina notisinställningar är sparade.');
      onClose();
    } catch {
      showError('Notisinställningarna kunde inte sparas. Försök igen.');
      setIsSaving(false);
    }
  };

  const hasChange = state.status === 'ready' && hasNotificationChannelChange(state.stored, chosen, channels);

  return (
    <>
      <Modal.Content>
        <p className="mb-16">Du får alltid notiser i Draken. Välj om du också vill ha dem på annat sätt.</p>

        {state.status === 'loading' && (
          <div className="flex items-center gap-12" role="status">
            <Spinner size={2} />
            <span>Hämtar dina notisinställningar...</span>
          </div>
        )}

        {state.status === 'failed' && (
          <Alert type="error" data-cy="notification-settings-error">
            <Alert.Icon />
            <Alert.Content>
              <Alert.Content.Description>
                Notisinställningarna kunde inte hämtas. Försök igen om en stund.
              </Alert.Content.Description>
            </Alert.Content>
          </Alert>
        )}

        {state.status === 'ready' && (
          <fieldset className="m-0 p-0 border-0 flex flex-col gap-12">
            <legend className="sr-only">Notiser utöver Draken</legend>
            {channels.map((channel) => (
              <Checkbox
                key={channel}
                checked={chosen.includes(channel)}
                disabled={isSaving}
                onChange={(event) => setChosen(toggleNotificationChannel(chosen, channel, event.target.checked))}
                data-cy={`notification-settings-${channel.toLowerCase()}`}
              >
                {NOTIFICATION_CHANNEL_LABELS[channel]}
              </Checkbox>
            ))}
            <p className="m-0 text-small text-dark-secondary">
              E-post och SMS skickas till den adress och det nummer som hör till ditt konto.
            </p>
          </fieldset>
        )}
      </Modal.Content>
      <Modal.Footer>
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Avbryt
        </Button>
        <Button
          type="button"
          variant="primary"
          color="vattjom"
          disabled={!hasChange}
          loading={isSaving}
          loadingText="Sparar"
          onClick={save}
          data-cy="notification-settings-save"
        >
          Spara
        </Button>
      </Modal.Footer>
    </>
  );
};

/** Where a user chooses how they are notified beside the notifications in Draken: by e-mail, by SMS, or neither. */
export const NotificationSettingsDialog: FC<NotificationSettingsProps & { show: boolean }> = ({
  show,
  channels,
  onClose,
}) => (
  <Modal show={show} label="Notiser" className="w-[48rem]" onClose={onClose} data-cy="notification-settings-modal">
    {show && <NotificationSettingsForm channels={channels} onClose={onClose} />}
  </Modal>
);
