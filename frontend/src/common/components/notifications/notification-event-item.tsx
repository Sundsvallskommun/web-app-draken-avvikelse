import { prettyTime } from '@common/services/helper-service';
import { FC } from 'react';

import { NotificationRenderIcon } from './notification-render-icon';
import { notificationLabel } from './notification-utils';
import { NotificationEventView } from './notification-view';

interface NotificationEventItemProps {
  event: NotificationEventView;
  acknowledged?: boolean;
}

/**
 * One event inside an expanded notification.
 *
 * Deliberately without a link or a checkbox: acknowledging happens per notification, and every event
 * in one points at the same errand, so repeating the link on each row would only add noise.
 */
export const NotificationEventItem: FC<NotificationEventItemProps> = ({ event, acknowledged }) => (
  <div className="p-16 pl-0 flex gap-12 items-start justify-between text-small" data-cy="notification-event">
    <div className="flex items-center my-xs">
      <NotificationRenderIcon subType={event.subType} acknowledged={acknowledged} />
    </div>
    <div className="flex-grow">{notificationLabel(event)}</div>
    <span className="whitespace-nowrap">{prettyTime(event.created ?? '')}</span>
  </div>
);
