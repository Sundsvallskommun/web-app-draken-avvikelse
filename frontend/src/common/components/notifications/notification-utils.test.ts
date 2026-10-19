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

// Support Management reports an assignment as its own event type; without a label of its own an
// assignment without a description would read as the generic "Händelse på ärende".
test('names assignments, and a burst of them, in their own words', () => {
  const assignment: NotificationEventView = { created: '2026-10-01T09:00:00+02:00', subType: 'ASSIGNMENT' };

  assert.equal(notificationLabel(assignment), 'Ärendet tilldelat');
  assert.equal(notificationLabel({ ...assignment, eventType: 'DELETE' }), 'Tilldelning borttagen');
  assert.equal(notificationSummary(notification({ events: [assignment, assignment] })), '2 tilldelningar');
});
