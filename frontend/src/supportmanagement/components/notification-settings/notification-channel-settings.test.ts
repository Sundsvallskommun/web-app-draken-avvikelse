import assert from 'node:assert/strict';

import {
  type NotificationChannel,
  NotificationChannelTypeEnum,
} from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import {
  chosenNotificationChannels,
  hasNotificationChannelChange,
  type SelectableNotificationChannel,
  toggleNotificationChannel,
  toSubscriberChannels,
} from './notification-channel-settings';

const { EMAIL, INTERNAL, SMS } = NotificationChannelTypeEnum;
const OFFERED: readonly SelectableNotificationChannel[] = ['EMAIL', 'SMS'];
const channels = (...types: NotificationChannelTypeEnum[]): NotificationChannel[] => types.map((type) => ({ type }));

test('the choice is the offered channels Support Management holds, in the order they are offered', () => {
  assert.deepEqual(chosenNotificationChannels(channels(SMS, INTERNAL, EMAIL), OFFERED), ['EMAIL', 'SMS']);
  assert.deepEqual(chosenNotificationChannels(channels(INTERNAL), OFFERED), []);
  assert.deepEqual(chosenNotificationChannels(undefined, OFFERED), []);
});

test('a channel that is not offered is not a choice, though the user holds it', () => {
  assert.deepEqual(chosenNotificationChannels(channels(INTERNAL, EMAIL, SMS), ['EMAIL']), ['EMAIL']);
});

test('a channel is ticked once and unticked again', () => {
  assert.deepEqual(toggleNotificationChannel([], 'SMS', true), ['SMS']);
  assert.deepEqual(toggleNotificationChannel(['SMS'], 'SMS', true), ['SMS']);
  assert.deepEqual(toggleNotificationChannel(['EMAIL', 'SMS'], 'EMAIL', false), ['SMS']);
  assert.deepEqual(toggleNotificationChannel(['SMS'], 'EMAIL', false), ['SMS']);
});

test('what is stored always carries the notifications in Draken, and the chosen channels by kind only', () => {
  assert.deepEqual(toSubscriberChannels(['SMS', 'EMAIL'], OFFERED), [
    { type: INTERNAL },
    { type: EMAIL },
    { type: SMS },
  ]);
  assert.deepEqual(toSubscriberChannels([], OFFERED), [{ type: INTERNAL }]);
  // A choice of something that is not offered is not stored.
  assert.deepEqual(toSubscriberChannels(['SMS'], ['EMAIL']), [{ type: INTERNAL }]);
});

test('saving has something to do only when the choice differs from what is stored', () => {
  assert.equal(hasNotificationChannelChange(channels(INTERNAL, EMAIL), ['EMAIL'], OFFERED), false);
  assert.equal(hasNotificationChannelChange(channels(INTERNAL, EMAIL), ['EMAIL', 'SMS'], OFFERED), true);
  assert.equal(hasNotificationChannelChange(channels(INTERNAL, EMAIL), ['SMS'], OFFERED), true);
  assert.equal(hasNotificationChannelChange(undefined, [], OFFERED), false);
});
