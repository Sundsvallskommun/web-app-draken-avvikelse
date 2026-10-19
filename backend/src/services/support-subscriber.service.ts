import {
  IdentifierTypeEnum,
  NotificationChannel,
  NotificationChannelTypeEnum,
  Subscriber,
  Subscription,
  SubscriptionTarget,
  SubscriptionTargetTypeEnum,
} from '@/data-contracts/supportmanagement/data-contracts';
import { User } from '@/interfaces/users.interface';
import { logger } from '@/utils/logger';

import ApiService from './api.service';

/** Where Support Management's subscribers are reached: the service and the namespace a request goes to. */
export interface SupportSubscriberApi {
  readonly apiService: Pick<ApiService, 'get' | 'post' | 'delete'>;
  readonly service: string;
  readonly namespace: string | undefined;
}

/** The account a subscriber notifies, and what it is called where Draken knows it. */
interface SubscriberIdentity {
  readonly account: string;
  readonly name?: string;
}

const DEFAULT_CHANNELS: NotificationChannel[] = [{ type: NotificationChannelTypeEnum.INTERNAL }];

export const sameSubscriptionTarget = (a?: SubscriptionTarget, b?: SubscriptionTarget): boolean =>
  a?.type === b?.type && (a?.id ?? null) === (b?.id ?? null);

/** Duplicates are possible and the list order undefined, so order by id to converge on one subscriber. */
const pickSubscriber = (subscribers?: Subscriber[]): Subscriber | undefined =>
  (subscribers ?? []).slice().sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))[0];

const subscribersUrl = (api: SupportSubscriberApi, municipalityId: string): string => `${api.service}/${municipalityId}/${api.namespace}/subscribers`;

export const subscriptionsUrl = (api: SupportSubscriberApi, municipalityId: string, subscriberId: string): string =>
  `${subscribersUrl(api, municipalityId)}/${subscriberId}/subscriptions`;

/** Every subscriber Support Management keeps for the account; usually one, but duplicates happen. */
const findSubscribers = async (api: SupportSubscriberApi, municipalityId: string, account: string, user: User): Promise<Subscriber[]> => {
  const query = new URLSearchParams({ identifierType: IdentifierTypeEnum.AdAccount, identifierValue: account }).toString();
  const response = await api.apiService.get<Subscriber[]>({ url: `${subscribersUrl(api, municipalityId)}?${query}` }, user);
  return response.data ?? [];
};

/**
 * The account's subscriber, created on first use. It is the anchor every subscription hangs off, so whoever
 * subscribes the account would otherwise have to create it first.
 */
export const loadOrCreateSubscriber = async (
  api: SupportSubscriberApi,
  municipalityId: string,
  { account, name }: SubscriberIdentity,
  user: User,
): Promise<Subscriber> => {
  const found = pickSubscriber(await findSubscribers(api, municipalityId, account, user));
  if (found) return found;

  const data: Subscriber = {
    ...(name ? { name } : {}),
    identifier: { type: IdentifierTypeEnum.AdAccount, value: account },
    channels: DEFAULT_CHANNELS,
    eventFilters: [],
  };
  // Created as a side effect; nothing anyone is to be told about.
  await api.apiService.post<Subscriber, Subscriber>({ url: subscribersUrl(api, municipalityId), data, notifySubscribers: false }, user);

  // Read back rather than trust the created body: create can answer 201 empty, and another
  // instance may have created one at the same time.
  const subscriber = pickSubscriber(await findSubscribers(api, municipalityId, account, user));
  if (!subscriber) {
    logger.error(`Subscriber for ${account} could not be read back after creation`);
    throw new Error('Subscriber could not be created');
  }
  return subscriber;
};

const readSubscriptions = async (api: SupportSubscriberApi, municipalityId: string, subscriberId: string, user: User): Promise<Subscription[]> =>
  (await api.apiService.get<Subscription[]>({ url: subscriptionsUrl(api, municipalityId, subscriberId) }, user)).data ?? [];

const sameAccount = (a: string | undefined, b: string | undefined): boolean => (a ?? '').toLowerCase() === (b ?? '').toLowerCase();

interface AssigneeChange {
  readonly municipalityId: string;
  readonly errandId: string;
  readonly previousAssignee?: string;
  readonly nextAssignee?: string;
}

/**
 * Moves the following of an errand along with its assignee, where the errand is followed by its assignee alone: every
 * subscription the previous assignee had to it ends - one they made with Bevaka too - and the new assignee is
 * subscribed unless Support Management already did. Bookkeeping, so it notifies nobody; and the assignment has
 * already landed, so a failure is logged rather than thrown.
 */
export const followErrandWithAssignee = async (
  api: SupportSubscriberApi,
  { municipalityId, errandId, previousAssignee, nextAssignee }: AssigneeChange,
  user: User,
): Promise<void> => {
  const previous = previousAssignee?.trim();
  const next = nextAssignee?.trim();
  if (sameAccount(previous, next)) return;
  const target: SubscriptionTarget = { type: SubscriptionTargetTypeEnum.ERRAND, id: errandId };
  try {
    if (previous) {
      for (const subscriber of await findSubscribers(api, municipalityId, previous, user)) {
        const followed = (await readSubscriptions(api, municipalityId, subscriber.id!, user)).filter(subscription =>
          sameSubscriptionTarget(subscription.target, target),
        );
        for (const subscription of followed) {
          await api.apiService.delete(
            { url: `${subscriptionsUrl(api, municipalityId, subscriber.id!)}/${subscription.id}`, notifySubscribers: false },
            user,
          );
        }
      }
    }
    if (next) {
      const subscriber = await loadOrCreateSubscriber(api, municipalityId, { account: next }, user);
      const subscriptions = await readSubscriptions(api, municipalityId, subscriber.id!, user);
      if (!subscriptions.some(subscription => sameSubscriptionTarget(subscription.target, target))) {
        await api.apiService.post<Subscription, { target: SubscriptionTarget }>(
          { url: subscriptionsUrl(api, municipalityId, subscriber.id!), data: { target }, notifySubscribers: false },
          user,
        );
      }
    }
  } catch (error) {
    logger.error(`Could not move the following of support errand ${errandId} to its assignee`);
    logger.error(error);
  }
};
