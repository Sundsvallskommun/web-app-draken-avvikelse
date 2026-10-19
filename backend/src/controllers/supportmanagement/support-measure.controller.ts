import { Body, Controller, Delete, Get, HeaderParam, OnUndefined, Param, Patch, Post, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import {
  CreateSupportMeasureDto,
  DecideSupportMeasureDto,
  FollowUpSupportMeasureDto,
  PlannedCompleteSupportMeasureDto,
  UpdateSupportMeasureDto,
} from '@/dtos/support-measure.dto';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import { type PlannedSupportMeasuresSnapshot, SupportMeasureService, type SupportMeasuresSnapshot } from '@/services/support-measure.service';

// Write handlers return nothing. routing-controllers turns an undefined result into NotFoundError unless
// @OnUndefined names the status, and that error carries no `status`/message, so it surfaced as an opaque 500.
@Controller()
export class SupportMeasureController {
  private readonly measures = new SupportMeasureService();

  @Get('/supporterrands/:municipalityId/:errandId/measures')
  @OpenAPI({ summary: 'Read protected errand measures with the loaded errand version' })
  @UseBefore(authMiddleware)
  async read(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
  ): Promise<SupportMeasuresSnapshot> {
    return this.measures.read(municipalityId, errandId, req.user);
  }

  // Own prefix: under /supporterrands/:municipalityId a segment reads as an errand id.
  @Get('/supportmeasures/:municipalityId/planned')
  @OpenAPI({ summary: 'Read the open planned measures on every errand the user reaches, with the errand each belongs to' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']))
  async readPlanned(@Req() req: RequestWithUser, @Param('municipalityId') municipalityId: string): Promise<PlannedSupportMeasuresSnapshot> {
    return this.measures.readPlanned(municipalityId, req.user);
  }

  @Post('/supporterrands/:municipalityId/:errandId/measures')
  @OnUndefined(204)
  @OpenAPI({ summary: 'Create an errand measure using Draken registration rules and the authenticated creator' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(CreateSupportMeasureDto, 'body'))
  async create(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Body() data: CreateSupportMeasureDto,
  ) {
    await this.measures.create(municipalityId, errandId, data, req.user);
  }

  @Patch('/supporterrands/:municipalityId/:errandId/measures/:measureId')
  @OnUndefined(204)
  @OpenAPI({ summary: 'Update the basic fields of an errand measure' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(UpdateSupportMeasureDto, 'body'))
  async update(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Param('measureId') measureId: string,
    // Keep the runtime decorator type String; Object would JSON-parse and strip the ETag quotes.
    @HeaderParam('If-Match') ifMatch: string,
    @Body() data: UpdateSupportMeasureDto,
  ) {
    await this.measures.update(municipalityId, errandId, measureId, ifMatch, data, req.user);
  }

  @Delete('/supporterrands/:municipalityId/:errandId/measures/:measureId')
  @OnUndefined(204)
  @OpenAPI({ summary: 'Remove an errand measure its registrar has not carried out, while the errand is investigated' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']))
  async remove(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Param('measureId') measureId: string,
    // Keep the runtime decorator type String; Object would JSON-parse and strip the ETag quotes.
    @HeaderParam('If-Match') ifMatch: string,
  ) {
    await this.measures.remove(municipalityId, errandId, measureId, ifMatch, req.user);
  }

  @Patch('/supporterrands/:municipalityId/:errandId/measures/:measureId/decision')
  @OnUndefined(204)
  @OpenAPI({ summary: 'Decide a pending measure proposal using the authenticated decision role and measure version' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(DecideSupportMeasureDto, 'body'))
  async decide(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Param('measureId') measureId: string,
    @HeaderParam('If-Match') ifMatch: string,
    @Body() data: DecideSupportMeasureDto,
  ) {
    await this.measures.decide(municipalityId, errandId, measureId, ifMatch, data, req.user);
  }

  @Patch('/supporterrands/:municipalityId/:errandId/measures/:measureId/planned-complete')
  @OnUndefined(204)
  @OpenAPI({ summary: 'Move the end date of a planned approved measure, from the follow-up; its start date stays as decided' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(PlannedCompleteSupportMeasureDto, 'body'))
  async changePlannedComplete(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Param('measureId') measureId: string,
    @HeaderParam('If-Match') ifMatch: string,
    @Body() data: PlannedCompleteSupportMeasureDto,
  ) {
    await this.measures.changePlannedComplete(municipalityId, errandId, measureId, ifMatch, data, req.user);
  }

  @Patch('/supporterrands/:municipalityId/:errandId/measures/:measureId/follow-up')
  @OnUndefined(204)
  @OpenAPI({ summary: 'Complete a planned approved measure and record its follow-up without changing its details' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(FollowUpSupportMeasureDto, 'body'))
  async followUp(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Param('measureId') measureId: string,
    @HeaderParam('If-Match') ifMatch: string,
    @Body() data: FollowUpSupportMeasureDto,
  ) {
    await this.measures.followUp(municipalityId, errandId, measureId, ifMatch, data, req.user);
  }
}
