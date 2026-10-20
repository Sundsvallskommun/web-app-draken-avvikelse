/** One thing that happened on the errand. */
export interface NotificationEventView {
  /**
   * When upstream wrote the notification that reports the event, not when it happened: between ten
   * seconds and a little over five minutes later, and about the same for every event it carries.
   */
  created: string;
  /** MESSAGE | ATTACHMENT | NOTE | ... — drives the icon. */
  subType?: string;
  /** CREATE | UPDATE | DELETE — what happened to the entity. */
  eventType?: string;
  /** Upstream's own wording of the event, the same text as in the errand's log; what the panel shows. */
  description?: string;
}

/**
 * The shape every notification component renders. Support Management dispatches notifications every
 * five minutes and writes one per errand on each run, holding every event on the errand that run
 * picked up, so an errand can have several.
 */
export interface NotificationView {
  id: string;
  created: string;
  acknowledged: boolean;
  errandId: string;
  errandNumber: string;
  /**
   * Everything the notification is about, newest first. Empty is a real case, not a bug: upstream
   * does not guarantee an event for every notification, and the panel still has to render a row.
   */
  events: NotificationEventView[];
}

/** One event as the backend hands it over. */
interface SupportNotificationEventResponse {
  created?: string;
  eventType?: string;
  subType?: string;
  description?: string;
}

/** Supportmanagement marks acknowledgement with a timestamp. */
export interface SupportNotificationResponse {
  id: string;
  created: string;
  acknowledged?: string;
  errandId: string;
  errandNumber: string;
  /** Already sorted newest first by the backend. */
  events?: SupportNotificationEventResponse[];
}

export const toNotificationView = (notification: SupportNotificationResponse): NotificationView => ({
  id: notification.id,
  created: notification.created,
  acknowledged: !!notification.acknowledged,
  errandId: notification.errandId,
  errandNumber: notification.errandNumber,
  events: (notification.events ?? []).map((event) => ({
    // An event without its own timestamp still has to sit somewhere on the timeline; the
    // notification's own timestamp is the closest truth available.
    created: event.created ?? notification.created,
    subType: event.subType?.toUpperCase(),
    eventType: event.eventType?.toUpperCase(),
    description: event.description,
  })),
});
