import dayjs from 'dayjs';

import { NotificationEventView, NotificationView } from './notification-view';

/** Fallback labels for everything that is not a removal. */
const labelBySubType: Record<string, string> = {
  ASSIGNMENT: 'Ärendet tilldelat',
  ATTACHMENT: 'Ny bilaga',
  DECISION: 'Nytt beslut',
  ERRAND: 'Ärende uppdaterat',
  MESSAGE: 'Nytt meddelande',
  NOTE: 'Ny kommentar/anteckning',
  SUSPENSION: 'Parkering upphört',
};

/**
 * Labels for removals, which the plain ones get wrong — a deleted attachment is not "Ny bilaga".
 *
 * Only DELETE is treated specially. UPDATE would be the obvious second case, but upstream uses it
 * for things that merely reached the errand (`eventType: UPDATE` with the description "Meddelande
 * mottaget"), so an "uppdaterad" wording there would be plain wrong.
 */
const removalLabelBySubType: Record<string, string> = {
  ASSIGNMENT: 'Tilldelning borttagen',
  ATTACHMENT: 'Bilaga borttagen',
  DECISION: 'Beslut borttaget',
  MESSAGE: 'Meddelande borttaget',
  NOTE: 'Kommentar/anteckning borttagen',
};

/** Plural forms for the collapsed notification summary, falling back to the singular label. */
const pluralBySubType: Record<string, string> = {
  ASSIGNMENT: 'tilldelningar',
  ATTACHMENT: 'nya bilagor',
  DECISION: 'nya beslut',
  ERRAND: 'uppdateringar av ärendet',
  MESSAGE: 'nya meddelanden',
  NOTE: 'nya kommentarer/anteckningar',
  SUSPENSION: 'parkeringar som upphört',
};

/** Shown when an event carries neither a description nor a recognised subtype. */
const DEFAULT_NOTIFICATION_LABEL = 'Händelse på ärende';

/** Upstream marks removals with DELETE; every other type is something arriving or changing. */
const isRemoval = (event: NotificationEventView): boolean => event.eventType === 'DELETE';

/**
 * The event that stands for the notification in a collapsed row — the newest one.
 *
 * Undefined when the notification carries no events at all, which upstream does not rule out.
 */
export const primaryEvent = (notification: NotificationView): NotificationEventView | undefined =>
  notification.events[0];

/** What kind of thing happened, e.g. "Ny bilaga" or "Bilaga borttagen". */
export const subTypeLabel = (event?: NotificationEventView): string | undefined => {
  if (!event?.subType) return undefined;
  if (isRemoval(event)) return removalLabelBySubType[event.subType] ?? labelBySubType[event.subType];
  return labelBySubType[event.subType];
};

/**
 * What to call an event in the list.
 *
 * Not every event carries a description or a subtype — older ones predate those fields, and upstream
 * does not guarantee them. Falling back keeps the panel readable instead of rendering an empty or
 * broken row, and an absent event falls back the same way.
 */
export const notificationLabel = (event?: NotificationEventView): string =>
  event?.description ?? subTypeLabel(event) ?? DEFAULT_NOTIFICATION_LABEL;

/**
 * Human readable summary of a notification, e.g. "3 nya meddelanden".
 *
 * Only worth pluralising when every event is of the same kind; a mixed burst is just "händelser".
 */
export const notificationSummary = (notification: NotificationView): string => {
  if (notification.events.length <= 1) {
    return notificationLabel(primaryEvent(notification));
  }

  const subTypes = new Set(notification.events.map((event) => event.subType));
  const sharedSubType = subTypes.size === 1 ? notification.events[0].subType : undefined;
  // Every plural form reads as "new X". A burst that includes a removal is not that, so it falls
  // back to the neutral wording rather than claiming three new attachments when one was deleted.
  const plural = sharedSubType && !notification.events.some(isRemoval) ? pluralBySubType[sharedSubType] : undefined;

  return `${notification.events.length} ${plural ?? 'nya händelser'}`;
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
