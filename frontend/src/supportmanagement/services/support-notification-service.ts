import {
  NotificationView,
  SupportNotificationResponse,
  toNotificationView,
} from '@common/components/notifications/notification-view';
import { apiService } from '@common/services/api-service';

/** Which ids the backend managed to acknowledge upstream, and which it did not. */
export interface AcknowledgeResult {
  acknowledged: string[];
  failed: string[];
}

export const getSupportNotifications: (municipalityId: string) => Promise<NotificationView[]> = (municipalityId) => {
  return apiService
    .get<SupportNotificationResponse[]>(`supportnotifications/${municipalityId}`)
    .then((res) => {
      return res.data.map(toNotificationView);
    })
    .catch((e) => {
      console.error('Something went wrong when fetching notifications');
      throw e;
    });
};

/**
 * Acknowledge one or more notifications in a single request. Upstream only acknowledges one
 * notification per call, but that fan-out lives in the backend so the browser makes one call
 * regardless of how many notifications the user ticked.
 */
export const acknowledgeSupportNotifications: (municipalityId: string, ids: string[]) => Promise<AcknowledgeResult> = (
  municipalityId,
  ids
) => {
  if (!ids.length) {
    return Promise.resolve({ acknowledged: [], failed: [] });
  }
  return apiService
    .patch<AcknowledgeResult, { ids: string[] }>(`supportnotifications/${municipalityId}/acknowledge`, { ids })
    .then((res) => {
      return res.data;
    })
    .catch((e) => {
      console.error('Something went wrong when acknowledging notifications');
      throw e;
    });
};

/** Acknowledge every notification the logged in user has for one errand, e.g. when opening it. */
export const acknowledgeAllForErrand: (municipalityId: string, errandId: string) => Promise<AcknowledgeResult> = (
  municipalityId,
  errandId
) => {
  if (!errandId) {
    return Promise.reject('Missing id on errand');
  }
  return apiService
    .put<AcknowledgeResult, Record<string, never>>(
      `supportnotifications/${municipalityId}/${errandId}/acknowledge-all`,
      {}
    )
    .then((res) => {
      return res.data;
    })
    .catch((e) => {
      console.error('Something went wrong when acknowledging notifications for errand');
      throw e;
    });
};
