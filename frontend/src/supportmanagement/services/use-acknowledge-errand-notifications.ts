'use client';

import { useRefreshNotifications } from '@common/hooks/useNotificationPoller';
import { useConfigStore } from '@stores/index';
import { acknowledgeAllForErrand } from '@supportmanagement/services/support-notification-service';
import { useEffect, useRef } from 'react';

/**
 * Acknowledges the user's notifications for an errand once, when the errand is opened.
 *
 * Opening the errand is what reading its notifications means, however the user got there: the
 * overview, the notification panel, a follow-up list or a link. One request per errand and page load;
 * the BFF finds this user's unacknowledged notifications for the errand and writes nothing when there
 * are none. A failure only leaves them unread, so it never interrupts the user.
 */
export const useAcknowledgeErrandNotifications = (errandId: string | undefined): void => {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const refreshNotifications = useRefreshNotifications();
  const acknowledgedErrandId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!municipalityId || !errandId || acknowledgedErrandId.current === errandId) return;
    acknowledgedErrandId.current = errandId;

    acknowledgeAllForErrand(municipalityId, errandId)
      .then((result) => {
        if (result.failed.length) {
          console.error(`Could not acknowledge ${result.failed.length} notification(s) for errand ${errandId}`);
        }
        // The bell reads from the store, so it would keep the old count until the next poll.
        if (result.acknowledged.length) return refreshNotifications();
      })
      // Already logged by the service; the notifications simply stay unread.
      .catch(() => undefined);
  }, [municipalityId, errandId, refreshNotifications]);
};
