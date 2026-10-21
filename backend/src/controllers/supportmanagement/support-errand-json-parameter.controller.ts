import { IsDefined, IsObject, IsString, MinLength } from 'class-validator';
import { Response } from 'express';
import { Body, Controller, Get, HeaderParam, Param, Put, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID, SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { assessesHighHslRisk, IAF_VOF_HIGH_HSL_RISK_LABEL } from '@/config/iaf-vof-high-hsl-risk';
import { IAF_VOF_HSL_ANALYSIS_SCHEMA_NAME, IAF_VOF_HSL_ANALYSIS_STARTED_LABEL, startsHslAnalysis } from '@/config/iaf-vof-hsl-analysis';
import { iafVofDocumentAppliesToErrand, resolveIafVofUnitManagerErrandFacts } from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE } from '@/config/support-investigation-profile';
import type { Errand, MetadataResponse, Phase } from '@/data-contracts/supportmanagement/data-contracts';
import {
  SupportInvestigationDocumentProfileDto,
  SupportInvestigationProfileDto,
  SupportInvestigationReportDocumentDto,
} from '@/dtos/support-investigation-profile.dto';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { User } from '@/interfaces/users.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import ApiService from '@/services/api.service';
import { InvestigationDerivedLabelService } from '@/services/investigation-derived-label.service';
import { JsonObject } from '@/services/schema-bound-json.service';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { SupportJsonParameter, SupportJsonParameterService } from '@/services/support-json-parameter.service';
import { supportMetadataCache } from '@/services/support-metadata-cache';
import { REPORT_DOCUMENT_REFUSALS, resolveReportDocumentEditability } from '@/services/support-report-document.service';
import { logger } from '@/utils/logger';

type SupportErrandJsonParameterKey = SupportInvestigationProfileDto['documents'][number]['key'];

export type SupportErrandJsonParameter = SupportJsonParameter<SupportErrandJsonParameterKey>;

export class UpdateSupportErrandJsonParameterDto {
  @IsString()
  @MinLength(1)
  schemaId!: string;

  @IsDefined()
  @IsObject()
  value!: JsonObject;
}

const setETagHeader = (response: Response, etag: unknown, version?: number): void => {
  if (typeof etag === 'string') {
    response.setHeader('ETag', etag);
    return;
  }

  if (version !== undefined) {
    response.setHeader('ETag', `"${version}"`);
  }
};

const NOT_APPLICABLE_MESSAGES: Readonly<Record<Exclude<SupportInvestigationDocumentProfileDto['appliesTo'] & string, 'all'>, string>> = Object.freeze(
  {
    'reported-misconduct': 'This investigation document applies to reported misconduct errands only',
    'hsl-deviation': 'This investigation document applies to HSL deviation errands only',
    deviation: 'This investigation document does not apply to reported misconduct errands',
  },
);

const requireJsonParameterDefinition = (profile: SupportInvestigationProfileDto, key: string): SupportInvestigationDocumentProfileDto => {
  const definition = profile.documents.find(document => document.key === key);
  if (!definition) {
    throw new HttpException(400, 'Unsupported investigation JSON parameter key');
  }

  return definition;
};

@Controller()
export class SupportErrandJsonParameterController {
  private readonly investigationProfile: SupportInvestigationProfileDto;
  private readonly documentService: SupportJsonParameterService;
  private readonly policyService: SupportInvestigationPolicyService;
  private readonly accessService: SupportInvestigationAccessService;
  private readonly apiService: Pick<ApiService, 'get'>;
  private readonly derivedLabelService: Pick<InvestigationDerivedLabelService, 'applyDerivedLabel'>;

  constructor(
    investigationProfile: SupportInvestigationProfileDto = AVVIKELSE_INVESTIGATION_PROFILE,
    documentService = new SupportJsonParameterService({ namespace: SUPPORTMANAGEMENT_NAMESPACE ?? '' }),
    policyService = new SupportInvestigationPolicyService(investigationProfile),
    accessService = new SupportInvestigationAccessService(),
    apiService: Pick<ApiService, 'get'> = new ApiService(),
    derivedLabelService: Pick<InvestigationDerivedLabelService, 'applyDerivedLabel'> = new InvestigationDerivedLabelService(),
  ) {
    this.investigationProfile = investigationProfile;
    this.documentService = documentService;
    this.policyService = policyService;
    this.accessService = accessService;
    this.apiService = apiService;
    this.derivedLabelService = derivedLabelService;
  }

  @Get('/supporterrands/:errandId/json-parameters/:key')
  @OpenAPI({ summary: 'Read one JSON parameter from a support errand' })
  @UseBefore(authMiddleware)
  async getJsonParameter(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('key') key: string,
    @Res() response: Response,
  ): Promise<Response> {
    const reportDocument = this.reportDocumentFor(key);
    if (reportDocument) return this.getReportDocument(req, reportDocument, MUNICIPALITY_ID, errandId, response);

    const definition = requireJsonParameterDefinition(this.investigationProfile, key);
    // An unresolvable policy fails closed here as it does on every write path.
    if ((await this.policyService.getState()) === 'unavailable') {
      throw new HttpException(503, 'Investigation read policy is temporarily unavailable');
    }
    await this.accessService.assertCanReadDocument(req.user, MUNICIPALITY_ID, errandId, definition.key);
    await this.assertDocumentAppliesToErrand(req, definition, MUNICIPALITY_ID, errandId);
    const result = await this.documentService.readJsonParameter({ definition, municipalityId: MUNICIPALITY_ID, errandId, user: req.user });

    setETagHeader(response, result.etag, result.document.version);
    return response.status(result.status).send(result.document);
  }

  @Put('/supporterrands/:errandId/json-parameters/:key')
  @OpenAPI({ summary: 'Create or update one JSON parameter on a support errand' })
  @UseBefore(authMiddleware, validationMiddleware(UpdateSupportErrandJsonParameterDto, 'body'))
  async updateJsonParameter(
    @Req() req: RequestWithUser,
    @Param('errandId') errandId: string,
    @Param('key') key: string,
    @HeaderParam('If-Match') ifMatch: string,
    @HeaderParam('If-None-Match') ifNoneMatch: string,
    @Body() data: UpdateSupportErrandJsonParameterDto,
    @Res() response: Response,
  ): Promise<Response> {
    const reportDocument = this.reportDocumentFor(key);
    if (reportDocument) {
      const preconditions = { ifMatch, ifNoneMatch };
      return this.updateReportDocument(req, reportDocument, MUNICIPALITY_ID, errandId, data, preconditions, response);
    }

    const definition = requireJsonParameterDefinition(this.investigationProfile, key);
    if ((await this.policyService.getState()) === 'unavailable') {
      throw new HttpException(503, 'Investigation write policy is temporarily unavailable');
    }
    // Support Management authorizes the document itself from the forwarded AD account; refusing
    // here keeps the BFF's answer a 403 about permissions instead of a relayed upstream failure.
    // A user who may only read the document is refused here rather than at the load.
    await this.accessService.assertCanWriteDocument(req.user, MUNICIPALITY_ID, errandId, definition.key);
    const snapshot = await this.assertDocumentAppliesToErrand(req, definition, MUNICIPALITY_ID, errandId);
    await this.assertPrerequisiteDocumentSaved(req, definition, MUNICIPALITY_ID, errandId, snapshot);
    const serverOwnedOverrides = await this.resolveErrandFacts(req, definition, MUNICIPALITY_ID, errandId, snapshot);
    const result = await this.documentService.writeJsonParameter({
      definition,
      municipalityId: MUNICIPALITY_ID,
      errandId,
      user: req.user,
      data,
      preconditions: { ifMatch, ifNoneMatch },
      ...(serverOwnedOverrides ? { internal: { serverOwnedOverrides } } : {}),
    });

    // A label the document decides is a second write on the errand. It touches none of the facts the errand-level
    // commands that may follow depend on, so the client follows nothing of it.
    await this.applyDerivedLabel(req, definition, MUNICIPALITY_ID, errandId, result);
    setETagHeader(response, result.etag, result.document.version);
    return response.status(result.status).send(result.document);
  }

  /**
   * What the errand itself says about the document being saved, for the properties its schema leaves to the server.
   * Only the unit manager's investigation records any: whether its errand is a misconduct. A schema that declares
   * no such property ignores the answer, so a document bound to an earlier version is written as before.
   */
  private async resolveErrandFacts(
    req: RequestWithUser,
    definition: SupportInvestigationDocumentProfileDto,
    municipalityId: string,
    errandId: string,
    snapshot: Errand | undefined,
  ): Promise<JsonObject | undefined> {
    const policy = this.policyService.iafVofClassificationPolicy;
    if (!policy || definition.key !== policy.defaultOwnerDocumentKey) return undefined;
    const errand = snapshot ?? (await this.documentService.readParentErrandSnapshot({ definition, municipalityId, errandId, user: req.user }));
    return resolveIafVofUnitManagerErrandFacts(errand);
  }

  /**
   * The label a saved IAF/VOF document adds to the errand, if any. Both are permanent (`IAF_VOF_PERMANENT_LABELS`):
   * a later save that decides otherwise leaves the label where it is.
   *
   * The unit manager's investigation adds the high HSL risk label once a save assesses a high risk, completed or
   * not: once MAS/MAR reach the errand they keep it. MAS/MAR's HSL event analysis adds the label of an analysis
   * started once their initial assessment is to analyse the event; the head of operations is e-mailed from it.
   */
  private derivedLabel(definition: SupportInvestigationDocumentProfileDto, value: JsonObject): string | undefined {
    const policy = this.policyService.iafVofClassificationPolicy;
    if (!policy) return undefined;
    if (definition.key === policy.defaultOwnerDocumentKey) {
      return assessesHighHslRisk(value) ? IAF_VOF_HIGH_HSL_RISK_LABEL : undefined;
    }
    if (definition.schemaName === IAF_VOF_HSL_ANALYSIS_SCHEMA_NAME) {
      return startsHslAnalysis(value) ? IAF_VOF_HSL_ANALYSIS_STARTED_LABEL : undefined;
    }
    return undefined;
  }

  /**
   * Adds the label the saved document decides. It is done if it can be: the document is saved either way, and a
   * label that could not be written is logged rather than turned into a failed save.
   */
  private async applyDerivedLabel(
    req: RequestWithUser,
    definition: SupportInvestigationDocumentProfileDto,
    municipalityId: string,
    errandId: string,
    written: { document: { schemaId: string; value: JsonObject } },
  ): Promise<void> {
    const resourcePath = this.derivedLabel(definition, written.document.value);
    if (!resourcePath) return;
    try {
      await this.derivedLabelService.applyDerivedLabel({ municipalityId, errandId, user: req.user, resourcePath });
    } catch (error) {
      logger.warn(`Could not add the ${resourcePath} label to errand ${errandId}`, error);
    }
  }

  private reportDocumentFor(key: string): SupportInvestigationReportDocumentDto | undefined {
    const reportDocument = this.investigationProfile.reportDocument;
    return reportDocument?.key === key ? reportDocument : undefined;
  }

  /**
   * The report is read like any document. It is no investigation document, so the investigation's
   * document grants say nothing about it: Support Management decides who may read it, from the
   * forwarded account.
   */
  private async getReportDocument(
    req: RequestWithUser,
    reportDocument: SupportInvestigationReportDocumentDto,
    municipalityId: string,
    errandId: string,
    response: Response,
  ): Promise<Response> {
    if ((await this.policyService.getState()) === 'unavailable') {
      throw new HttpException(503, 'Investigation read policy is temporarily unavailable');
    }
    const result = await this.documentService.readJsonParameter({ definition: reportDocument, municipalityId, errandId, user: req.user });

    setETagHeader(response, result.etag, result.document.version);
    return response.status(result.status).send(result.document);
  }

  /**
   * Writes the report of an errand registered in Draken, until its investigation starts. Katla's
   * report is the record of what was reported and is never written here. The checks read the errand
   * as it is now; the write itself is conditioned on the report's own ETag, as every document is.
   */
  private async updateReportDocument(
    req: RequestWithUser,
    reportDocument: SupportInvestigationReportDocumentDto,
    municipalityId: string,
    errandId: string,
    data: UpdateSupportErrandJsonParameterDto,
    preconditions: { ifMatch: string; ifNoneMatch: string },
    response: Response,
  ): Promise<Response> {
    if ((await this.policyService.getState()) === 'unavailable') {
      throw new HttpException(503, 'Investigation write policy is temporarily unavailable');
    }

    const request = { definition: reportDocument, municipalityId, errandId, user: req.user };
    const [errand, phases] = await Promise.all([
      this.documentService.readParentErrandSnapshot(request),
      this.readWorkflowPhases(municipalityId, req.user),
    ]);
    const editability = resolveReportDocumentEditability(errand, phases, reportDocument);
    if (editability !== 'editable') {
      throw new HttpException(409, REPORT_DOCUMENT_REFUSALS[editability]);
    }

    const result = await this.documentService.writeJsonParameter({ ...request, data, preconditions });
    setETagHeader(response, result.etag, result.document.version);
    return response.status(result.status).send(result.document);
  }

  private async readWorkflowPhases(municipalityId: string, user: User): Promise<Phase[] | undefined> {
    const url = `${apiServiceName('supportmanagement')}/${municipalityId}/${SUPPORTMANAGEMENT_NAMESPACE}/metadata`;
    const metadata = await supportMetadataCache.read<MetadataResponse>(
      this.apiService,
      { url, propagateClientError: true, mapUnauthorizedToForbidden: true },
      user,
    );
    return metadata.data.phases;
  }

  /**
   * A document declared for reported misconduct only is refused on every other errand, on reads as
   * well as writes: the decision tab is hidden for such errands, so a request that still arrives is
   * a client the profile does not describe. Access is checked before this so a user who may not
   * see the document learns nothing about the errand from the answer.
   */
  private async assertDocumentAppliesToErrand(
    req: RequestWithUser,
    definition: SupportInvestigationDocumentProfileDto,
    municipalityId: string,
    errandId: string,
  ): Promise<Errand | undefined> {
    const appliesTo = definition.appliesTo ?? 'all';
    if (appliesTo === 'all') return undefined;

    // The applicability rule is the IAF/VOF classification policy's; an application without one
    // has no way to decide, so its restricted documents stay closed.
    if (!this.policyService.iafVofClassificationPolicy) {
      throw new HttpException(409, 'Restricted investigation documents require an investigation classification policy');
    }
    const errand = await this.documentService.readParentErrandSnapshot({ definition, municipalityId, errandId, user: req.user });
    if (!iafVofDocumentAppliesToErrand(appliesTo, errand)) {
      throw new HttpException(409, NOT_APPLICABLE_MESSAGES[appliesTo]);
    }
    return errand;
  }

  /**
   * A document that answers another one is written only once that one exists on the errand. The
   * snapshot from the applicability check is reused when there is one, so the parent is read once.
   */
  private async assertPrerequisiteDocumentSaved(
    req: RequestWithUser,
    definition: SupportInvestigationDocumentProfileDto,
    municipalityId: string,
    errandId: string,
    snapshot: Errand | undefined,
  ): Promise<void> {
    const prerequisiteKey = definition.prerequisiteDocumentKey;
    if (!prerequisiteKey) return;

    const errand = snapshot ?? (await this.documentService.readParentErrandSnapshot({ definition, municipalityId, errandId, user: req.user }));
    if (!errand.jsonParameters?.some(parameter => parameter.key === prerequisiteKey)) {
      throw new HttpException(409, `This investigation document requires ${prerequisiteKey} to be saved on the errand first`);
    }
  }
}
