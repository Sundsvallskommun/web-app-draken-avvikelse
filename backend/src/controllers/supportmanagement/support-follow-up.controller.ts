import { Matches } from 'class-validator';
import dayjs from 'dayjs';
import { Controller, Get, Param, QueryParams, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import { SupportFollowUpService, type UnitFollowUpSnapshot } from '@/services/support-follow-up.service';

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export class UnitFollowUpQueryDto {
  /** First registration day included, `YYYY-MM-DD`. */
  @Matches(CALENDAR_DAY)
  from!: string;

  /** Last registration day included, `YYYY-MM-DD`. */
  @Matches(CALENDAR_DAY)
  to!: string;
}

/** The unit follow-up, Verksamhetsuppföljning: the errands and measures of the units the user reaches. */
@Controller()
export class SupportFollowUpController {
  constructor(private readonly followUp = new SupportFollowUpService()) {}

  // Own prefix: under /supporterrands/:municipalityId a segment reads as an errand id.
  @Get('/supportfollowup/:municipalityId/units')
  @OpenAPI({ summary: 'Read the errands registered in a period, with their investigation facts and measures' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(UnitFollowUpQueryDto, 'query'))
  async readUnits(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @QueryParams() query: UnitFollowUpQueryDto,
  ): Promise<UnitFollowUpSnapshot> {
    if (!dayjs(query.from).isValid() || !dayjs(query.to).isValid() || dayjs(query.from).isAfter(dayjs(query.to))) {
      throw new HttpException(400, 'The period must run from a valid day to the same or a later one');
    }
    return this.followUp.read(municipalityId, { from: query.from, to: query.to }, req.user);
  }
}
