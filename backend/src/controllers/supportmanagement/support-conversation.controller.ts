import { RequestWithUser } from '@interfaces/auth.interface';
import authMiddleware from '@middlewares/auth.middleware';
import ApiService from '@services/api.service';
import { Body, Controller, Get, HttpCode, Param, Post, QueryParam, Req, UploadedFiles, UseBefore } from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';

import { apiServiceName } from '@/config/api-config';
import { PortalPersonData } from '@/data-contracts/employee/data-contracts';
import {
  Conversation,
  ConversationReadByCount,
  ConversationType,
  MarkAsReadRequest,
  PageMessage,
} from '@/data-contracts/supportmanagement/data-contracts';
import { ConversationReadByCountDto, MarkConversationMessagesAsReadDto } from '@/dtos/support-conversation.dto';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import { fileUploadOptions } from '@/utils/fileUploadOptions';
import { apiURL } from '@/utils/util';

interface ResponseData {
  data: any;
  message: string;
}

@Controller()
export class SupportConversationController {
  private apiService = new ApiService();
  SERVICE = apiServiceName('supportmanagement');
  CITIZEN_SERVICE = apiServiceName('citizen');
  EMPLOYEE_SERVICE = apiServiceName('employee');

  @Get('/supportmanagement/:municipalityId/namespace/errands/:errandId/communication/conversations')
  @OpenAPI({ summary: 'Return all conversations by errandId' })
  @UseBefore(authMiddleware)
  async returnAllConversations(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('municipalityId') municipalityId: string,
  ): Promise<ResponseData> {
    const url = `${municipalityId}/${process.env.SUPPORTMANAGEMENT_NAMESPACE}/errands/${errandId}/communication/conversations`;
    const baseURL = apiURL(this.SERVICE);
    const res = await this.apiService.get<Conversation[]>({ url, baseURL }, req.user);
    return { data: res, message: 'success' } as ResponseData;
  }

  @Get('/supportmanagement/:municipalityId/namespace/errands/:errandId/communication/conversations/count-read-by')
  @OpenAPI({ summary: 'Return read statistics for every conversation connected to an errand' })
  @ResponseSchema(ConversationReadByCountDto, { isArray: true })
  @UseBefore(authMiddleware)
  async returnConversationReadByCounts(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('municipalityId') municipalityId: string,
    @QueryParam('includeSystemMessages') includeSystemMessages = false,
    @QueryParam('conversationId') conversationId?: string,
  ): Promise<ConversationReadByCount[]> {
    const url = `${municipalityId}/${process.env.SUPPORTMANAGEMENT_NAMESPACE}/errands/${errandId}/communication/conversations/count-read-by`;
    const baseURL = apiURL(this.SERVICE);
    const params = {
      includeSystemMessages,
      ...(conversationId ? { conversationId } : {}),
    };
    const response = await this.apiService.get<ConversationReadByCount[]>({ url, baseURL, params }, req.user);
    return response.data;
  }

  @Get('/supportmanagement/:municipalityId/namespace/errands/:errandId/communication/conversations/:conversationId/messages')
  @OpenAPI({ summary: 'Return all conversations by errandId' })
  @UseBefore(authMiddleware)
  async returnAllMessages(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('municipalityId') municipalityId: string,
    @Param('conversationId') conversationId: string,
  ): Promise<ResponseData> {
    const baseURL = apiURL(this.SERVICE);
    let url = `${municipalityId}/${process.env.SUPPORTMANAGEMENT_NAMESPACE}/errands/${errandId}/communication/conversations`;
    const resConversation = await this.apiService.get<Conversation[]>({ url, baseURL }, req.user);

    const conversation = resConversation.data.find(item => item.id === conversationId);
    const topic = conversation ? conversation.topic : undefined;
    const communicationType = conversation?.type === ConversationType.INTERNAL ? 'DRAKEN' : 'MINASIDOR';

    url = `${municipalityId}/${process.env.SUPPORTMANAGEMENT_NAMESPACE}/errands/${errandId}/communication/conversations/${conversationId}/messages`;
    const resPageMessage = await this.apiService.get<PageMessage>({ url, baseURL }, req.user);

    const mappedMessages = await Promise.all(
      resPageMessage.data?.content?.map(async msg => {
        if (msg.type === 'SYSTEM_CREATED') return;
        let sender = undefined;
        let direction = undefined;
        let viewed = false;

        const isReadByCurrentUser = Array.isArray(msg.readBy) && msg.readBy.some(reader => reader.identifier?.value === req.user.username);
        if (isReadByCurrentUser) {
          viewed = true;
        }

        if (msg?.createdBy?.type === 'adAccount') {
          if (msg?.createdBy?.value === req.user.username) {
            sender = req.user.firstName + ' ' + req.user.lastName;
            direction = 'OUTBOUND';
            viewed = true;
          } else {
            const adAccountUrl = `${this.EMPLOYEE_SERVICE}/${municipalityId}/portalpersondata/PERSONAL/${msg?.createdBy?.value}`;
            const res = await this.apiService.get<PortalPersonData>({ url: adAccountUrl }, req.user);
            sender = res.data.givenname + ' ' + res.data.lastname;
            direction = 'INBOUND';
          }
        }

        if (msg?.createdBy?.type === 'partyId') {
          const adAccountUrl = `${this.CITIZEN_SERVICE}/${municipalityId}/${msg?.createdBy?.value}`;
          const res = await this.apiService.get<any>({ url: adAccountUrl }, req.user);
          sender = res.data.givenname + ' ' + res.data.lastname;
          direction = 'INBOUND';
        }

        return {
          conversationId: conversationId,
          communicationID: conversationId,
          messageId: msg?.id,
          sent: msg?.created,
          messageBody: msg?.content,
          communicationAttachments: Array.isArray(msg?.attachments)
            ? msg.attachments.map((att: any) => ({
                id: att?.id,
                fileName: att?.fileName,
                mimeType: att?.mimeType,
              }))
            : [],
          communicationType: communicationType,
          subject: topic,
          sender,
          direction,
          viewed,
        };
      }) ?? [],
    );

    return { data: mappedMessages, message: 'success' } as ResponseData;
  }

  @Post('/supportmanagement/:municipalityId/namespace/errands/:errandId/communication/conversations/:conversationId/messages/mark-as-read')
  @HttpCode(204)
  @OpenAPI({ summary: 'Mark specified messages as read for the errand' })
  @UseBefore(authMiddleware, validationMiddleware(MarkConversationMessagesAsReadDto, 'body'))
  async markConversationMessagesAsRead(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('municipalityId') municipalityId: string,
    @Param('conversationId') conversationId: string,
    @Body() request: MarkConversationMessagesAsReadDto,
  ): Promise<void> {
    const url = `${municipalityId}/${process.env.SUPPORTMANAGEMENT_NAMESPACE}/errands/${errandId}/communication/conversations/${conversationId}/messages/mark-as-read`;
    const baseURL = apiURL(this.SERVICE);
    // Reading is not news to anyone following the errand.
    await this.apiService.post<void, MarkAsReadRequest>({ url, baseURL, data: request, notifySubscribers: false }, req.user);
  }

  @Post('/supportmanagement/:municipalityId/namespace/errand/:errandId/communication/conversations')
  @OpenAPI({ summary: 'Create new conversation' })
  @UseBefore(authMiddleware)
  async createConversation(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('municipalityId') municipalityId: string,
    @Body() conversation: Conversation,
  ): Promise<{ data: any; message: string }> {
    const url = `${municipalityId}/${process.env.SUPPORTMANAGEMENT_NAMESPACE}/errands/${errandId}/communication/conversations`;
    const baseURL = apiURL(this.SERVICE);
    const response = await this.apiService.post<any, any>({ url, baseURL, data: conversation }, req.user).catch(e => {
      console.error('Something went wrong when creating conversation: ' + e);
      throw e;
    });
    return { data: response.data, message: `Conversation created` };
  }

  @Post('/supportmanagement/:municipalityId/namespace/errand/:errandId/communication/conversations/:conversationId/messages')
  @OpenAPI({ summary: 'Create new message' })
  @UseBefore(authMiddleware)
  async sendInternalMessage(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('municipalityId') municipalityId: string,
    @Param('conversationId') conversationId: string,
    @UploadedFiles('attachments', { options: fileUploadOptions, required: false }) files: Express.Multer.File[],
    @Body() body: any,
  ): Promise<{ data: any; message: string }> {
    const formData = new FormData();
    formData.append('message', body.message);

    if (files && files.length > 0) {
      files.forEach(file => {
        formData.append('attachments', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname);
      });
    }

    const attachments = (files || []).map(file => file.buffer);

    const url = `${municipalityId}/${process.env.SUPPORTMANAGEMENT_NAMESPACE}/errands/${errandId}/communication/conversations/${conversationId}/messages`;
    const baseURL = apiURL(this.SERVICE);

    const response = await this.apiService
      .post<any, any>({ url, baseURL, data: formData, headers: { 'Content-Type': 'multipart/form-data' } }, req.user)
      .catch(e => {
        console.error('Error', e);
      });

    return { data: { response, attachments }, message: 'Message created' };
  }

  @Get(
    '/supportmanagement/:municipalityId/:namespace/errands/:errandId/communication/conversations/:conversationId/messages/:messageId/attachments/:attachmentId',
  )
  @OpenAPI({ summary: 'Get an attachment' })
  @UseBefore(authMiddleware)
  async getAttachment(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('municipalityId') municipalityId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<{ data: any; message: string }> {
    const url = `${municipalityId}/${process.env.SUPPORTMANAGEMENT_NAMESPACE}/errands/${errandId}/communication/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`;
    const baseURL = apiURL(this.SERVICE);
    const response = await this.apiService.get<any>({ url, baseURL, responseType: 'arraybuffer' }, req.user).catch(e => {
      console.error('Something went wrong when getting conversation attachment: ' + e);
      throw e;
    });
    const binaryString = Array.from(new Uint8Array(response.data), v => String.fromCharCode(v)).join('');
    const b64 = Buffer.from(binaryString, 'binary').toString('base64');
    return { data: b64, message: `Success` };
  }
}
