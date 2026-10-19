import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res, UploadedFiles, UseBefore } from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE, SUPPORTMANAGEMENT_SENDER_EMAIL, SUPPORTMANAGEMENT_SENDER_SMS } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { Communication, EmailRequest, SmsRequest, WebMessageRequest } from '@/data-contracts/supportmanagement/data-contracts';
import { CCommunication, generateMessageId, SupportMessageDto } from '@/dtos/support-message.dto';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import ApiService from '@/services/api.service';
import { validateSupportAction } from '@/services/support-errand.service';
import { fileUploadOptions } from '@/utils/fileUploadOptions';
import { logger } from '@/utils/logger';
import { validateRequestBody } from '@/utils/validate';

interface ResponseData {
  data: any;
  message: string;
}

@Controller()
export class SupportMessageController {
  private apiService = new ApiService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  private SERVICE = apiServiceName('supportmanagement');

  @Post('/supportmessage/:municipalityId/:id')
  @HttpCode(201)
  @OpenAPI({ summary: 'Send a support message' })
  @UseBefore(authMiddleware)
  // @UseBefore(authMiddleware, validationMiddleware(SupportMessageDto, 'body'))
  async sendSupportMessage(
    @Req() req: RequestWithUser,
    @UploadedFiles('files', { options: fileUploadOptions, required: false }) files: Express.Multer.File[],
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Body() messageDto: SupportMessageDto,
    @Res() response: any,
  ): Promise<{ data: any; message: string }> {
    const allowed = await validateSupportAction(municipalityId, id.toString(), req.user);
    if (!allowed) {
      throw new HttpException(403, 'Forbidden');
    }
    if (!municipalityId) {
      console.error('No municipality id found, needed to send message.');
      logger.error('No municipality id found, needed to send message.');
      return response.status(400).send('Municipality id missing');
    }
    await validateRequestBody(SupportMessageDto, messageDto);
    let url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/communication`;
    let body: SmsRequest | EmailRequest | WebMessageRequest;
    const MESSAGE_ID = generateMessageId();
    const emailHeaders = {
      MESSAGE_ID: [MESSAGE_ID],
      ...(messageDto.reply_to !== '' && { IN_REPLY_TO: [messageDto.reply_to] }),
      ...(messageDto.references !== '' && { REFERENCES: messageDto.references.split(',') }),
    };
    if (messageDto.contactMeans === 'email') {
      url += '/email';
      body = {
        sender: SUPPORTMANAGEMENT_SENDER_EMAIL,
        recipient: messageDto.recipientEmail,
        message: messageDto.plaintextMessage,
        htmlMessage: messageDto.htmlMessage,
        senderName: messageDto.senderName,
        subject: messageDto.subject,
        attachments: files.map(file => ({
          fileName: file.originalname,
          base64EncodedString: file.buffer.toString('base64'),
        })),
        emailHeaders,
        attachmentIds: messageDto.attachmentIds || [],
      } as EmailRequest;
    } else if (messageDto.contactMeans === 'sms') {
      url += '/sms';
      body = {
        sender: SUPPORTMANAGEMENT_SENDER_SMS,
        recipient: messageDto.recipientPhone,
        message: messageDto.plaintextMessage,
      } as SmsRequest;
    } else if (messageDto.contactMeans === 'webmessage') {
      url += '/webmessage';
      const requestBody: WebMessageRequest = {
        message: messageDto.plaintextMessage,
        attachments: files.map(file => ({
          fileName: file.originalname,
          base64EncodedString: file.buffer.toString('base64'),
        })),
        attachmentIds: messageDto.attachmentIds || [],
      } as WebMessageRequest;
      body = requestBody;
    } else {
      logger.error('Trying to send message without means of contact specified');
      throw new Error('Means of contact missing, but be email or sms');
    }

    const res = await this.apiService
      .post<any, Partial<SmsRequest | EmailRequest | WebMessageRequest>>({ url, data: body }, req.user)
      .then(async res => {
        return res.data;
      })
      .catch(e => {
        logger.error('Error when sending support message');
        logger.error(e);
        throw e;
      });
    return response.status(200).send(res.data);
  }

  @Get('/supportmessage/:municipalityId/errands/:id/communication')
  @OpenAPI({ summary: 'Get errand messages' })
  @UseBefore(authMiddleware)
  @ResponseSchema(CCommunication)
  async fetchSupportMessages(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Res() response: any,
  ): Promise<Communication[]> {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/communication`;
    const res = await this.apiService.get<Communication[]>({ url }, req.user);
    return response.status(200).send(res.data);
  }

  @Put('/supportmessage/:municipalityId/errands/:id/communication/:communicationID/viewed/:isViewed')
  @OpenAPI({ summary: 'Set viewed status' })
  @UseBefore(authMiddleware)
  async setMessageViewedStatus(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Param('communicationID') communicationID: string,
    @Param('isViewed') isViewed: boolean,
    @Res() _response: Communication[],
  ): Promise<{ data: Communication[]; message: string }> {
    const allowed = await validateSupportAction(municipalityId, id.toString(), req.user);
    if (!allowed) {
      throw new HttpException(403, 'Forbidden');
    }
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/communication/${communicationID}/viewed/${isViewed}`;
    // Reading is not news to anyone following the errand.
    const res = await this.apiService.put<any, any>({ url, notifySubscribers: false }, req.user);
    return { data: res.data, message: 'success' };
  }

  @Get('/supportmessage/:municipalityId/errand/:errandId/communication/:communicationID/attachments/:attachmentId')
  @OpenAPI({ summary: 'Return attachment for a message by errand id and message id' })
  @UseBefore(authMiddleware)
  async fetchMessageAttachments(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Param('communicationID') communicationID: string,
    @Param('attachmentId') attachmentId: string,
    @Res() _response: any,
  ): Promise<ResponseData> {
    if (!errandId) {
      throw Error('ErrandId not found');
    }
    if (!communicationID) {
      throw Error('communicationID not found');
    }
    if (!attachmentId) {
      throw Error('AttachmentId not found');
    }

    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${errandId}/communication/${communicationID}/attachments/${attachmentId}`;

    const res = await this.apiService.get<ArrayBuffer>({ url, responseType: 'arraybuffer' }, req.user).catch(e => {
      logger.error('Something went wrong when fetching attachment for message');
      logger.error(e);
      throw e;
    });

    const binaryString = Array.from(new Uint8Array(res.data), v => String.fromCharCode(v)).join('');
    const b64 = Buffer.from(binaryString, 'binary').toString('base64');
    return { data: b64, message: 'ok' };
  }
}
