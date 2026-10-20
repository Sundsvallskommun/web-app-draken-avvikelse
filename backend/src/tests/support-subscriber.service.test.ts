import { apiServiceName } from '@/config/api-config';
import { Subscriber, Subscription, SubscriptionTargetTypeEnum } from '@/data-contracts/supportmanagement/data-contracts';
import { SupportSubscriberApi, unfollowErrandAssignedToOther } from '@/services/support-subscriber.service';
import { logger } from '@/utils/logger';

import { mockUser } from './helpers/http';
import { mockAdUsername, mockMunicipalityId, mockSupportErrandId, mockSupportNamespace } from './helpers/mock-data';

const SERVICE = apiServiceName('supportmanagement');
const SUBSCRIBERS_URL = `${SERVICE}/${mockMunicipalityId}/${mockSupportNamespace}/subscribers`;
const OTHER_HANDLER = 'other.handler';

const errandTarget = (id: string) => ({ type: SubscriptionTargetTypeEnum.ERRAND, id });

/**
 * Support Management as the subscriber routes see it: the subscribers by account, and each subscriber's
 * subscriptions.
 */
const makeApi = (subscribersByAccount: Record<string, Subscriber[]>, subscriptionsBySubscriber: Record<string, Subscription[]>) => {
  const apiService = {
    get: vi.fn(async ({ url }: { url: string }) => {
      const subscriberId = url.match(/subscribers\/([^/?]+)\/subscriptions$/u)?.[1];
      if (subscriberId) return { data: subscriptionsBySubscriber[subscriberId] ?? [], message: 'success' };
      const account = new URL(`https://upstream/${url}`).searchParams.get('identifierValue') ?? '';
      return { data: subscribersByAccount[account] ?? [], message: 'success' };
    }),
    post: vi.fn(async (_config: { url: string; data: unknown }) => ({ data: {}, message: 'success' })),
    delete: vi.fn(async (_config: { url: string; notifySubscribers?: false }) => ({ data: {}, message: 'success' })),
  };
  const api: SupportSubscriberApi = { apiService: apiService as never, service: SERVICE, namespace: mockSupportNamespace };
  return { api, apiService };
};

const assignment = (assignee?: string) => ({ municipalityId: mockMunicipalityId, errandId: mockSupportErrandId, assignee });

describe('unfollowErrandAssignedToOther', () => {
  it('ends every subscription the user who assigns the errand away has to it, and to that errand alone', async () => {
    const { api, apiService } = makeApi(
      { [mockAdUsername]: [{ id: 'own-1' }, { id: 'own-2' }] },
      {
        'own-1': [
          { id: 'followed', target: errandTarget(mockSupportErrandId) },
          { id: 'other-errand', target: errandTarget('another-errand') },
          { id: 'namespace', target: { type: SubscriptionTargetTypeEnum.NAMESPACE } },
        ],
        // A duplicate subscriber, which Support Management allows: its following ends too.
        'own-2': [{ id: 'followed-twice', target: errandTarget(mockSupportErrandId) }],
      },
    );

    await unfollowErrandAssignedToOther(api, assignment(OTHER_HANDLER), mockUser());

    expect(apiService.get.mock.calls.map(([config]) => config.url)).toEqual([
      `${SUBSCRIBERS_URL}?identifierType=adAccount&identifierValue=${mockAdUsername}`,
      `${SUBSCRIBERS_URL}/own-1/subscriptions`,
      `${SUBSCRIBERS_URL}/own-2/subscriptions`,
    ]);
    expect(apiService.delete.mock.calls.map(([config]) => config)).toEqual([
      { url: `${SUBSCRIBERS_URL}/own-1/subscriptions/followed`, notifySubscribers: false },
      { url: `${SUBSCRIBERS_URL}/own-2/subscriptions/followed-twice`, notifySubscribers: false },
    ]);
  });

  // Support Management subscribes whoever is assigned on its own.
  it('leaves the new assignee to Support Management', async () => {
    const { api, apiService } = makeApi({ [mockAdUsername]: [{ id: 'own-1' }] }, {});

    await unfollowErrandAssignedToOther(api, assignment(OTHER_HANDLER), mockUser());

    expect(apiService.get.mock.calls.some(([config]) => config.url.includes(OTHER_HANDLER))).toBe(false);
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it('keeps the following of a user who assigns the errand to themselves, or to nobody', async () => {
    const { api, apiService } = makeApi({}, {});

    await unfollowErrandAssignedToOther(api, assignment(` ${mockAdUsername.toUpperCase()} `), mockUser());
    await unfollowErrandAssignedToOther(api, assignment(undefined), mockUser());

    expect(apiService.get).not.toHaveBeenCalled();
    expect(apiService.delete).not.toHaveBeenCalled();
  });

  it('logs a failure rather than undoing an assignment that has landed', async () => {
    const { api, apiService } = makeApi({}, {});
    apiService.get.mockRejectedValue(new Error('Support Management is down'));
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    await expect(unfollowErrandAssignedToOther(api, assignment(OTHER_HANDLER), mockUser())).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(
      `Could not stop ${mockAdUsername} following support errand ${mockSupportErrandId} after assigning it to ${OTHER_HANDLER}`,
    );
    logged.mockRestore();
  });
});
