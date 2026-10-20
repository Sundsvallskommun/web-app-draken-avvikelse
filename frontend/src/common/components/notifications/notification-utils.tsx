import dayjs from 'dayjs';

import { NotificationEventView, NotificationView } from './notification-view';

/** Shown for an event without a description. */
const DEFAULT_NOTIFICATION_LABEL = 'Händelse på ärende';

/**
 * The event that stands for the notification in a collapsed row — the newest one.
 *
 * Undefined when the notification carries no events at all, which upstream does not rule out.
 */
export const primaryEvent = (notification: NotificationView): NotificationEventView | undefined =>
  notification.events[0];

/**
 * What to call an event in the list: upstream's own description of it, e.g. "Bilaga har skapats".
 *
 * Support Management writes the same text it logs for the event, so the panel and the errand's log
 * say the same thing. An event without one, or no event at all, falls back to a generic label.
 */
export const notificationLabel = (event?: NotificationEventView): string =>
  event?.description || DEFAULT_NOTIFICATION_LABEL;

/**
 * Human readable summary of a notification, e.g. "Ärendet har uppdaterats (3)" or "3 händelser".
 *
 * Several events that upstream describes alike are counted under that description; a mixed burst is
 * just "händelser".
 */
export const notificationSummary = (notification: NotificationView): string => {
  if (notification.events.length <= 1) {
    return notificationLabel(primaryEvent(notification));
  }

  const labels = new Set(notification.events.map(notificationLabel));
  const sharedLabel = labels.size === 1 ? notificationLabel(primaryEvent(notification)) : undefined;

  return sharedLabel ? `${sharedLabel} (${notification.events.length})` : `${notification.events.length} händelser`;
};

/**
 * Hide what the user should not be bothered by. The backend is responsible for not notifying the
 * person who acted.
 */
export const getFilteredNotifications = (notifications: NotificationView[]): NotificationView[] => {
  const kept: NotificationView[] = [];

  notifications.forEach((notification) => {
    // Phase changes are noise for everyone until subscriber event filters are configured.
    const events = notification.events.filter((event) => event.subType !== 'SYSTEM');

    // Filtering away everything a notification had to say leaves nothing to show. A notification
    // that never carried events is a different case — it keeps its row, under the generic label.
    if (notification.events.length > 0 && events.length === 0) return;

    kept.push({ ...notification, events });
  });

  return kept;
};

/**
 * Does a log event and a notification event describe the same thing?
 *
 * Still a heuristic: upstream timestamps every notification event but puts no id on it, so there is
 * nothing exact to compare. Matching per event rather than per notification is as close as the API
 * currently allows, and keeping the comparison in one place means it disappears in a single edit
 * once upstream exposes the reference.
 */
const isSameEvent = (
  event: { subType?: string; created?: string },
  notificationEvent: NotificationEventView
): boolean => {
  if (!event.created || !notificationEvent.created) return false;
  // Both subtypes must be known. Treating "neither has one" as a match would let any event within
  // the time window claim any subtype-less notification event.
  if (!event.subType || !notificationEvent.subType) return false;
  if (event.subType.toUpperCase() !== notificationEvent.subType) return false;
  return Math.abs(dayjs(event.created).diff(dayjs(notificationEvent.created), 'second')) <= 5;
};

/** Did this log event produce one of the events the notification is about? */
export const matchEventToNotification = (
  event: { subType?: string; created?: string },
  notification: NotificationView
): boolean => notification.events.some((notificationEvent) => isSameEvent(event, notificationEvent));

/**
 * The newest event on an errand that the user has not acknowledged yet, from their own notifications.
 *
 * Undefined when nothing has happened there since they last opened it, or when they get no
 * notifications for it at all.
 */
export const latestUnacknowledgedEvent = (
  notifications: NotificationView[],
  errandId: string | undefined
): NotificationEventView | undefined =>
  notifications
    .filter((notification) => notification.errandId === errandId && !notification.acknowledged)
    .flatMap((notification) => notification.events)
    .reduce<NotificationEventView | undefined>(
      (latest, event) => (!latest || dayjs(event.created).isAfter(dayjs(latest.created)) ? event : latest),
      undefined
    );

/** Deep link that opens the errand on its log, with the events the notification covers highlighted. */
export const notificationHref = (notification: NotificationView): string =>
  `/arende/${notification.errandNumber}?tab=history&notification=${notification.id}`;
