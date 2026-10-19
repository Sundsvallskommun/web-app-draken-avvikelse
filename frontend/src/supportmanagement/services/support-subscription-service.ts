import { NotificationChannel, Subscriber } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService } from '@common/services/api-service';

/** The user's own subscriber: who is notified, and on which channels. The backend creates it on first use. */
export const getMySubscriber = (municipalityId: string): Promise<Subscriber> =>
  apiService.get<Subscriber>(`supportsubscribers/${municipalityId}/me`).then((res) => res.data);

/**
 * Stores the channels the user is notified on. The backend also exposes event filters and pausing on the same
 * route; nothing offers those yet.
 */
export const updateMyNotificationChannels = (
  municipalityId: string,
  channels: NotificationChannel[]
): Promise<Subscriber> =>
  apiService
    .patch<Subscriber, { channels: NotificationChannel[] }>(`supportsubscribers/${municipalityId}/me`, { channels })
    .then((res) => res.data);
