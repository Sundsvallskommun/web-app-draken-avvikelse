import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { apiServiceName } from '@/config/api-config';
import { SubscriberUpdateDto, SupportSubscriptionController } from '@/controllers/supportmanagement/support-subscription.controller';
import { IdentifierTypeEnum, NotificationChannelTypeEnum, Subscriber } from '@/data-contracts/supportmanagement/data-contracts';

import { mockReq, mockRes, mockUser } from './helpers/http';
import { mockAdUsername, mockMunicipalityId, mockSupportNamespace } from './helpers/mock-data';

const SERVICE = apiServiceName('supportmanagement');
const MUNICIPALITY_ID = mockMunicipalityId;
const NAMESPACE = mockSupportNamespace;
const SUBSCRIBER_ID = 'subscriber-1';

const SUBSCRIBERS_URL = `${SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/subscribers`;

interface ApiStub {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
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

      await controller.fetchMySubscriber(mockReq(), res);

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

      await controller.fetchMySubscriber(mockReq(), res);

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
      await controller.fetchMySubscriber(mockReq(), first);
      // Same subscribers, other order.
      api.get.mockResolvedValue({ data: [duplicate, existingSubscriber], message: 'success' });
      await controller.fetchMySubscriber(mockReq(), second);

      expect(first.body).toEqual(duplicate);
      expect(second.body).toEqual(duplicate);
    });

    it('shares one resolve between concurrent calls instead of creating two subscribers', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValueOnce({ data: [], message: 'success' }).mockResolvedValue({ data: [existingSubscriber], message: 'success' });
      api.post.mockResolvedValue({ data: '', message: 'success' });
      const first = mockRes<Subscriber>();
      const second = mockRes<Subscriber>();

      await Promise.all([controller.fetchMySubscriber(mockReq(), first), controller.fetchMySubscriber(mockReq(), second)]);

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(first.body).toEqual(existingSubscriber);
      expect(second.body).toEqual(existingSubscriber);
    });

    it('reads the subscriber back when create answers without a body', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValueOnce({ data: [], message: 'success' }).mockResolvedValueOnce({ data: [existingSubscriber], message: 'success' });
      api.post.mockResolvedValueOnce({ data: '', message: 'success' });
      const res = mockRes<Subscriber>();

      await controller.fetchMySubscriber(mockReq(), res);

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(res.body).toEqual(existingSubscriber);
    });

    it('uses the ad account of the calling user, not a shared one', async () => {
      const { controller, api } = makeController();
      const res = mockRes<Subscriber>();

      await controller.fetchMySubscriber(mockReq(mockUser({ username: 'xyz99xyz' })), res);

      expect(getUrls(api)[0]).toContain('identifierValue=xyz99xyz');
    });
  });

  describe('updateMySubscriber', () => {
    it('patches the resolved subscriber', async () => {
      const { controller, api } = makeController();
      const res = mockRes<Subscriber>();

      await controller.updateMySubscriber(mockReq(), { pausedFrom: '2026-01-01T00:00:00Z' }, res);

      expect(api.patch).toHaveBeenCalledTimes(1);
      const [config] = api.patch.mock.calls[0];
      expect(config.url).toBe(`${SUBSCRIBERS_URL}/${SUBSCRIBER_ID}`);
      expect(config.data).toEqual({ pausedFrom: '2026-01-01T00:00:00Z' });
    });

    it('stores the chosen channels once each, and always the one in Draken', async () => {
      const { controller, api } = makeController();
      const { EMAIL, INTERNAL, SMS } = NotificationChannelTypeEnum;

      await controller.updateMySubscriber(mockReq(), { channels: [{ type: SMS }, { type: EMAIL }, { type: SMS }] }, mockRes());
      await controller.updateMySubscriber(mockReq(), { channels: [] }, mockRes());

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
