import assert from 'node:assert/strict';

import { test } from 'vitest';

import { latestUnacknowledgedEvent, notificationLabel, notificationSummary } from './notification-utils';
import type { NotificationEventView, NotificationView } from './notification-view';

const event = (created: string, description: string): NotificationEventView => ({
  created,
  subType: 'MESSAGE',
  description,
});

const notification = (overrides: Partial<NotificationView>): NotificationView => ({
  id: 'notification-1',
  created: '2026-10-01T08:00:00+02:00',
  acknowledged: false,
  errandId: 'errand-1',
  errandNumber: 'KC-1',
  events: [],
  ...overrides,
});

test('picks the newest event across the unacknowledged notifications for the errand', () => {
  const notifications = [
    notification({ id: 'older', events: [event('2026-10-01T09:00:00+02:00', 'Första')] }),
    notification({
      id: 'newer',
      events: [event('2026-10-01T08:30:00+02:00', 'Tidig'), event('2026-10-01T10:00:00+02:00', 'Senaste')],
    }),
  ];

  assert.equal(latestUnacknowledgedEvent(notifications, 'errand-1')?.description, 'Senaste');
});

test('leaves out acknowledged notifications and other errands', () => {
  const notifications = [
    notification({ acknowledged: true, events: [event('2026-10-01T11:00:00+02:00', 'Redan läst')] }),
    notification({ errandId: 'errand-2', events: [event('2026-10-01T12:00:00+02:00', 'Annat ärende')] }),
    notification({ events: [event('2026-10-01T09:00:00+02:00', 'Oläst')] }),
  ];

  assert.equal(latestUnacknowledgedEvent(notifications, 'errand-1')?.description, 'Oläst');
});

test('is undefined when nothing new has happened on the errand', () => {
  assert.equal(latestUnacknowledgedEvent([notification({ acknowledged: true })], 'errand-1'), undefined);
  assert.equal(latestUnacknowledgedEvent([notification({ events: [] })], 'errand-1'), undefined);
  assert.equal(latestUnacknowledgedEvent([], undefined), undefined);
});

// Support Management describes every event itself, in the words of the errand's log; the panel
// repeats that rather than naming the subtype in words of its own.
test('names an event by the description upstream gives it', () => {
  const removal: NotificationEventView = {
    created: '2026-10-01T09:00:00+02:00',
    subType: 'ATTACHMENT',
    eventType: 'DELETE',
    description: 'Bilaga har tagits bort',
  };

  assert.equal(notificationLabel(removal), 'Bilaga har tagits bort');
});

test('falls back to a generic label for an event without a description', () => {
  const undescribed: NotificationEventView = { created: '2026-10-01T09:00:00+02:00', subType: 'ERRAND' };

  assert.equal(notificationLabel(undescribed), 'Händelse på ärende');
  assert.equal(notificationLabel({ ...undescribed, description: '' }), 'Händelse på ärende');
  assert.equal(notificationLabel(undefined), 'Händelse på ärende');
});

test('counts a burst under the description its events share, and as händelser when they differ', () => {
  const update = event('2026-10-01T09:00:00+02:00', 'Ärendet har uppdaterats');
  const note = { ...event('2026-10-01T09:01:00+02:00', 'Kommentar har skapats'), subType: 'NOTE' };

  assert.equal(notificationSummary(notification({ events: [update] })), 'Ärendet har uppdaterats');
  assert.equal(notificationSummary(notification({ events: [update, update, update] })), 'Ärendet har uppdaterats (3)');
  assert.equal(notificationSummary(notification({ events: [note, update] })), '2 händelser');
});
