import { logger } from '@utils/logger';
import { Response } from 'express';
import { Controller, Param, Post, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { trimSupportManagementPath } from '@/config/supportmanagement-path';
import type { Errand, ErrandAttachment, Measure, MetadataResponse } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import ApiService from '@/services/api.service';
import { HandlerDirectoryService } from '@/services/handler-directory.service';
import {
  buildMeasureActionPlanModel,
  formatActionPlanTimestamp,
  measureActionPlanFileName,
  nextMeasureActionPlanSequence,
} from '@/services/measure-action-plan.service';
import { MEASURE_ACTION_PLAN_TEMPLATE } from '@/services/measure-action-plan.template';
import { assertSupportErrandWritable } from '@/services/support-errand.service';
import { attachPdfToSupportErrand, renderPdfWithTemplating } from '@/services/support-pdf-attachment.service';

interface CreatedMeasureActionPlan {
  readonly fileName: string;
  readonly attachmentId?: string;
}

type ActionPlanApiService = Pick<ApiService, 'get' | 'post'>;

export interface SupportMeasureActionPlanControllerDependencies {
  readonly apiService?: ActionPlanApiService;
  readonly handlerDirectory?: Pick<HandlerDirectoryService, 'listHandlers'>;
  readonly namespace?: string;
  readonly supportManagementService?: string;
  readonly templatingService?: string;
  readonly clock?: () => Date;
}

/**
 * Renders every measure of an errand as one action plan PDF and attaches it to the errand as the
 * next numbered plan. The plan is read from what Support Management holds at that moment - the
 * measures, their types and roles from the namespace metadata - never from the browser's list, so
 * a stale tab cannot produce a plan that differs from the stored measures.
 */
@Controller()
export class SupportMeasureActionPlanController {
  private readonly apiService: ActionPlanApiService;
  private readonly handlerDirectory: Pick<HandlerDirectoryService, 'listHandlers'>;
  private readonly namespace: string;
  private readonly supportManagementService: string;
  private readonly templatingService: string;
  private readonly clock: () => Date;

  constructor(dependencies: SupportMeasureActionPlanControllerDependencies = {}) {
    this.apiService = dependencies.apiService ?? new ApiService();
    this.handlerDirectory = dependencies.handlerDirectory ?? new HandlerDirectoryService();
    this.namespace = dependencies.namespace ?? SUPPORTMANAGEMENT_NAMESPACE ?? '';
    this.supportManagementService = trimSupportManagementPath(dependencies.supportManagementService ?? apiServiceName('supportmanagement'));
    this.templatingService = trimSupportManagementPath(dependencies.templatingService ?? apiServiceName('templating'));
    this.clock = dependencies.clock ?? (() => new Date());
  }

  @Post('/supporterrands/:municipalityId/:errandId/measures/action-plan')
  @OpenAPI({ summary: 'Render every measure of an errand as an action plan PDF and attach it to the errand' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']))
  async createActionPlan(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('errandId') errandId: string,
    @Res() response: Response,
  ): Promise<Response> {
    const base = `${this.supportManagementService}/${encodeURIComponent(municipalityId)}/${encodeURIComponent(this.namespace)}`;
    const errandUrl = `${base}/errands/${encodeURIComponent(errandId)}`;

    const errand = (await this.apiService.get<Errand>({ url: errandUrl, propagateClientError: true }, req.user)).data;
    // A plan is an attachment, so it follows the same status rule as any other measure write.
    assertSupportErrandWritable(errand, 'action plan attachments');

    const measures = (await this.apiService.get<Measure[]>({ url: `${errandUrl}/measures`, propagateClientError: true }, req.user)).data;
    if (!Array.isArray(measures) || measures.length === 0) {
      throw new HttpException(409, 'Det finns inga åtgärder att ta med i handlingsplanen.');
    }

    const [metadata, attachments, displayNames] = await Promise.all([
      this.apiService.get<MetadataResponse>({ url: `${base}/metadata`, propagateClientError: true }, req.user).then(result => result.data),
      this.apiService
        .get<ErrandAttachment[]>({ url: `${errandUrl}/attachments`, propagateClientError: true }, req.user)
        .then(result => (Array.isArray(result.data) ? result.data : [])),
      this.readDisplayNames(req),
    ]);

    const sequence = nextMeasureActionPlanSequence(attachments);
    const fileName = measureActionPlanFileName(errand.errandNumber, sequence);
    const plan = buildMeasureActionPlanModel({
      measures,
      measureTypes: metadata.measureTypes ?? [],
      roles: metadata.roles ?? [],
      errand,
      sequence,
      generatedAt: formatActionPlanTimestamp(this.clock()),
      generatedBy: req.user.name || req.user.username,
      displayName: username => displayNames.get(username.toLowerCase()),
    });

    const pdfBase64 = await renderPdfWithTemplating({
      apiService: this.apiService,
      templatingService: this.templatingService,
      municipalityId,
      template: MEASURE_ACTION_PLAN_TEMPLATE,
      parameters: { plan },
      subject: 'the action plan',
      user: req.user,
    });
    const attachmentId = await attachPdfToSupportErrand({
      apiService: this.apiService,
      supportManagementService: this.supportManagementService,
      namespace: this.namespace,
      municipalityId,
      errandId,
      fileName,
      pdfBase64,
      user: req.user,
    });

    const created: CreatedMeasureActionPlan = { fileName, ...(attachmentId && { attachmentId }) };
    return response.status(201).send({ data: created, message: 'Action plan attached' });
  }

  /**
   * The same directory the tab resolves names from. It is a courtesy, not a precondition: a
   * directory that cannot be read leaves the stored accounts in the plan instead of failing it.
   */
  private async readDisplayNames(req: RequestWithUser): Promise<Map<string, string>> {
    try {
      const handlers = await this.handlerDirectory.listHandlers(req.user);
      return new Map(handlers.map(handler => [handler.name.toLowerCase(), handler.displayName]));
    } catch (error) {
      logger.warn(
        `Action plan: handler directory unavailable, showing accounts instead of names: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Map();
    }
  }
}
