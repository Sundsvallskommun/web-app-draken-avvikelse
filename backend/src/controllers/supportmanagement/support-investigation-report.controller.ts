import { IsBoolean, IsObject, IsOptional, IsString, IsUUID, isUUID, MinLength } from 'class-validator';
import { Response } from 'express';
import { Body, Controller, Param, Post, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID, SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { AVVIKELSE_INVESTIGATION_PROFILE } from '@/config/support-investigation-profile';
import { trimSupportManagementPath } from '@/config/supportmanagement-path';
import { SupportInvestigationDocumentProfileDto, SupportInvestigationProfileDto } from '@/dtos/support-investigation-profile.dto';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import ApiService from '@/services/api.service';
import { buildInvestigationReportModel, investigationReportFileName } from '@/services/investigation-report.service';
import { renderInvestigationReportTemplate } from '@/services/investigation-report.template';
import { InvestigationReportPublicationService, readInvestigationReportEntries } from '@/services/investigation-report-publication.service';
import { isJsonObject, isRecord, type JsonObject } from '@/services/schema-bound-json.service';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { isDocumentCompleted, readDocumentCompletion, SupportJsonParameterService } from '@/services/support-json-parameter.service';
import { type PdfAttachmentApiService, renderPdfWithTemplating } from '@/services/support-pdf-attachment.service';

export class CreateSupportInvestigationReportDto {
  /** Stable identity retained by the client until a real publication is confirmed. */
  @IsOptional()
  @IsUUID('4')
  operationId?: string;

  /** Render the PDF and return it without attaching it to the errand or recording it. */
  @IsOptional()
  @IsBoolean()
  preview?: boolean;

  /**
   * Preview only: the form as the handler currently sees it, rendered instead of the stored
   * document so a draft can be previewed before it is saved. Ignored for a real report, which is
   * always made from what Support Management holds.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  schemaId?: string;

  @IsOptional()
  @IsObject()
  value?: JsonObject;
}

type ReportApiService = PdfAttachmentApiService & Pick<ApiService, 'get'>;

export interface SupportInvestigationReportControllerDependencies {
  readonly investigationProfile?: SupportInvestigationProfileDto;
  readonly documentService?: SupportJsonParameterService;
  readonly policyService?: SupportInvestigationPolicyService;
  readonly accessService?: SupportInvestigationAccessService;
  readonly apiService?: ReportApiService;
  readonly namespace?: string;
  readonly supportManagementService?: string;
  readonly templatingService?: string;
  readonly clock?: () => Date;
}

const requireDefinition = (profile: SupportInvestigationProfileDto, key: string): SupportInvestigationDocumentProfileDto => {
  const definition = profile.documents.find(document => document.key === key);
  if (!definition) throw new HttpException(400, 'Unsupported investigation JSON parameter key');
  return definition;
};

const formatTimestamp = (iso: string): string => iso.replace('T', ' ').slice(0, 16);

/**
 * Renders one completed investigation document as a PDF from its own schema, and attaches it to
 * the errand as the next numbered report. Generating a report is the one write a completed,
 * locked document still accepts, and it is the BFF that makes it.
 */
@Controller()
export class SupportInvestigationReportController {
  private readonly investigationProfile: SupportInvestigationProfileDto;
  private readonly documentService: SupportJsonParameterService;
  private readonly policyService: SupportInvestigationPolicyService;
  private readonly accessService: SupportInvestigationAccessService;
  private readonly apiService: ReportApiService;
  private readonly namespace: string;
  private readonly supportManagementService: string;
  private readonly templatingService: string;
  private readonly clock: () => Date;

  constructor(dependencies: SupportInvestigationReportControllerDependencies = {}) {
    this.investigationProfile = dependencies.investigationProfile ?? AVVIKELSE_INVESTIGATION_PROFILE;
    this.documentService = dependencies.documentService ?? new SupportJsonParameterService({ namespace: SUPPORTMANAGEMENT_NAMESPACE ?? '' });
    this.policyService = dependencies.policyService ?? new SupportInvestigationPolicyService(this.investigationProfile);
    this.accessService = dependencies.accessService ?? new SupportInvestigationAccessService();
    this.apiService = dependencies.apiService ?? new ApiService();
    this.namespace = dependencies.namespace ?? SUPPORTMANAGEMENT_NAMESPACE ?? '';
    this.supportManagementService = trimSupportManagementPath(dependencies.supportManagementService ?? apiServiceName('supportmanagement'));
    this.templatingService = trimSupportManagementPath(dependencies.templatingService ?? apiServiceName('templating'));
    this.clock = dependencies.clock ?? (() => new Date());
  }

  @Post('/supporterrands/:errandId/json-parameters/:key/reports')
  @OpenAPI({ summary: 'Render a completed investigation document as a PDF report and attach it to the errand' })
  @UseBefore(authMiddleware, validationMiddleware(CreateSupportInvestigationReportDto, 'body'))
  async createReport(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('key') key: string,
    @Body() body: CreateSupportInvestigationReportDto,
    @Res() response: Response,
  ): Promise<Response> {
    const definition = requireDefinition(this.investigationProfile, key);
    if ((await this.policyService.getState()) === 'unavailable') {
      throw new HttpException(503, 'Investigation write policy is temporarily unavailable');
    }

    const preview = body.preview === true;
    if (preview) await this.accessService.assertCanReadDocument(req.user, MUNICIPALITY_ID, errandId, definition.key);
    else await this.accessService.assertCanWriteDocument(req.user, MUNICIPALITY_ID, errandId, definition.key);

    const request = { definition, municipalityId: MUNICIPALITY_ID, errandId, user: req.user };
    const draft =
      preview && typeof body.schemaId === 'string' && isJsonObject(body.value) ? { schemaId: body.schemaId, value: body.value } : undefined;
    // A draft may belong to a document that was never saved; a real report needs the stored one.
    const stored = draft ? await this.readStoredDocumentIfAny(request) : await this.documentService.readJsonParameter(request);
    if (!stored && !draft) throw new HttpException(404, 'Investigation document not found');
    const schemaId = draft?.schemaId ?? stored?.document.schemaId ?? '';
    const value = draft?.value ?? stored?.document.value ?? {};
    const schema = await this.documentService.readBoundSchema(request, schemaId);
    const completion = readDocumentCompletion(schema);
    if (!completion) throw new HttpException(409, 'This investigation document cannot be reported');
    if (!preview && !isDocumentCompleted(schema, value)) {
      throw new HttpException(409, 'Mark the investigation as completed before generating a report');
    }

    const [uiSchema, parent] = await Promise.all([
      this.documentService.readUiSchema(request, schemaId),
      this.documentService.readParentErrandWithVersion(request),
    ]);
    const reports = readInvestigationReportEntries(stored?.document.value[completion.reportsField]);
    const publication = new InvestigationReportPublicationService({
      documentService: this.documentService,
      apiService: this.apiService,
      namespace: this.namespace,
      supportManagementService: this.supportManagementService,
    });
    const operationId = body.operationId?.toLowerCase();
    if (!preview && !isUUID(operationId ?? '', '4')) throw new HttpException(400, 'A report operationId (UUID v4) is required');
    const publicationInput = stored ? { request, stored, reportsField: completion.reportsField, parentVersion: parent.version } : undefined;
    if (!preview && publicationInput && operationId) {
      const recovered = await publication.recover(publicationInput, operationId);
      if (recovered) {
        response.setHeader('ETag', recovered.etag);
        response.setHeader('X-Errand-Version', String(recovered.parentErrandVersion));
        response.setHeader('X-Errand-Writes', String(recovered.ownErrandWrites));
        return response
          .status(201)
          .send({ data: { document: recovered.document, report: recovered.report }, message: 'Investigation report attached' });
      }
    }
    const sequence = reports.length + 1;
    const generatedAt = this.clock().toISOString();
    const baseFileName = investigationReportFileName(definition.tabLabel, sequence);
    const fileName = preview ? baseFileName : baseFileName.replace(/\.pdf$/u, `_${operationId}.pdf`);
    const model = buildInvestigationReportModel({
      schema,
      uiSchema,
      value,
      errand: parent.errand,
      definition,
      sequence,
      generatedAt: formatTimestamp(generatedAt),
      generatedBy: req.user.name || req.user.username,
    });

    const pdfBase64 = await renderPdfWithTemplating({
      apiService: this.apiService,
      templatingService: this.templatingService,
      municipalityId: MUNICIPALITY_ID,
      template: renderInvestigationReportTemplate(),
      parameters: { report: model },
      subject: 'the investigation report',
      user: req.user,
    });
    if (preview) {
      return response.status(200).send({ data: { fileName, pdfBase64 }, message: 'Investigation report rendered' });
    }

    if (!publicationInput) throw new HttpException(404, 'Investigation document not found');
    const written = await publication.publish(publicationInput, { generatedAt, generatedBy: req.user.username, fileName }, pdfBase64);

    response.setHeader('ETag', written.etag);
    response.setHeader('X-Errand-Version', String(written.parentErrandVersion));
    // How many of the errand's version steps were this publication's own, so the page can follow the version.
    response.setHeader('X-Errand-Writes', String(written.ownErrandWrites));
    return response.status(201).send({
      data: { document: written.document, report: written.report },
      message: 'Investigation report attached',
    });
  }

  private async readStoredDocumentIfAny(request: Parameters<SupportJsonParameterService['readJsonParameter']>[0]) {
    try {
      return await this.documentService.readJsonParameter(request);
    } catch (error) {
      if (isRecord(error) && error.status === 404) return undefined;
      throw error;
    }
  }
}
