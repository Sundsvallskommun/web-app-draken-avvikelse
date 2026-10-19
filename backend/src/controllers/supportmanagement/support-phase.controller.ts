import { IsOptional, IsString, MinLength } from 'class-validator';
import { Body, Controller, HttpCode, Param, Patch, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPERADMIN_GROUP, SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { type HandlerGroupRole, resolveHandlerGroupRoles } from '@/config/handler-group-roles';
import { IAF_VOF_FOLLOW_UP_PHASE_NAME } from '@/config/iaf-vof-decision-investigation';
import { Errand as SupportErrand, MetadataResponse as SupportMetadata } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import { readRoleGroups } from '@/services/ad-role.service';
import ApiService from '@/services/api.service';
import {
  CLOSED_SUPPORT_ERRAND_STATUS,
  getActiveErrandPhaseId,
  getErrandVersion,
  resolveSupportErrandPhaseTransition,
} from '@/services/support-errand.service';
import {
  assertHslAnalysisFinishedBeforeClose,
  assertInvestigationCompletedBeforeDecision,
  assertMaySendToDecision,
  assertMayStartFollowUp,
} from '@/services/support-investigation-decision-readiness';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { SupportJsonParameterService } from '@/services/support-json-parameter.service';
import { assertMeasuresHandledBeforeClose, assertProposalsDecidedBeforeFollowUp } from '@/services/support-measure-closing';
import { supportMetadataCache } from '@/services/support-metadata-cache';
import { logger } from '@/utils/logger';
import { apiURL } from '@/utils/util';

export class UpdateSupportErrandPhaseDto {
  /**
   * The phase the client saw the errand in; omitted or null when it saw the errand outside the
   * workflow. The move is refused when the errand's phase has changed since, which is what a phase
   * change contends over.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  expectedActivePhaseId?: string | null;

  /**
   * The transition to apply. Omitted only when the errand has no active phase: it is then entering
   * the workflow rather than moving within it, and there is no transition to name.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  transitionId?: string;
}

/**
 * Workflow phase transitions for a support errand.
 *
 * Support Management has no errand-level phase route: the phase model lives under `metadata/phases`
 * and an errand moves by writing `activePhaseId` on the errand itself.
 *
 * The client's precondition is the phase it saw, not the errand's version. Measures, JSON parameters
 * and labels all move the errand's version without touching its phase, so a handler who registered a
 * measure a moment ago would otherwise be refused a phase change nobody contended. The upstream write
 * is still conditioned on the version read here, so a change landing between that read and the write
 * is refused rather than overwritten.
 *
 * Draken never derives the target from metadata order. The client submits an explicit transition id,
 * which is resolved against the errand's active phase and fresh metadata, so a branched workflow
 * cannot be advanced by guessing.
 *
 * Where the IAF/VOF investigation is active, the move into the decision phase waits for the
 * investigation the errand is decided on to be saved as completed - the button that offers the move
 * says so, but this is where the rule holds.
 */
@Controller()
@UseBefore(hasPermissions(['canEditSupportManagement']))
export class SupportPhaseController {
  private apiService = new ApiService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  private handlerRoles: readonly HandlerGroupRole[] = resolveHandlerGroupRoles();
  private superadminGroups = readRoleGroups(SUPERADMIN_GROUP);
  private readonly investigationPolicyService: SupportInvestigationPolicyService;
  private readonly jsonParameterService: SupportJsonParameterService;
  SERVICE = apiServiceName('supportmanagement');

  constructor(
    investigationPolicyService = new SupportInvestigationPolicyService(),
    jsonParameterService = new SupportJsonParameterService({ namespace: SUPPORTMANAGEMENT_NAMESPACE ?? '' }),
  ) {
    this.investigationPolicyService = investigationPolicyService;
    this.jsonParameterService = jsonParameterService;
  }

  @Patch('/supporterrands/:municipalityId/:id/phase')
  @HttpCode(200)
  @OpenAPI({ summary: 'Apply one explicit workflow transition to a support errand' })
  @UseBefore(authMiddleware, validationMiddleware(UpdateSupportErrandPhaseDto, 'body'))
  async updateSupportErrandPhase(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @Body() data: UpdateSupportErrandPhaseDto,
    @Res() response: any,
  ): Promise<any> {
    if (!municipalityId) {
      logger.error('No municipality id found, it is needed to update the errand phase.');
      return response.status(400).send('Municipality id missing');
    }

    const url = `${municipalityId}/${this.namespace}/errands/${id}`;
    const metadataUrl = `${municipalityId}/${this.namespace}/metadata`;
    const baseURL = apiURL(this.SERVICE);
    const [currentErrand, metadata] = await Promise.all([
      this.apiService.get<SupportErrand>(
        { url, baseURL, includeResponseHeaders: true, propagateClientError: true, mapUnauthorizedToForbidden: true },
        req.user,
      ),
      supportMetadataCache.read<SupportMetadata>(
        this.apiService,
        { url: metadataUrl, baseURL, propagateClientError: true, mapUnauthorizedToForbidden: true },
        req.user,
      ),
    ]);
    if ((data.expectedActivePhaseId ?? undefined) !== getActiveErrandPhaseId(currentErrand.data)) {
      throw new HttpException(409, 'Support errand phase has changed since it was loaded');
    }

    const transition = resolveSupportErrandPhaseTransition(currentErrand.data, metadata.data.phases, data.transitionId);
    const targetPhaseName = metadata.data.phases?.find(phase => phase.id === transition.targetPhaseId)?.name;
    // Who may move the errand into the phase is asked before whether it is ready to be decided.
    const phaseEntry = {
      policyService: this.investigationPolicyService,
      handlerRoles: this.handlerRoles,
      superadminGroups: this.superadminGroups,
      user: req.user,
      targetPhaseName,
    };
    assertMaySendToDecision(phaseEntry);
    assertMayStartFollowUp(phaseEntry);
    await assertInvestigationCompletedBeforeDecision({
      policyService: this.investigationPolicyService,
      documentService: this.jsonParameterService,
      user: req.user,
      municipalityId,
      errandId: id,
      errand: currentErrand.data,
      targetPhaseName,
    });
    // The follow-up follows up what was approved, so every proposal is decided before the errand enters it.
    await assertProposalsDecidedBeforeFollowUp({
      apiService: this.apiService,
      user: req.user,
      errandUrl: url,
      baseURL,
      entersFollowUp: targetPhaseName === IAF_VOF_FOLLOW_UP_PHASE_NAME,
    });
    // A phase carries its status with it, so a move into a phase that closes the errand is a close
    // and answers to the same rule as the close button.
    await assertMeasuresHandledBeforeClose({
      apiService: this.apiService,
      user: req.user,
      errandUrl: url,
      baseURL,
      status: transition.status,
    });
    await assertHslAnalysisFinishedBeforeClose({
      policyService: this.investigationPolicyService,
      documentService: this.jsonParameterService,
      user: req.user,
      municipalityId,
      errandId: id,
      errand: currentErrand.data,
      closes: transition.status === CLOSED_SUPPORT_ERRAND_STATUS,
    });
    await this.apiService.patch<SupportErrand, { activePhaseId: string; status?: string }>(
      {
        url,
        baseURL,
        // Phase and status move together: a phase declares which statuses it allows, so writing one
        // without the other leaves the errand in a combination its own workflow does not have.
        data: { activePhaseId: transition.targetPhaseId, ...(transition.status ? { status: transition.status } : {}) },
        headers: { 'If-Match': `"${getErrandVersion(currentErrand.data, currentErrand.headers?.etag)}"` },
        followLocation: false,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      req.user,
    );

    const savedErrand = await this.apiService.get<SupportErrand>(
      { url, baseURL, includeResponseHeaders: true, propagateClientError: true, mapUnauthorizedToForbidden: true },
      req.user,
    );
    return response.status(200).send({
      ...savedErrand.data,
      version: getErrandVersion(savedErrand.data, savedErrand.headers?.etag),
    });
  }
}
