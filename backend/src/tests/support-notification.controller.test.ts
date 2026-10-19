import { apiServiceName } from '@/config/api-config';
import {
  AcknowledgeResultDto,
  SupportNotificationController,
  SupportNotificationDto,
} from '@/controllers/supportmanagement/support-notification.controller';
import { SubscriberNotification, SubscriberNotificationEvent } from '@/data-contracts/supportmanagement/data-contracts';

import { mockReq, mockRes } from './helpers/http';
import { mockAdUsername, mockMunicipalityId, mockSupportErrandId, mockSupportErrandNumber, mockSupportNamespace } from './helpers/mock-data';

const SERVICE = apiServiceName('supportmanagement');
const MUNICIPALITY_ID = mockMunicipalityId;
const NAMESPACE = mockSupportNamespace;

const NOTIFICATIONS_URL = `${SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/notifications`;
const LIST_URL = `${NOTIFICATIONS_URL}/adAccount/${mockAdUsername}`;

interface ApiStub {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

const event = (overrides: Partial<SubscriberNotificationEvent> = {}): SubscriberNotificationEvent => ({
  created: '2026-08-17T10:00:00.000+02:00',
  eventType: 'UPDATE',
  subType: 'MESSAGE',
  description: 'Meddelande mottaget',
  ...overrides,
});

const notification = (overrides: Partial<SubscriberNotification> = {}): SubscriberNotification => ({
  id: 'notification-1',
  created: '2026-08-17T10:00:00.000+02:00',
  errandId: mockSupportErrandId,
  errandNumber: mockSupportErrandNumber,
  events: [event()],
  ...overrides,
});

const makeController = (content: SubscriberNotification[] = [notification()]) => {
  const controller = new SupportNotificationController();
  const api: ApiStub = {
    get: vi.fn(async () => ({ data: { content }, message: 'success' })),
    put: vi.fn(async () => ({ data: {}, message: 'success' })),
  };
  (controller as unknown as { apiService: ApiStub }).apiService = api;
  return { controller, api };
};

/** A controller whose upstream answers the user's notifications in pages, as Support Management pages them. */
const makePagedController = (pages: SubscriberNotification[][]) => {
  const { controller, api } = makeController();
  api.get.mockImplementation(async (config: { url: string }) => {
    const page = Number(new URL(config.url, 'http://upstream').searchParams.get('page'));
    return { data: { content: pages[page] ?? [], totalPages: pages.length, number: page }, message: 'success' };
  });
  return { controller, api };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SupportNotificationController', () => {
  describe('getSupportNotifications', () => {
    it('reads the notifications of the logged in ad account', async () => {
      const { controller, api } = makeController();
      const res = mockRes<SupportNotificationDto[]>();

      await controller.getSupportNotifications(mockReq(), MUNICIPALITY_ID, undefined as any, undefined as any, res);

      expect(api.get.mock.calls[0][0].url).toBe(`${LIST_URL}?page=0&size=100&sort=created%2Cdesc`);
    });

    // Acknowledged notifications stay until they expire, so a user's list outgrows one page.
    it('reads every page when no page is asked for', async () => {
      const { controller, api } = makePagedController([
        [notification({ id: 'newest' })],
        [notification({ id: 'older', errandId: 'another-errand' })],
      ]);
      const res = mockRes<SupportNotificationDto[]>();

      await controller.getSupportNotifications(mockReq(), MUNICIPALITY_ID, undefined as any, undefined as any, res);

      expect(api.get.mock.calls.map(([config]) => new URL(config.url, 'http://upstream').searchParams.get('page'))).toEqual(['0', '1']);
      expect(res.body?.map(item => item.id)).toEqual(['newest', 'older']);
    });

    it('keeps a notification once that moves to the next page while the pages are read', async () => {
      const { controller } = makePagedController([[notification({ id: 'a' }), notification({ id: 'b' })], [notification({ id: 'b' })]]);
      const res = mockRes<SupportNotificationDto[]>();

      await controller.getSupportNotifications(mockReq(), MUNICIPALITY_ID, undefined as any, undefined as any, res);

      expect(res.body?.map(item => item.id)).toEqual(['a', 'b']);
    });

    it('passes paging through to upstream', async () => {
      const { controller, api } = makeController();
      const res = mockRes<SupportNotificationDto[]>();

      await controller.getSupportNotifications(mockReq(), MUNICIPALITY_ID, 2, 25, res);

      expect(api.get.mock.calls[0][0].url).toContain('page=2&size=25');
    });

    it('maps upstream notifications to the frontend shape', async () => {
      const { controller } = makeController();
      const res = mockRes<SupportNotificationDto[]>();

      await controller.getSupportNotifications(mockReq(), MUNICIPALITY_ID, undefined as any, undefined as any, res);

      expect(res.body).toEqual([
        {
          id: 'notification-1',
          created: '2026-08-17T10:00:00.000+02:00',
          acknowledged: undefined,
          errandId: mockSupportErrandId,
          errandNumber: mockSupportErrandNumber,
          events: [
            {
              created: '2026-08-17T10:00:00.000+02:00',
              eventType: 'UPDATE',
              subType: 'MESSAGE',
              description: 'Meddelande mottaget',
            },
          ],
        },
      ]);
    });

    it('sorts the events of a notification newest first', async () => {
      const { controller } = makeController([
        notification({
          events: [
            event({ created: '2026-08-17T10:00:00.000+02:00', description: 'äldst' }),
            event({ created: '2026-08-17T12:00:00.000+02:00', description: 'nyast' }),
            event({ created: '2026-08-17T11:00:00.000+02:00', description: 'mitten' }),
          ],
        }),
      ]);
      const res = mockRes<SupportNotificationDto[]>();

      await controller.getSupportNotifications(mockReq(), MUNICIPALITY_ID, undefined as any, undefined as any, res);

      expect(res.body?.[0].events.map(e => e.description)).toEqual(['nyast', 'mitten', 'äldst']);
    });

    it('maps a notification without events to an empty list rather than undefined', async () => {
      const { controller } = makeController([notification({ events: undefined })]);
      const res = mockRes<SupportNotificationDto[]>();

      await controller.getSupportNotifications(mockReq(), MUNICIPALITY_ID, undefined as any, undefined as any, res);

      expect(res.body?.[0].events).toEqual([]);
    });

    it('returns an empty list when upstream has no page content', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValueOnce({ data: {}, message: 'success' });
      const res = mockRes<SupportNotificationDto[]>();

      await controller.getSupportNotifications(mockReq(), MUNICIPALITY_ID, undefined as any, undefined as any, res);

      expect(res.body).toEqual([]);
    });
  });

  describe('acknowledgeSupportNotifications', () => {
    it('acknowledges every id and ties the calls together with one request group id', async () => {
      const { controller, api } = makeController();
      const res = mockRes<AcknowledgeResultDto>();

      await controller.acknowledgeSupportNotifications(mockReq(), MUNICIPALITY_ID, { ids: ['a', 'b'] }, res);

      expect(api.put).toHaveBeenCalledTimes(2);
      const urls = api.put.mock.calls.map(call => call[0].url);
      expect(urls).toEqual([`${NOTIFICATIONS_URL}/a/acknowledge`, `${NOTIFICATIONS_URL}/b/acknowledge`]);

      const groupIds = api.put.mock.calls.map(call => call[0].headers['X-Request-Group-Id']);
      expect(groupIds[0]).toBeTruthy();
      expect(new Set(groupIds).size).toBe(1);
      expect(res.body).toEqual({ acknowledged: ['a', 'b'], failed: [] });
    });

    it('keeps the successful acknowledgements when one of them fails', async () => {
      const { controller, api } = makeController();
      api.put.mockResolvedValueOnce({ data: {}, message: 'success' }).mockRejectedValueOnce(new Error('upstream exploded'));
      const res = mockRes<AcknowledgeResultDto>();

      await controller.acknowledgeSupportNotifications(mockReq(), MUNICIPALITY_ID, { ids: ['a', 'b'] }, res);

      expect(res.body).toEqual({ acknowledged: ['a'], failed: ['b'] });
    });
  });

  describe('acknowledgeAllForErrand', () => {
    it('only acknowledges unacknowledged notifications for the given errand', async () => {
      const { controller, api } = makeController([
        notification({ id: 'a', errandId: mockSupportErrandId }),
        notification({ id: 'b', errandId: 'another-errand' }),
        notification({ id: 'c', errandId: mockSupportErrandId, acknowledged: '2026-08-17T11:00:00.000+02:00' }),
      ]);
      const res = mockRes<AcknowledgeResultDto>();

      await controller.acknowledgeAllForErrand(mockReq(), MUNICIPALITY_ID, mockSupportErrandId, res);

      expect(api.put).toHaveBeenCalledTimes(1);
      expect(api.put.mock.calls[0][0].url).toBe(`${NOTIFICATIONS_URL}/a/acknowledge`);
      expect(res.body).toEqual({ acknowledged: ['a'], failed: [] });
    });

    it("acknowledges the errand's notification on a later page", async () => {
      const { controller, api } = makePagedController([
        [notification({ id: 'other', errandId: 'another-errand' })],
        [notification({ id: 'target', errandId: mockSupportErrandId })],
      ]);
      const res = mockRes<AcknowledgeResultDto>();

      await controller.acknowledgeAllForErrand(mockReq(), MUNICIPALITY_ID, mockSupportErrandId, res);

      expect(api.put.mock.calls.map(([config]) => config.url)).toEqual([`${NOTIFICATIONS_URL}/target/acknowledge`]);
      expect(res.body).toEqual({ acknowledged: ['target'], failed: [] });
      // Every page is read before anything is acknowledged, so an acknowledgement cannot shift the pages being read.
      expect(api.get.mock.invocationCallOrder.at(-1)).toBeLessThan(api.put.mock.invocationCallOrder[0]);
    });

    it('does not call upstream when the errand has nothing to acknowledge', async () => {
      const { controller, api } = makeController([notification({ id: 'a', errandId: 'another-errand' })]);
      const res = mockRes<AcknowledgeResultDto>();

      await controller.acknowledgeAllForErrand(mockReq(), MUNICIPALITY_ID, mockSupportErrandId, res);

      expect(api.put).not.toHaveBeenCalled();
      expect(res.body).toEqual({ acknowledged: [], failed: [] });
    });
  });
});
