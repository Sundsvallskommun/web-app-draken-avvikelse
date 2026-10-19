'use client';

import { acknowledgeNotifications } from '@common/components/notifications/notification-actions';
import { NotificationView } from '@common/components/notifications/notification-view';
import { useSnackbar } from '@sk-web-gui/react';
import { useConfigStore } from '@stores/index';
import { useCallback } from 'react';

/**
 * Mark a notification as read, used when the user follows it to the errand.
 *
 * Shared by the plain and the collapsed row so that following a notification always acknowledges it.
 * Whether it happens to cover one event or five is an upstream detail that changes as activity comes
 * in, and it should not decide whether the notification stays unread.
 */
export const useAcknowledgeNotification = (
  notification: NotificationView,
  refresh?: () => Promise<void>
): (() => Promise<void>) => {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const toastMessage = useSnackbar();

  return useCallback(async () => {
    const reportFailure = () =>
      toastMessage({
        position: 'bottom',
        closeable: false,
        message: 'Något gick fel när notifieringen skulle kvitteras',
        status: 'error',
      });

    try {
      // Failures come back in `failed`, not as a rejection.
      const { failed } = await acknowledgeNotifications(municipalityId, [notification]);
      await refresh?.();
      if (failed.length) reportFailure();
    } catch (error) {
      reportFailure();
    }
  }, [municipalityId, notification, refresh, toastMessage]);
};
