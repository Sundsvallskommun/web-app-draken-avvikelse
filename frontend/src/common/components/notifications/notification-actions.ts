import {
  AcknowledgeResult,
  acknowledgeSupportNotifications,
  getSupportNotifications,
} from '@supportmanagement/services/support-notification-service';

import { NotificationView } from './notification-view';

export type { AcknowledgeResult };

export const fetchNotifications = (municipalityId: string): Promise<NotificationView[]> =>
  getSupportNotifications(municipalityId);

/**
 * Acknowledge a set of notifications in one request.
 *
 * A failure comes back in `failed` rather than as a rejection: the backend answers 200 with the ids
 * it could not acknowledge.
 */
export const acknowledgeNotifications = async (
  municipalityId: string,
  notifications: NotificationView[]
): Promise<AcknowledgeResult> => {
  if (!notifications.length) return { acknowledged: [], failed: [] };

  return acknowledgeSupportNotifications(
    municipalityId,
    notifications.map((notification) => notification.id)
  );
};
