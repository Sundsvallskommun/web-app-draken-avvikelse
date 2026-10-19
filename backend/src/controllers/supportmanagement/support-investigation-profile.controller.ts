import { Response } from 'express';
import { Controller, Get, Param, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';

import {
  SupportErrandAccessLevelDto,
  SupportInvestigationErrandAccessDto,
  SupportInvestigationRuntimeProfileDto,
} from '@/dtos/support-investigation-profile.dto';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';

@Controller()
export class SupportInvestigationProfileController {
  constructor(
    private readonly policyService = new SupportInvestigationPolicyService(),
    private readonly accessService = new SupportInvestigationAccessService(),
  ) {}

  @Get('/supportmanagement/investigation-profile')
  @OpenAPI({ summary: 'Get the investigation profile for the current application' })
  @ResponseSchema(SupportInvestigationRuntimeProfileDto)
  @UseBefore(authMiddleware)
  async getInvestigationProfile(): Promise<SupportInvestigationRuntimeProfileDto> {
    return await this.policyService.getRuntimeProfile();
  }

  @Get('/supporterrands/:municipalityId/:errandId/investigation-access')
  @OpenAPI({ summary: 'Get effective investigation document access for the current user and errand' })
  @ResponseSchema(SupportInvestigationErrandAccessDto)
  @UseBefore(authMiddleware)
  async getInvestigationAccess(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Res() response: Response,
  ): Promise<SupportInvestigationErrandAccessDto> {
    response.setHeader('Cache-Control', 'no-store');
    if ((await this.policyService.getState()) === 'unavailable') {
      throw new HttpException(503, 'Investigation access policy is temporarily unavailable');
    }
    const keys = this.policyService.profile.documents.map(document => document.key);
    if (keys.length === 0) return { municipalityId, errandId, documents: [] };
    return this.accessService.getDocumentAccess(req.user, municipalityId, errandId, keys);
  }

  /**
   * The current user's level on the errand itself, so the errand page can tell an errand the user only
   * knows of (LR) from one they may read, before it renders anything that would ask for more.
   */
  @Get('/supporterrands/:municipalityId/:errandId/errand-access')
  @OpenAPI({ summary: "Get the current user's access level to the errand itself" })
  @ResponseSchema(SupportErrandAccessLevelDto)
  @UseBefore(authMiddleware)
  async getErrandAccess(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Res() response: Response,
  ): Promise<SupportErrandAccessLevelDto> {
    response.setHeader('Cache-Control', 'no-store');
    return { level: await this.accessService.getErrandLevel(req.user, municipalityId, errandId) };
  }
}
