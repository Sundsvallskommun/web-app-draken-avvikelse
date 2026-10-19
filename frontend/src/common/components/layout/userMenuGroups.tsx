import { Button, PopupMenu } from '@sk-web-gui/react';
import { NotificationSettingsDialog } from '@supportmanagement/components/notification-settings/notification-settings-dialog.component';
import { getInvestigationNotificationChannels } from '@supportmanagement/investigation/investigation-variant-registry';
import { Bell, ChevronRight, LogOut, Palette } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';

import { ColorSchemeItems } from './color-scheme-items.component';

const colorSchemeItem = {
  label: 'Färgläge',
  element: () => (
    <PopupMenu.Item>
      <PopupMenu position="right" align="start">
        <PopupMenu.Button className="justify-between w-full">
          <Palette />
          <span className="w-full flex justify-between">
            Färgläge
            <ChevronRight />
          </span>
        </PopupMenu.Button>
        <PopupMenu.Panel>
          <ColorSchemeItems />
        </PopupMenu.Panel>
      </PopupMenu>
    </PopupMenu.Item>
  ),
};

const logoutItem = {
  label: 'Logga ut',
  element: () => (
    <PopupMenu.Item>
      <Button
        type="button"
        className="usermenu-item w-full text-left inline-flex items-center gap-2"
        onClick={() => {
          window.location.assign(`${process.env.NEXT_PUBLIC_BASEPATH}/logout`);
        }}
      >
        <LogOut />
        <span>Logga ut</span>
      </Button>
    </PopupMenu.Item>
  ),
};

const notificationSettingsItem = (open: () => void) => ({
  label: 'Notiser',
  element: () => (
    <PopupMenu.Item>
      <Button
        type="button"
        className="usermenu-item w-full text-left inline-flex items-center gap-2"
        onClick={open}
        data-cy="notification-settings-button"
      >
        <Bell />
        <span>Notiser</span>
      </Button>
    </PopupMenu.Item>
  ),
});

/**
 * The user menu's entries, and the dialogs they open. The dialogs are drawn by the component that shows the menu,
 * beside it rather than inside it: a dialog inside the menu would hand its key presses and clicks on to the menu.
 *
 * Notiser is there only where the running application offers a choice of notification channels.
 */
export const useUserMenu = (): {
  menuGroups: { label: string; elements: { label: string; element: () => React.JSX.Element }[] }[];
  dialogs: ReactNode;
} => {
  const notificationChannels = getInvestigationNotificationChannels();
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const offersNotificationSettings = notificationChannels !== undefined;

  const menuGroups = useMemo(
    () => [
      {
        label: 'Annat',
        showLabel: false,
        showOnDesktop: true,
        showOnMobile: true,
        elements: [
          colorSchemeItem,
          ...(offersNotificationSettings ? [notificationSettingsItem(() => setShowNotificationSettings(true))] : []),
          logoutItem,
        ],
      },
    ],
    [offersNotificationSettings]
  );

  const dialogs = notificationChannels ? (
    <NotificationSettingsDialog
      show={showNotificationSettings}
      channels={notificationChannels}
      onClose={() => setShowNotificationSettings(false)}
    />
  ) : null;

  return { menuGroups, dialogs };
};
