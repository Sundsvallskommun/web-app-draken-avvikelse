import { apiServiceName } from '@/config/api-config';
import { Subscriber, Subscription, SubscriptionTargetTypeEnum } from '@/data-contracts/supportmanagement/data-contracts';
import { followErrandWithAssignee, SupportSubscriberApi } from '@/services/support-subscriber.service';
import { logger } from '@/utils/logger';

import { mockUser } from './helpers/http';
import { mockMunicipalityId, mockSupportErrandId, mockSupportNamespace } from './helpers/mock-data';

const SERVICE = apiServiceName('supportmanagement');
const SUBSCRIBERS_URL = `${SERVICE}/${mockMunicipalityId}/${mockSupportNamespace}/subscribers`;
const PREVIOUS = 'previous.handler';
const NEXT = 'next.handler';

const errandTarget = (id: string) => ({ type: SubscriptionTargetTypeEnum.ERRAND, id });

/**
 * Support Management as the subscriber routes see it: the subscribers by account, and each subscriber's
 * subscriptions. A subscriber created through POST is there when it is read back.
 */
const makeApi = (subscribersByAccount: Record<string, Subscriber[]>, subscriptionsBySubscriber: Record<string, Subscription[]>) => {
  const created: Record<string, Subscriber[]> = {};
  const apiService = {
    get: vi.fn(async ({ url }: { url: string }) => {
      const subscriberId = url.match(/subscribers\/([^/?]+)\/subscriptions$/u)?.[1];
      if (subscriberId) return { data: subscriptionsBySubscriber[subscriberId] ?? [], message: 'success' };
      const account = new URL(`https://upstream/${url}`).searchParams.get('identifierValue') ?? '';
      return { data: [...(subscribersByAccount[account] ?? []), ...(created[account] ?? [])], message: 'success' };
    }),
    post: vi.fn(async ({ url, data }: { url: string; data: Subscriber }) => {
      if (url === SUBSCRIBERS_URL) created[data.identifier!.value] = [{ ...data, id: `created-${data.identifier!.value}` }];
      return { data: {}, message: 'success' };
    }),
    delete: vi.fn(async (_config: { url: string; notifySubscribers?: false }) => ({ data: {}, message: 'success' })),
  };
  const api: SupportSubscriberApi = { apiService: apiService as never, service: SERVICE, namespace: mockSupportNamespace };
  return { api, apiService };
};

const change = (previousAssignee?: string, nextAssignee?: string) => ({
  municipalityId: mockMunicipalityId,
  errandId: mockSupportErrandId,
  previousAssignee,
  nextAssignee,
});

describe('followErrandWithAssignee', () => {
  it('ends every subscription the previous assignee had to the errand, and to that errand alone', async () => {
    const { api, apiService } = makeApi(
      { [PREVIOUS]: [{ id: 'previous-1' }, { id: 'previous-2' }], [NEXT]: [{ id: 'next-1' }] },
      {
        'previous-1': [
          { id: 'followed', target: errandTarget(mockSupportErrandId) },
          { id: 'other-errand', target: errandTarget('another-errand') },
          { id: 'namespace', target: { type: SubscriptionTargetTypeEnum.NAMESPACE } },
        ],
        // A duplicate subscriber, which Support Management allows: its following ends too.
        'previous-2': [{ id: 'followed-twice', target: errandTarget(mockSupportErrandId) }],
        'next-1': [{ id: 'already', target: errandTarget(mockSupportErrandId) }],
      },
    );

    await followErrandWithAssignee(api, change(PREVIOUS, NEXT), mockUser());

    expect(apiService.delete.mock.calls.map(([config]) => config)).toEqual([
      { url: `${SUBSCRIBERS_URL}/previous-1/subscriptions/followed`, notifySubscribers: false },
      { url: `${SUBSCRIBERS_URL}/previous-2/subscriptions/followed-twice`, notifySubscribers: false },
    ]);
    // The new assignee already follows the errand, so nothing is added.
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it('subscribes the new assignee, creating their subscriber on first use, and tells nobody', async () => {
    const { api, apiService } = makeApi({}, {});

    await followErrandWithAssignee(api, change(undefined, NEXT), mockUser());

    expect(apiService.post.mock.calls.map(([config]) => config)).toEqual([
      {
        url: SUBSCRIBERS_URL,
        data: { identifier: { type: 'adAccount', value: NEXT }, channels: [{ type: 'INTERNAL' }], eventFilters: [] },
        notifySubscribers: false,
      },
      {
        url: `${SUBSCRIBERS_URL}/created-${NEXT}/subscriptions`,
        data: { target: errandTarget(mockSupportErrandId) },
        notifySubscribers: false,
      },
    ]);
    expect(apiService.delete).not.toHaveBeenCalled();
  });

  it('leaves the following alone when the assignee stays the same', async () => {
    const { api, apiService } = makeApi({}, {});

    await followErrandWithAssignee(api, change(PREVIOUS, ` ${PREVIOUS.toUpperCase()} `), mockUser());

    expect(apiService.get).not.toHaveBeenCalled();
  });

  it('logs a failure rather than undoing an assignment that has landed', async () => {
    const { api, apiService } = makeApi({}, {});
    apiService.get.mockRejectedValue(new Error('Support Management is down'));
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => logger);

    await expect(followErrandWithAssignee(api, change(PREVIOUS, NEXT), mockUser())).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(`Could not move the following of support errand ${mockSupportErrandId} to its assignee`);
    logged.mockRestore();
  });
});
