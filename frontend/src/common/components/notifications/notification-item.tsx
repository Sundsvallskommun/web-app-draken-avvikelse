import { useAcknowledgeNotification } from '@common/hooks/use-acknowledge-notification';
import { prettyTime } from '@common/services/helper-service';
import { Checkbox, cx } from '@sk-web-gui/react';
import NextLink from 'next/link';
import { FC } from 'react';

import { NotificationRenderIcon } from './notification-render-icon';
import { notificationHref, notificationLabel, primaryEvent } from './notification-utils';
import { NotificationView } from './notification-view';

interface NotificationItemProps {
  notification: NotificationView;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  showCheckbox?: boolean;
  refresh?: () => Promise<void>;
}

/**
 * A notification the user can act on, rendered as one line.
 *
 * Used for notifications covering a single event; a notification carrying several is rendered by
 * `NotificationGroupItem` instead, which collapses them into a summary.
 */
export const NotificationItem: FC<NotificationItemProps> = ({
  notification,
  isSelected = false,
  onToggleSelect,
  showCheckbox = false,
  refresh,
}) => {
  const handleAcknowledge = useAcknowledgeNotification(notification, refresh);

  const event = primaryEvent(notification);

  return (
    <div className="p-16 pl-0 flex gap-12 items-start justify-between text-small" data-cy="notification-item">
      {showCheckbox && (
        <div className="flex items-center my-xs">
          <Checkbox checked={isSelected} onChange={onToggleSelect} />
        </div>
      )}
      <div className="flex items-center my-xs">
        <NotificationRenderIcon subType={event?.subType} acknowledged={notification.acknowledged} />
      </div>
      <div className="flex-grow">
        <div>
          <strong>{`${notificationLabel(event)} › `}</strong>
          <NextLink
            href={notificationHref(notification)}
            target="_blank"
            onClick={handleAcknowledge}
            className="underline whitespace-nowrap"
          >
            {notification.errandNumber || 'Till ärendet'}
          </NextLink>
        </div>
      </div>
      <span className="whitespace-nowrap">{prettyTime(notification.created ?? '')}</span>
      {!notification.acknowledged && (
        <div>
          <span
            className={cx(
              `w-12 h-12 my-xs rounded-full flex items-center justify-center text-lg`,
              `bg-vattjom-surface-primary`
            )}
          />
        </div>
      )}
    </div>
  );
};
