import { IsOptional, IsString } from 'class-validator';
import FormData from 'form-data';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UploadedFiles, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { ErrandAttachmentChannelEnum } from '@/data-contracts/supportmanagement/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import ApiService from '@/services/api.service';
import { fileUploadOptions } from '@/utils/fileUploadOptions';
import { logger } from '@/utils/logger';
import { validateRequestBody } from '@/utils/validate';

interface SupportAttachment {
  id: string;
  fileName: string;
  mimeType: string;
}
interface SingleSupportAttachment {
  errandAttachmentHeader: {
    id: string;
    fileName: string;
    mimeType: string;
  };
  base64EncodedString: string;
}

class SupportAttachmentDto {
  @IsString()
  name!: string;
  @IsOptional()
  files!: Express.Multer.File[];
}

@Controller()
export class SupportAttachmentController {
  private apiService = new ApiService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  private SERVICE = apiServiceName('supportmanagement');

  @Get('/supportattachments/:municipalityId/errands/:id/attachments/:attachmentId')
  @OpenAPI({ summary: 'Get an attachment' })
  @UseBefore(authMiddleware)
  async fetchSingleSupportAttachment(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Param('municipalityId') municipalityId: string,
    @Res() response: any,
  ): Promise<SingleSupportAttachment> {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/attachments/${attachmentId}`;
    const res = await this.apiService.get<ArrayBuffer>({ url, responseType: 'arraybuffer' }, req.user);
    const binaryString = Array.from(new Uint8Array(res.data), v => String.fromCharCode(v)).join('');
    const b64 = Buffer.from(binaryString, 'binary').toString('base64');
    return response.send(b64);
  }

  @Get('/supportattachments/:municipalityId/errands/:id/attachments')
  @OpenAPI({ summary: 'Get attachments for errand' })
  @UseBefore(authMiddleware)
  async fetchSupportAttachments(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Res() response: any,
  ): Promise<SupportAttachment[]> {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/attachments`;
    const res = await this.apiService.get<SupportAttachment[]>({ url }, req.user);
    return response.status(200).send(res.data);
  }

  @Delete('/supportattachments/:municipalityId/errands/:id/attachments/:attachmentId')
  @OpenAPI({ summary: 'Delete attachment for errand' })
  @UseBefore(authMiddleware)
  async deleteSupportAttachment(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: any,
  ): Promise<SupportAttachment[]> {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/attachments/${attachmentId}`;
    const res = await this.apiService.delete({ url }, req.user);
    return response.status(200).send(res.data);
  }

  @Post('/supportattachments/:municipalityId/errands/:id/attachments')
  @HttpCode(201)
  @OpenAPI({ summary: 'Save an attachment to a support errand' })
  @UseBefore(authMiddleware)
  async registerSupportErrand(
    @Req() req: RequestWithUser,
    @UploadedFiles('files', { options: fileUploadOptions, required: false }) files: Express.Multer.File[],
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Body() attachmentDto: Partial<SupportAttachmentDto>,
    @Res() response: any,
  ): Promise<{ data: any; message: string }> {
    await validateRequestBody(SupportAttachmentDto, attachmentDto);
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/attachments`;

    const data = new FormData();
    if (files && files.length > 0) {
      data.append(`errandAttachment`, files[0].buffer, { filename: files[0].originalname });
      data.append('channel', ErrandAttachmentChannelEnum.WEB_UI);
    } else {
      logger.error('Trying to save attachment without name or data');
      throw new Error('File missing');
    }
    const res = await this.apiService
      .post<any, FormData>({ url, data, headers: { 'Content-Type': data.getHeaders()['content-type'] } }, req.user)
      .catch(e => {
        logger.error(`Error when saving attachment on errand ${id}`);
        logger.error(e);
        throw e;
      });
    return response.status(201).send(res.data);
  }
}
