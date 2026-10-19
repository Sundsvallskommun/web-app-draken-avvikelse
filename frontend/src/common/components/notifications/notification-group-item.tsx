import { useAcknowledgeNotification } from '@common/hooks/use-acknowledge-notification';
import { prettyTime } from '@common/services/helper-service';
import { Button, Checkbox } from '@sk-web-gui/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import NextLink from 'next/link';
import { FC, useState } from 'react';

import { NotificationEventItem } from './notification-event-item';
import { NotificationItem } from './notification-item';
import { NotificationRenderIcon } from './notification-render-icon';
import { notificationHref, notificationSummary, primaryEvent } from './notification-utils';
import { NotificationView } from './notification-view';

interface NotificationGroupItemProps {
  notification: NotificationView;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  showCheckbox?: boolean;
  refresh?: () => Promise<void>;
}

/**
 * A burst of activity on one errand, shown as a single line.
 *
 * Ten messages on the same errand is one thing that happened, not ten. Upstream already aggregates
 * them onto one notification; this collapses them into a summary that expands on demand, so the
 * panel stays readable without hiding anything.
 */
export const NotificationGroupItem: FC<NotificationGroupItemProps> = ({
  notification,
  isSelected = false,
  onToggleSelect,
  showCheckbox = false,
  refresh,
}) => {
  const [expanded, setExpanded] = useState(false);
  const handleAcknowledge = useAcknowledgeNotification(notification, refresh);

  if (notification.events.length <= 1) {
    return (
      <NotificationItem
        notification={notification}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        showCheckbox={showCheckbox}
        refresh={refresh}
      />
    );
  }

  return (
    <div data-cy="notification-group">
      <div className="p-16 pl-0 flex gap-12 items-start justify-between text-small">
        {showCheckbox && (
          <div className="flex items-center my-xs">
            <Checkbox checked={isSelected} onChange={onToggleSelect} />
          </div>
        )}
        <div className="flex items-center my-xs">
          <NotificationRenderIcon
            subType={primaryEvent(notification)?.subType}
            acknowledged={notification.acknowledged}
          />
        </div>
        <div className="flex-grow">
          <div>
            <strong>{`${notificationSummary(notification)} › `}</strong>
            <NextLink
              href={notificationHref(notification)}
              target="_blank"
              onClick={handleAcknowledge}
              className="underline whitespace-nowrap"
            >
              {notification.errandNumber || 'Till ärendet'}
            </NextLink>
          </div>
          <Button
            variant="link"
            size="sm"
            className="text-dark-secondary px-0"
            aria-expanded={expanded}
            data-cy="notification-group-toggle"
            leftIcon={expanded ? <ChevronDown size="1.6rem" /> : <ChevronRight size="1.6rem" />}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Dölj händelser' : `Visa ${notification.events.length} händelser`}
          </Button>
        </div>
        <span className="whitespace-nowrap">{prettyTime(notification.created ?? '')}</span>
      </div>
      {expanded && (
        <ul className="pl-40 border-0 border-l-1 border-divider ml-16">
          {notification.events.map((event, index) => (
            <li key={`${notification.id}-${event.created}-${index}`}>
              <NotificationEventItem event={event} acknowledged={notification.acknowledged} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
