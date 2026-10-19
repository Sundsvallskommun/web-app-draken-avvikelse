import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { apiServiceName } from '@/config/api-config';
import { SubscriberUpdateDto, SupportSubscriptionController } from '@/controllers/supportmanagement/support-subscription.controller';
import {
  IdentifierTypeEnum,
  NotificationChannelTypeEnum,
  Subscriber,
  Subscription,
  SubscriptionTargetTypeEnum,
} from '@/data-contracts/supportmanagement/data-contracts';

import { mockReq, mockRes, mockUser } from './helpers/http';
import { mockAdUsername, mockMunicipalityId, mockSupportErrandId, mockSupportNamespace } from './helpers/mock-data';

const SERVICE = apiServiceName('supportmanagement');
const MUNICIPALITY_ID = mockMunicipalityId;
const NAMESPACE = mockSupportNamespace;
const SUBSCRIBER_ID = 'subscriber-1';

const SUBSCRIBERS_URL = `${SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/subscribers`;
const SUBSCRIPTIONS_URL = `${SUBSCRIBERS_URL}/${SUBSCRIBER_ID}/subscriptions`;

interface ApiStub {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const existingSubscriber: Subscriber = {
  id: SUBSCRIBER_ID,
  identifier: { type: IdentifierTypeEnum.AdAccount, value: mockAdUsername },
};

/**
 * `apiService` is a plain instance property (the `private` keyword is erased at runtime), so it can
 * be replaced directly instead of mocking the module.
 */
const makeController = () => {
  const controller = new SupportSubscriptionController();
  const api: ApiStub = {
    get: vi.fn(async () => ({ data: [existingSubscriber], message: 'success' })),
    post: vi.fn(async () => ({ data: {}, message: 'success' })),
    patch: vi.fn(async () => ({ data: {}, message: 'success' })),
    delete: vi.fn(async () => ({ data: {}, message: 'success' })),
  };
  (controller as unknown as { apiService: ApiStub }).apiService = api;
  return { controller, api };
};

/** URLs of every GET the controller made, in call order. */
const getUrls = (api: ApiStub): string[] => api.get.mock.calls.map(call => call[0].url as string);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SupportSubscriptionController', () => {
  describe('resolving the subscriber', () => {
    it('looks the subscriber up by the ad account of the logged in user', async () => {
      const { controller, api } = makeController();
      const res = mockRes<Subscriber>();

      await controller.fetchMySubscriber(mockReq(), MUNICIPALITY_ID, res);

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(getUrls(api)[0]).toBe(`${SUBSCRIBERS_URL}?identifierType=adAccount&identifierValue=${mockAdUsername}`);
      expect(api.post).not.toHaveBeenCalled();
      expect(res.body).toEqual(existingSubscriber);
    });

    it('creates a subscriber on first use with the identifier taken from the session', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValueOnce({ data: [], message: 'success' });
      api.post.mockResolvedValueOnce({ data: existingSubscriber, message: 'success' });
      const res = mockRes<Subscriber>();

      await controller.fetchMySubscriber(mockReq(), MUNICIPALITY_ID, res);

      expect(api.post).toHaveBeenCalledTimes(1);
      const [config] = api.post.mock.calls[0];
      expect(config.url).toBe(SUBSCRIBERS_URL);
      expect(config.data.identifier).toEqual({ type: 'adAccount', value: mockAdUsername });
      expect(config.data.channels).toEqual([{ type: 'INTERNAL' }]);
      // Read back through the list, not from the create response.
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(res.body).toEqual(existingSubscriber);
    });

    it('always picks the same subscriber when the user ended up with more than one', async () => {
      const duplicate: Subscriber = { id: 'subscriber-0', identifier: existingSubscriber.identifier };
      const { controller, api } = makeController();
      const first = mockRes<Subscriber>();
      const second = mockRes<Subscriber>();

      api.get.mockResolvedValue({ data: [existingSubscriber, duplicate], message: 'success' });
      await controller.fetchMySubscriber(mockReq(), MUNICIPALITY_ID, first);
      // Same subscribers, other order.
      api.get.mockResolvedValue({ data: [duplicate, existingSubscriber], message: 'success' });
      await controller.fetchMySubscriber(mockReq(), MUNICIPALITY_ID, second);

      expect(first.body).toEqual(duplicate);
      expect(second.body).toEqual(duplicate);
    });

    it('shares one resolve between concurrent calls instead of creating two subscribers', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValueOnce({ data: [], message: 'success' }).mockResolvedValue({ data: [existingSubscriber], message: 'success' });
      api.post.mockResolvedValue({ data: '', message: 'success' });
      const first = mockRes<Subscriber>();
      const second = mockRes<Subscriber>();

      await Promise.all([
        controller.fetchMySubscriber(mockReq(), MUNICIPALITY_ID, first),
        controller.fetchMySubscriber(mockReq(), MUNICIPALITY_ID, second),
      ]);

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(first.body).toEqual(existingSubscriber);
      expect(second.body).toEqual(existingSubscriber);
    });

    it('reads the subscriber back when create answers without a body', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValueOnce({ data: [], message: 'success' }).mockResolvedValueOnce({ data: [existingSubscriber], message: 'success' });
      api.post.mockResolvedValueOnce({ data: '', message: 'success' });
      const res = mockRes<Subscriber>();

      await controller.fetchMySubscriber(mockReq(), MUNICIPALITY_ID, res);

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(res.body).toEqual(existingSubscriber);
    });

    it('uses the ad account of the calling user, not a shared one', async () => {
      const { controller, api } = makeController();
      const res = mockRes<Subscriber>();

      await controller.fetchMySubscriber(mockReq(mockUser({ username: 'xyz99xyz' })), MUNICIPALITY_ID, res);

      expect(getUrls(api)[0]).toContain('identifierValue=xyz99xyz');
    });
  });

  describe('createSubscription', () => {
    const errandTarget = { type: SubscriptionTargetTypeEnum.ERRAND, id: mockSupportErrandId };

    it('creates the subscription when the user has none for that errand', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValueOnce({ data: [existingSubscriber], message: 'success' }).mockResolvedValueOnce({ data: [], message: 'success' });
      api.post.mockResolvedValueOnce({ data: { id: 'subscription-1', target: errandTarget }, message: 'success' });
      const res = mockRes<Subscription>();

      await controller.createSubscription(mockReq(), MUNICIPALITY_ID, { target: errandTarget }, res);

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post.mock.calls[0][0].url).toBe(SUBSCRIPTIONS_URL);
      expect(res.statusCode).toBe(201);
    });

    it('returns the existing subscription instead of creating a duplicate', async () => {
      const existing: Subscription = { id: 'subscription-1', target: errandTarget };
      const { controller, api } = makeController();
      api.get
        .mockResolvedValueOnce({ data: [existingSubscriber], message: 'success' })
        .mockResolvedValueOnce({ data: [existing], message: 'success' });
      const res = mockRes<Subscription>();

      await controller.createSubscription(mockReq(), MUNICIPALITY_ID, { target: errandTarget }, res);

      expect(api.post).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(existing);
    });

    it('does not treat a subscription for another errand as a duplicate', async () => {
      const otherErrand: Subscription = { id: 'subscription-2', target: { type: SubscriptionTargetTypeEnum.ERRAND, id: 'another-errand' } };
      const { controller, api } = makeController();
      api.get
        .mockResolvedValueOnce({ data: [existingSubscriber], message: 'success' })
        .mockResolvedValueOnce({ data: [otherErrand], message: 'success' });
      api.post.mockResolvedValueOnce({ data: { id: 'subscription-3', target: errandTarget }, message: 'success' });
      const res = mockRes<Subscription>();

      await controller.createSubscription(mockReq(), MUNICIPALITY_ID, { target: errandTarget }, res);

      expect(api.post).toHaveBeenCalledTimes(1);
    });

    it('treats a namespace subscription as distinct from an errand subscription', async () => {
      const namespaceSubscription: Subscription = { id: 'subscription-4', target: { type: SubscriptionTargetTypeEnum.NAMESPACE } };
      const { controller, api } = makeController();
      api.get
        .mockResolvedValueOnce({ data: [existingSubscriber], message: 'success' })
        .mockResolvedValueOnce({ data: [namespaceSubscription], message: 'success' });
      api.post.mockResolvedValueOnce({ data: { id: 'subscription-5', target: errandTarget }, message: 'success' });
      const res = mockRes<Subscription>();

      await controller.createSubscription(mockReq(), MUNICIPALITY_ID, { target: errandTarget }, res);

      expect(api.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteSubscription', () => {
    it('scopes the delete to the subscriber of the logged in user', async () => {
      const { controller, api } = makeController();
      const res = mockRes();

      await controller.deleteSubscription(mockReq(), MUNICIPALITY_ID, 'subscription-1', res);

      expect(api.delete).toHaveBeenCalledWith({ url: `${SUBSCRIPTIONS_URL}/subscription-1` }, expect.anything());
      expect(res.statusCode).toBe(204);
    });
  });

  describe('updateMySubscriber', () => {
    it('patches the resolved subscriber', async () => {
      const { controller, api } = makeController();
      const res = mockRes<Subscriber>();

      await controller.updateMySubscriber(mockReq(), MUNICIPALITY_ID, { pausedFrom: '2026-01-01T00:00:00Z' }, res);

      expect(api.patch).toHaveBeenCalledTimes(1);
      const [config] = api.patch.mock.calls[0];
      expect(config.url).toBe(`${SUBSCRIBERS_URL}/${SUBSCRIBER_ID}`);
      expect(config.data).toEqual({ pausedFrom: '2026-01-01T00:00:00Z' });
    });

    it('stores the chosen channels once each, and always the one in Draken', async () => {
      const { controller, api } = makeController();
      const { EMAIL, INTERNAL, SMS } = NotificationChannelTypeEnum;

      await controller.updateMySubscriber(mockReq(), MUNICIPALITY_ID, { channels: [{ type: SMS }, { type: EMAIL }, { type: SMS }] }, mockRes());
      await controller.updateMySubscriber(mockReq(), MUNICIPALITY_ID, { channels: [] }, mockRes());

      expect(api.patch.mock.calls[0][0].data).toEqual({ channels: [{ type: INTERNAL }, { type: SMS }, { type: EMAIL }] });
      // Unticking everything leaves the notifications in Draken, which are not the user's to turn off here.
      expect(api.patch.mock.calls[1][0].data).toEqual({ channels: [{ type: INTERNAL }] });
    });

    it("takes a channel by its kind only, never with an address or number of the caller's choosing", async () => {
      const options = { whitelist: true, forbidNonWhitelisted: true };
      const body = (channels: unknown) => plainToInstance(SubscriberUpdateDto, { channels });

      await expect(validate(body([{ type: 'EMAIL' }, { type: 'SMS' }]), options)).resolves.toEqual([]);
      expect(await validate(body([{ type: 'EMAIL', destination: 'someone@example.test' }]), options)).not.toEqual([]);
      expect(await validate(body([{ type: 'FAX' }]), options)).not.toEqual([]);
    });
  });
});
