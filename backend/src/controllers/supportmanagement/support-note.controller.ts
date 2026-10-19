import { IsOptional, IsString } from 'class-validator';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import type { Errand, ErrandNote } from '@/data-contracts/supportmanagement/data-contracts';
import { CreateSupportServiceNoteDto } from '@/dtos/support-note.dto';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import ApiService from '@/services/api.service';
import {
  assertCanWriteSupportServiceNote,
  assertSupportNoteIsChangeable,
  buildSupportServiceNote,
  SUPPORT_COMMENT,
  SUPPORT_SERVICE_NOTE,
} from '@/services/support-note.service';
import { logger } from '@/utils/logger';

interface SupportNote {
  context: string;
  role: string;
  partyId?: string;
  subject: string;
  body: string;
  createdBy: string;
}

class SupportNoteDto {
  @IsString()
  @IsOptional()
  context!: string;
  @IsString()
  @IsOptional()
  role!: string;
  @IsString()
  @IsOptional()
  partyId?: string;
  @IsString()
  @IsOptional()
  subject!: string;
  @IsString()
  body!: string;
}

class SupportNoteUpdateDto {
  @IsString()
  @IsOptional()
  modifiedBy?: string;
  @IsOptional()
  @IsString()
  subject?: string;
  @IsString()
  body!: string;
}

interface SupportNoteResponse {
  id: string;
  context: string;
  role: string;
  clientId: string;
  partyId: string;
  subject: string;
  body: string;
  caseId: string;
  createdBy: string;
  created: string;
}

export interface SupportNoteData {
  notes: SupportNoteResponse[];
  _meta: {
    page: 1;
    limit: 100;
    count: 1;
    totalRecords: 1;
    totalPages: 1;
  };
}

@Controller()
@UseBefore(hasPermissions(['canEditSupportManagement']))
export class SupportNoteController {
  private apiService = new ApiService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  private SERVICE = apiServiceName('supportmanagement');

  private errandUrl(municipalityId: string, errandId: string): string {
    return `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${errandId}`;
  }

  private listNotes(req: RequestWithUser, municipalityId: string, errandId: string, filter: Record<string, string>) {
    const queryString = new URLSearchParams({ ...filter, page: '1', limit: '100' }).toString();
    return this.apiService.get<SupportNoteData>({ url: `${this.errandUrl(municipalityId, errandId)}/notes?${queryString}` }, req.user);
  }

  /** The note as stored, so a change can be refused for what the note is rather than for what the request claims. */
  private async readNote(req: RequestWithUser, municipalityId: string, errandId: string, noteId: string): Promise<ErrandNote> {
    const url = `${this.errandUrl(municipalityId, errandId)}/notes/${noteId}`;
    return (await this.apiService.get<ErrandNote>({ url, propagateClientError: true, mapUnauthorizedToForbidden: true }, req.user)).data;
  }

  @Get('/supportnotes/:municipalityId/:id')
  @OpenAPI({ summary: 'Get notes for errand' })
  @UseBefore(authMiddleware)
  async fetchSupportNotes(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Res() response: any,
  ): Promise<SupportNoteData> {
    const res = await this.listNotes(req, municipalityId, id, { context: SUPPORT_COMMENT.context, role: SUPPORT_COMMENT.role });
    return response.status(200).send(res.data);
  }

  @Get('/supportnotes/:municipalityId/:id/service-notes')
  @OpenAPI({ summary: 'Get service notes for errand' })
  @UseBefore(authMiddleware)
  async fetchSupportServiceNotes(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Res() response: any,
  ): Promise<SupportNoteData> {
    const res = await this.listNotes(req, municipalityId, id, { context: SUPPORT_SERVICE_NOTE.context });
    return response.status(200).send(res.data);
  }

  @Post('/supportnotes/:municipalityId/:id')
  @HttpCode(201)
  @OpenAPI({ summary: 'Create a support note' })
  @UseBefore(authMiddleware, validationMiddleware(SupportNoteDto, 'body'))
  async createSupportNote(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Body() noteDto: Partial<SupportNoteDto>,
    @Res() response: any,
  ): Promise<{ data: any; message: string }> {
    const url = `${this.errandUrl(municipalityId, id)}/notes`;
    let data: SupportNote;
    if (noteDto.body) {
      data = {
        context: SUPPORT_COMMENT.context,
        role: SUPPORT_COMMENT.role,
        ...(noteDto.partyId && { partyId: noteDto.partyId }),
        subject: SUPPORT_COMMENT.subject,
        body: noteDto.body,
        createdBy: req.user.name,
      };
    } else {
      logger.error('Trying to save note without body');
      throw new Error('Note body missing');
    }
    const res = await this.apiService.post<any, SupportNoteDto>({ url, data }, req.user).catch(e => {
      logger.error('Error when creating note');
      logger.error(e);
      throw e;
    });
    return response.status(201).send(res.data);
  }

  @Post('/supportnotes/:municipalityId/:id/service-notes')
  @HttpCode(201)
  @OpenAPI({ summary: 'Create a service note as the errand handler' })
  @UseBefore(authMiddleware, validationMiddleware(CreateSupportServiceNoteDto, 'body'))
  async createSupportServiceNote(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Body() noteDto: CreateSupportServiceNoteDto,
    @Res() response: any,
  ): Promise<{ data: any; message: string }> {
    const errandUrl = this.errandUrl(municipalityId, id);
    const errand = await this.apiService.get<Errand>({ url: errandUrl, propagateClientError: true, mapUnauthorizedToForbidden: true }, req.user);
    assertCanWriteSupportServiceNote(errand.data, req.user);
    const data: SupportNote = buildSupportServiceNote(noteDto.body, req.user, noteDto.partyId);
    const res = await this.apiService
      .post<any, SupportNote>({ url: `${errandUrl}/notes`, data, propagateClientError: true, mapUnauthorizedToForbidden: true }, req.user)
      .catch(e => {
        logger.error('Error when creating service note');
        logger.error(e);
        throw e;
      });
    return response.status(201).send(res.data);
  }

  @Patch('/supportnotes/:municipalityId/:errandId/notes/:noteId')
  @HttpCode(201)
  @OpenAPI({ summary: 'Update a support note' })
  @UseBefore(authMiddleware, validationMiddleware(SupportNoteUpdateDto, 'body'))
  async updateSupportNote(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Param('noteId') noteId: string,
    @Body() noteDto: Partial<SupportNoteUpdateDto>,
    @Res() response: any,
  ): Promise<{ data: any; message: string }> {
    const url = `${this.errandUrl(municipalityId, errandId)}/notes/${noteId}`;
    let data: SupportNoteUpdateDto;
    if (noteDto.body) {
      data = {
        modifiedBy: req.user.name,
        subject: 'Anteckning',
        body: noteDto.body,
      };
    } else {
      logger.error('Trying to save note without body');
      throw new Error('Note body missing');
    }
    assertSupportNoteIsChangeable(await this.readNote(req, municipalityId, errandId, noteId), 'ändras');
    const res = await this.apiService.patch<any, SupportNoteUpdateDto>({ url, data }, req.user).catch(e => {
      logger.error('Error when updaiing note');
      logger.error(e);
      throw e;
    });
    return response.status(200).send(res.data);
  }

  @Delete('/supportnotes/:municipalityId/:errandId/notes/:noteId')
  @OpenAPI({ summary: 'Get notes for errand' })
  @UseBefore(authMiddleware)
  async deleteSupportNote(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Param('noteId') noteId: string,
    @Res() response: any,
  ): Promise<SupportNoteData> {
    assertSupportNoteIsChangeable(await this.readNote(req, municipalityId, errandId, noteId), 'tas bort');
    const url = `${this.errandUrl(municipalityId, errandId)}/notes/${noteId}`;
    const res = await this.apiService.delete<SupportNoteData>({ url }, req.user);
    return response.status(204).send(res.data);
  }
}
