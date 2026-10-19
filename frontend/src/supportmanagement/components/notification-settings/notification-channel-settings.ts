import {
  type NotificationChannel,
  NotificationChannelTypeEnum,
} from '@common/data-contracts/supportmanagement/data-contracts';

/** A way to be notified beside the notifications in Draken, which are always on. */
export type SelectableNotificationChannel = 'EMAIL' | 'SMS';

export const NOTIFICATION_CHANNEL_LABELS: Readonly<Record<SelectableNotificationChannel, string>> = Object.freeze({
  EMAIL: 'E-post',
  SMS: 'SMS',
});

/** The offered channels the user has chosen, as Support Management holds them, in the order they are offered. */
export const chosenNotificationChannels = (
  subscriberChannels: readonly NotificationChannel[] | undefined,
  offered: readonly SelectableNotificationChannel[]
): SelectableNotificationChannel[] => {
  const held = new Set<string>((subscriberChannels ?? []).map((channel) => channel.type));
  return offered.filter((channel) => held.has(channel));
};

/** The choice with one channel ticked or unticked. */
export const toggleNotificationChannel = (
  chosen: readonly SelectableNotificationChannel[],
  channel: SelectableNotificationChannel,
  on: boolean
): SelectableNotificationChannel[] =>
  on ? [...chosen.filter((current) => current !== channel), channel] : chosen.filter((current) => current !== channel);

/**
 * What is stored for a choice: the notifications in Draken, and the chosen channels beside them. By kind only -
 * e-mail and SMS go to the address and number the account has.
 */
export const toSubscriberChannels = (
  chosen: readonly SelectableNotificationChannel[],
  offered: readonly SelectableNotificationChannel[]
): NotificationChannel[] => [
  { type: NotificationChannelTypeEnum.INTERNAL },
  ...offered
    .filter((channel) => chosen.includes(channel))
    .map((channel) => ({ type: NotificationChannelTypeEnum[channel] })),
];

/** Whether the choice differs from what is stored, so that saving has something to do. */
export const hasNotificationChannelChange = (
  subscriberChannels: readonly NotificationChannel[] | undefined,
  chosen: readonly SelectableNotificationChannel[],
  offered: readonly SelectableNotificationChannel[]
): boolean => {
  const stored = chosenNotificationChannels(subscriberChannels, offered);
  return stored.length !== chosen.length || stored.some((channel) => !chosen.includes(channel));
};
