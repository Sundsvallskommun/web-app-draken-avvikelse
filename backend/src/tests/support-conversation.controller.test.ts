import { apiServiceName } from '@/config/api-config';
import { SupportConversationController } from '@/controllers/supportmanagement/support-conversation.controller';
import { ConversationReadByCount, ConversationType, IdentifierTypeEnum } from '@/data-contracts/supportmanagement/data-contracts';
import { apiURL } from '@/utils/util';

import { mockReq } from './helpers/http';
import {
  mockAdUsername,
  mockConversationId,
  mockMunicipalityId,
  mockSupportErrandId,
  mockSupportErrandNumber,
  mockSupportNamespace,
} from './helpers/mock-data';

interface ApiStub {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

const SUPPORT_SERVICE = apiServiceName('supportmanagement');

const makeController = () => {
  const controller = new SupportConversationController();
  const api: ApiStub = {
    get: vi.fn(async () => ({ data: [], message: 'success' })),
    post: vi.fn(async () => ({ data: undefined, message: 'success' })),
  };
  (controller as unknown as { apiService: ApiStub }).apiService = api;
  return { controller, api };
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPPORTMANAGEMENT_NAMESPACE = mockSupportNamespace;
});

describe('SupportConversationController read state', () => {
  it('returns read counts for all conversations without system messages by default', async () => {
    const { controller, api } = makeController();
    const counts: ConversationReadByCount[] = [
      {
        conversationId: mockConversationId,
        messageCount: 3,
        readByPartCount: [{ part: mockSupportErrandNumber, count: 2 }],
      },
    ];
    api.get.mockResolvedValue({ data: counts, message: 'success' });

    const result = await controller.returnConversationReadByCounts(mockReq(), mockSupportErrandId, mockMunicipalityId, undefined);

    expect(api.get).toHaveBeenCalledWith(
      {
        url: `${mockMunicipalityId}/${mockSupportNamespace}/errands/${mockSupportErrandId}/communication/conversations/count-read-by`,
        baseURL: apiURL(SUPPORT_SERVICE),
        params: { includeSystemMessages: false },
      },
      expect.anything(),
    );
    expect(result).toEqual(counts);
  });

  it('forwards the optional conversation filter and preserves an empty result', async () => {
    const { controller, api } = makeController();

    const result = await controller.returnConversationReadByCounts(mockReq(), mockSupportErrandId, mockMunicipalityId, false, mockConversationId);

    expect(api.get).toHaveBeenCalledWith(
      expect.objectContaining({ params: { includeSystemMessages: false, conversationId: mockConversationId } }),
      expect.anything(),
    );
    expect(result).toEqual([]);
  });

  it('marks only the specified messages in the specified conversation as read', async () => {
    const { controller, api } = makeController();
    const request = { messageIds: ['message-1', 'message-2'] };

    await controller.markConversationMessagesAsRead(mockReq(), mockSupportErrandId, mockMunicipalityId, mockConversationId, request);

    expect(api.post).toHaveBeenCalledWith(
      {
        url: `${mockMunicipalityId}/${mockSupportNamespace}/errands/${mockSupportErrandId}/communication/conversations/${mockConversationId}/messages/mark-as-read`,
        baseURL: apiURL(SUPPORT_SERVICE),
        data: request,
        // Reading notifies no one following the errand.
        notifySubscribers: false,
      },
      expect.anything(),
    );
  });

  it('maps conversation viewed state to booleans and treats own messages as viewed', async () => {
    const { controller, api } = makeController();
    api.get
      .mockResolvedValueOnce({
        data: [{ id: mockConversationId, type: ConversationType.INTERNAL }],
        message: 'success',
      })
      .mockResolvedValueOnce({
        data: {
          content: [
            { id: 'unread-message' },
            { id: 'own-message', createdBy: { type: IdentifierTypeEnum.AdAccount, value: mockAdUsername } },
            {
              id: 'read-message',
              readBy: [{ identifier: { type: IdentifierTypeEnum.AdAccount, value: mockAdUsername } }],
            },
          ],
        },
        message: 'success',
      });

    const result = await controller.returnAllMessages(mockReq(), mockSupportErrandId, mockMunicipalityId, mockConversationId);

    expect(result.data).toEqual([
      expect.objectContaining({ messageId: 'unread-message', viewed: false }),
      expect.objectContaining({ messageId: 'own-message', viewed: true }),
      expect.objectContaining({ messageId: 'read-message', viewed: true }),
    ]);
  });
});
