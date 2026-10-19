import { Badge, Button } from '@sk-web-gui/react';
import { useSupportStore } from '@stores/index';
import { Bell } from 'lucide-react';
import { useMemo } from 'react';

import { getFilteredNotifications } from './notification-utils';

export const NotificationsBell = (props: { toggleShow: () => void }) => {
  const notifications = useSupportStore((s) => s.notifications);
  // Filtering copies every notification to strip system events, so it is memoised rather than redone
  // on each render of the surrounding sidebar.
  const newCount = useMemo(
    () => getFilteredNotifications(notifications).filter((n) => !n.acknowledged).length,
    [notifications]
  );

  return (
    <Button
      role="menuitem"
      size={'md'}
      aria-label={'Notifieringar'}
      onClick={() => {
        props.toggleShow();
      }}
      className="mx-md"
      variant="tertiary"
      iconButton
      leftIcon={
        <>
          <Bell />
        </>
      }
    >
      {newCount > 0 && (
        <Badge
          className="absolute -top-10 -right-10 text-white"
          rounded
          color="vattjom"
          counter={newCount > 99 ? '99+' : newCount}
        />
      )}
    </Button>
  );
};
