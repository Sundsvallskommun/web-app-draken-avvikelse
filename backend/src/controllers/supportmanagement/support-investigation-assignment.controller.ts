import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID, SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { awaitsLexHandover } from '@/config/iaf-vof-decision-investigation';
import {
  getInvestigationHandoverStep,
  InvestigationHandoverStepDefinition,
  LEX_HANDLER_ROLE_KEYS,
  LEX_MANAGER_ROLE_KEY,
} from '@/config/investigation-handover-steps';
import { findInvestigationManagerRole } from '@/config/investigation-manager-roles';
import { AssignableHandlersResponse } from '@/controllers/active-directory.controller';
import {
  Errand as SupportErrand,
  FindErrandNotesResponse,
  MetadataResponse as SupportMetadata,
} from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import { AccessMapperService, readAccessMapperRoles } from '@/services/access-mapper.service';
import ApiService from '@/services/api.service';
import { HandlerDirectoryService } from '@/services/handler-directory.service';
import {
  buildInvestigationHandoverLabelUpdate,
  buildInvestigationLocationLabelUpdate,
  ErrandLocation,
  hasInvestigationAccessLexLabel,
  InvestigationLocationTarget,
  resolveErrandLocation,
  resolveInvestigationLocationTarget,
} from '@/services/investigation-handover-label.service';
import { assertRequestedErrandVersion, assertSupportErrandAdminAssignable, getErrandVersion } from '@/services/support-errand.service';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { supportMetadataCache } from '@/services/support-metadata-cache';
import {
  assertCanWriteSupportServiceNote,
  buildSupportServiceNote,
  isSupportServiceNote,
  SUPPORT_SERVICE_NOTE,
} from '@/services/support-note.service';
import { unfollowErrandAssignedToOther } from '@/services/support-subscriber.service';
import { ManagerCandidate, ManagerRoleOption, managerRoleOptions, resolveLocationManagers } from '@/services/unit-manager-resolution';
import { logger } from '@/utils/logger';
import { apiURL } from '@/utils/util';

export class InvestigationHandoverDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  /** Required by steps whose assignee is picked by the caller; ignored by the others. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  assignedUserId?: string;

  /**
   * The place the errand is moved to, as a label id from the metadata tree. Required by
   * `move-location`, ignored by every other step.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  locationLabelId?: string;
}

interface HandoverWriteBody {
  assignedUserId?: string;
  status?: string;
  labels?: { id: string }[];
}

export interface UnitManagerResponse {
  /** The managers for the place, most specific access first. The client groups them by role. */
  candidates: ManagerCandidate[];
  /** Role headings in display order, so the client does not carry its own copy of the labels. */
  roles: ManagerRoleOption[];
  locationResourcePath: string;
  /** The place's name. The resource path is an identity; this is what a handler is shown. */
  locationDisplayName: string;
}

/**
 * The handovers that move an avvikelse errand between the roles investigating it.
 *
 * Access is the point of these writes, not a side effect of them: Support Management's AccessMapper
 * matches a user's configured label patterns against the errand's labels, so adding `access/lex` is
 * what takes the errand away from the unit manager and gives it to the LEX roles. Two consequences
 * shape this controller.
 *
 * First, the assignee, the labels and the status go upstream in **one** PATCH. Splitting them would
 * mean losing read access to the errand halfway through a sequence that still had writes left.
 *
 * Second, nothing is read back afterwards. The caller has usually just written themselves out of
 * the errand, so the confirming GET would fail; these routes answer 204 and the client navigates
 * away rather than re-rendering an errand it can no longer see.
 */
@Controller()
@UseBefore(hasPermissions(['canEditSupportManagement']))
export class SupportInvestigationAssignmentController {
  private apiService = new ApiService();
  private accessMapperService = new AccessMapperService();
  private handlerDirectory = new HandlerDirectoryService();
  private investigationPolicyService = new SupportInvestigationPolicyService();
  private investigationAccessService = new SupportInvestigationAccessService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  SERVICE = apiServiceName('supportmanagement');

  @Get('/supporterrands/:id/unit-manager')
  @OpenAPI({ summary: "Resolve the unit manager owning the errand's location" })
  @UseBefore(authMiddleware)
  async getUnitManager(@Req() req: RequestWithUser, @Param('id') id: string): Promise<UnitManagerResponse> {
    const step = this.requireStep('return-to-manager');
    await this.assertStepAllowed(req, MUNICIPALITY_ID, id, step);

    const { errand, metadata } = await this.readErrandAndMetadata(req, MUNICIPALITY_ID, id);
    const { location, managers } = await this.resolveManagersForErrand(req, MUNICIPALITY_ID, errand, metadata);

    return {
      candidates: managers,
      roles: managerRoleOptions(),
      locationResourcePath: location.resourcePath,
      locationDisplayName: location.displayName,
    };
  }

  /**
   * The managers of a place the errand is about to be moved to, so the choice can be shown before it
   * is made. The backend resolves the same list again when the move is applied.
   *
   * The move is authorized like the step it previews: whoever may write the unit manager's
   * investigation may move the errand. A wrongly routed errand is first seen by the manager it
   * wrongly reached, and that is the person who has to be able to send it on.
   */
  @Get('/supporterrands/:id/location-managers/:labelId')
  @OpenAPI({ summary: 'Resolve the managers of the place an errand would be moved to' })
  @UseBefore(authMiddleware)
  async getLocationManagers(@Req() req: RequestWithUser, @Param('id') id: string, @Param('labelId') labelId: string): Promise<UnitManagerResponse> {
    const step = this.requireStep('move-location');
    await this.assertStepAllowed(req, MUNICIPALITY_ID, id, step);

    const { errand, metadata } = await this.readErrandAndMetadata(req, MUNICIPALITY_ID, id);
    const target = this.requireLocationTarget(errand, metadata, labelId);
    const managers = await this.resolveManagersForLocation(req, MUNICIPALITY_ID, target.location);

    return {
      candidates: managers,
      roles: managerRoleOptions(),
      locationResourcePath: target.location.resourcePath,
      locationDisplayName: target.location.displayName,
    };
  }

  /**
   * The handlers who can be given *this* errand.
   *
   * The ordinary handler list answers "who is in the configured AD groups" and is the same for every
   * errand, which is how a manager stayed offered for an errand they could no longer reach. This
   * answers per errand instead:
   *
   * - carrying the LEX access label, it belongs to the LEX roles - they are offered, the managers
   *   are not, because the managers cannot act on it until it is handed back;
   * - otherwise the managers for its place, resolved exactly the way the return handover resolves
   *   them, so one rule decides who owns a place rather than two that can disagree - and, once the unit
   *   manager's investigation is completed with a suspected misconduct, the LEX managers too: giving the
   *   errand to one of them is the handover to LEX, which the candidate says (`handoverStep`);
   * - and where none of that applies - no location, or a profile without the avvikelse
   *   classification policy - the unchanged list.
   */
  @Get('/supporterrands/:id/assignable-handlers')
  @OpenAPI({ summary: 'Return the handlers who can be assigned this errand' })
  @UseBefore(authMiddleware)
  async getAssignableHandlers(@Req() req: RequestWithUser, @Param('id') id: string): Promise<AssignableHandlersResponse> {
    const unfiltered = async (): Promise<AssignableHandlersResponse> => {
      const data = await this.handlerDirectory.listHandlers(req.user);
      return { data, roles: this.handlerDirectory.roles.map(({ key, label }) => ({ key, label })), message: 'ok' };
    };

    // Filtering is driven by the avvikelse capability, never by which application is running. A
    // deployment without it has no AccessMapper configuration to filter against, and an empty
    // Ansvarig list would leave it unable to assign anybody at all.
    if (!this.investigationPolicyService.iafVofClassificationPolicy || !this.namespace?.trim()) return unfiltered();

    const { errand, metadata } = await this.readErrandAndMetadata(req, MUNICIPALITY_ID, id);
    const labelStructure = metadata.labels?.labelStructure;

    if (hasInvestigationAccessLexLabel(errand.labels, labelStructure)) {
      const handlers = await this.handlerDirectory.listHandlers(req.user);
      const lexRoles = this.handlerDirectory.roles.filter(role => LEX_HANDLER_ROLE_KEYS.includes(role.key));
      return {
        data: handlers.filter(handler => handler.roleKeys.some(roleKey => LEX_HANDLER_ROLE_KEYS.includes(roleKey))),
        roles: lexRoles.map(({ key, label }) => ({ key, label })),
        message: 'ok',
      };
    }

    let managers: ManagerCandidate[];
    try {
      ({ managers } = await this.resolveManagersForErrand(req, MUNICIPALITY_ID, errand, metadata));
    } catch (error) {
      // An errand with no place - or more than one - has no managers to offer, but it still has to
      // be assignable. Falling back keeps the list usable instead of emptying it over a data problem.
      if (error instanceof Object && (error as { status?: unknown }).status === 409) return unfiltered();
      throw error;
    }

    const placeManagers = managers.map(manager => ({ displayName: manager.displayName, name: manager.adAccount, roleKeys: [manager.roleKey] }));
    const managerRoles = managerRoleOptions().map(({ key, label }) => ({ key, label }));
    if (!awaitsLexHandover(this.investigationPolicyService.iafVofClassificationPolicy, errand)) {
      return { data: placeManagers, roles: managerRoles, message: 'ok' };
    }

    const lexManagerRole = this.handlerDirectory.roles.find(role => role.key === LEX_MANAGER_ROLE_KEY);
    const lexManagers = (await this.handlerDirectory.listHandlers(req.user))
      .filter(handler => handler.roleKeys.includes(LEX_MANAGER_ROLE_KEY))
      .map(handler => ({ ...handler, roleKeys: [LEX_MANAGER_ROLE_KEY], handoverStep: 'assign-lex' }));
    return {
      data: [...placeManagers, ...lexManagers],
      roles: [...managerRoles, ...(lexManagerRole ? [{ key: lexManagerRole.key, label: lexManagerRole.label }] : [])],
      message: 'ok',
    };
  }

  @Post('/supporterrands/:id/investigation-handover/:step')
  @HttpCode(204)
  @OpenAPI({ summary: 'Apply one named investigation handover step to a support errand' })
  @UseBefore(authMiddleware, validationMiddleware(InvestigationHandoverDto, 'body'))
  async applyHandover(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('step') stepName: string,
    @Body() data: InvestigationHandoverDto,
    @Res() response: any,
  ): Promise<any> {
    const step = this.requireStep(stepName);
    const authorizingDocumentKey = await this.assertStepAllowed(req, MUNICIPALITY_ID, id, step);

    let { errand, metadata, currentVersion } = await this.readErrandAndMetadata(req, MUNICIPALITY_ID, id);
    assertRequestedErrandVersion(data.expectedVersion, currentVersion);
    assertSupportErrandAdminAssignable(errand, `the ${step.step} handover`);
    if (await this.carryOutSavedDecision(req, MUNICIPALITY_ID, id, step, authorizingDocumentKey, errand)) {
      // The service note was this step's own write, so the handover applies to the errand as it now stands.
      ({ errand, metadata, currentVersion } = await this.readErrandAfterOwnWrite(req, MUNICIPALITY_ID, id, currentVersion));
    }

    let assignedUserId: string | undefined;
    let labels: { id: string }[] | undefined;
    if (step.assigneeSource === 'target-location') {
      // The place is the input here, not the labels: the caller names where the errand goes, and
      // the whole location chain is derived from the metadata tree. Nothing else on the errand
      // moves - in particular not the incoming JSON parameter, which stays the record of what was
      // reported even when it names the wrong unit.
      const target = this.requireLocationTarget(errand, metadata, data.locationLabelId);
      const managers = await this.resolveManagersForLocation(req, MUNICIPALITY_ID, target.location);
      assignedUserId = this.pickManager(step, data, managers, target.location);
      labels = buildInvestigationLocationLabelUpdate({ currentLabels: errand.labels, labelStructure: metadata.labels?.labelStructure, target });
    } else {
      assignedUserId = step.assigneeSource === 'none' ? undefined : await this.resolveAssignee(req, MUNICIPALITY_ID, step, data, errand, metadata);
      labels = buildInvestigationHandoverLabelUpdate({
        currentLabels: errand.labels,
        labelStructure: metadata.labels?.labelStructure,
        addResourcePaths: step.addLabelResourcePaths,
        removeResourcePaths: step.removeLabelResourcePaths,
      });
    }

    const body: HandoverWriteBody = {
      ...(assignedUserId ? { assignedUserId } : {}),
      ...(labels ? { labels } : {}),
      ...(step.status ? { status: this.requireAvailableStatus(metadata, step.status) } : {}),
    };
    if (Object.keys(body).length === 0) {
      // The errand already looks the way this step would leave it. Writing anyway would burn a
      // version and, for a step that moves access, hand the errand over a second time.
      return response.status(204).send();
    }

    await this.apiService.patch<SupportErrand, HandoverWriteBody>(
      {
        url: `${MUNICIPALITY_ID}/${this.namespace}/errands/${id}`,
        baseURL: apiURL(this.SERVICE),
        data: body,
        headers: { 'If-Match': `"${currentVersion}"` },
        followLocation: false,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      req.user,
    );

    if (assignedUserId && this.investigationPolicyService.assigneeFollowsErrand) {
      await unfollowErrandAssignedToOther(
        { apiService: this.apiService, service: this.SERVICE, namespace: this.namespace },
        { municipalityId: MUNICIPALITY_ID, errandId: id, assignee: assignedUserId },
        req.user,
      );
    }

    logger.info(`Applied investigation handover ${step.step} to support errand ${id}`);
    return response.status(204).send();
  }

  private requireStep(stepName: string): InvestigationHandoverStepDefinition {
    const step = getInvestigationHandoverStep(stepName);
    if (!step) throw new HttpException(400, `Unknown investigation handover step ${stepName}`);
    return step;
  }

  /**
   * A handover only exists where an investigation owns the errand, and only for somebody who may
   * write the document the step belongs to. The capability decides this, never the application name.
   */
  private async assertStepAllowed(
    req: RequestWithUser,
    municipalityId: string,
    errandId: string,
    step: InvestigationHandoverStepDefinition,
  ): Promise<string> {
    if (!this.namespace?.trim()) throw new HttpException(409, 'Support Management namespace is not configured');

    const classificationOwner = await this.investigationPolicyService.getClassificationOwner();
    if (classificationOwner === 'unavailable') {
      throw new HttpException(503, 'Investigation policy is temporarily unavailable');
    }
    if (classificationOwner !== 'investigation') {
      throw new HttpException(409, 'Investigation handovers are not available for this application');
    }

    const definition = this.investigationPolicyService.profile.documents.find(document => document.schemaName === step.authorizingSchemaName);
    if (!definition) {
      throw new HttpException(409, `This application has no ${step.authorizingSchemaName} investigation document`);
    }
    await this.investigationAccessService.assertCanWriteDocument(req.user, municipalityId, errandId, definition.key);
    return definition.key;
  }

  /**
   * Holds a step to the decision its authorizing document records, and leaves the reason on the errand as a
   * service note where the step asks for one - written once, so a retried handover does not repeat it. Answers
   * whether a note was written, which may have moved the errand on.
   */
  private async carryOutSavedDecision(
    req: RequestWithUser,
    municipalityId: string,
    errandId: string,
    step: InvestigationHandoverStepDefinition,
    documentKey: string,
    errand: SupportErrand,
  ): Promise<boolean> {
    if (!step.requiredSavedAnswer && !step.serviceNote) return false;
    const saved: unknown = errand.jsonParameters?.find(parameter => parameter.key === documentKey)?.value;
    const document = typeof saved === 'object' && saved !== null && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
    if (step.requiredSavedAnswer && document[step.requiredSavedAnswer.field] !== step.requiredSavedAnswer.value) {
      throw new HttpException(422, step.requiredSavedAnswer.refusal);
    }
    if (!step.serviceNote) return false;

    const reason = document[step.serviceNote.field];
    if (typeof reason !== 'string' || !reason.trim()) {
      throw new HttpException(422, 'Den sparade bedömningen saknar motivering.');
    }
    const body = `${step.serviceNote.heading} ${reason.trim()}`;
    const notesUrl = `${municipalityId}/${this.namespace}/errands/${errandId}/notes`;
    const baseURL = apiURL(this.SERVICE);
    const existing = await this.apiService.get<FindErrandNotesResponse>(
      {
        url: `${notesUrl}?${new URLSearchParams({ context: SUPPORT_SERVICE_NOTE.context, page: '1', limit: '100' }).toString()}`,
        baseURL,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      req.user,
    );
    if (existing.data.notes?.some(note => isSupportServiceNote(note) && note.body?.trim() === body)) return false;

    assertCanWriteSupportServiceNote(errand, req.user);
    await this.apiService.post(
      { url: notesUrl, baseURL, data: buildSupportServiceNote(body, req.user), propagateClientError: true, mapUnauthorizedToForbidden: true },
      req.user,
    );
    return true;
  }

  /**
   * The errand after a write of this step's own. One version step is the step's own write; any more is somebody
   * else's, and the handover is refused rather than applied over a change the handler has not seen.
   */
  private async readErrandAfterOwnWrite(
    req: RequestWithUser,
    municipalityId: string,
    errandId: string,
    versionBefore: number,
  ): Promise<{ errand: SupportErrand; metadata: SupportMetadata; currentVersion: number }> {
    const fresh = await this.readErrandAndMetadata(req, municipalityId, errandId);
    if (fresh.currentVersion > versionBefore + 1) {
      throw new HttpException(409, 'Ärendet har ändrats av någon annan. Ladda om ärendet och försök igen.');
    }
    return fresh;
  }

  private async readErrandAndMetadata(
    req: RequestWithUser,
    municipalityId: string,
    id: string,
  ): Promise<{ errand: SupportErrand; metadata: SupportMetadata; currentVersion: number }> {
    const baseURL = apiURL(this.SERVICE);
    const [errandResponse, metadataResponse] = await Promise.all([
      this.apiService.get<SupportErrand>(
        {
          url: `${municipalityId}/${this.namespace}/errands/${id}`,
          baseURL,
          includeResponseHeaders: true,
          propagateClientError: true,
          mapUnauthorizedToForbidden: true,
        },
        req.user,
      ),
      supportMetadataCache.read<SupportMetadata>(
        this.apiService,
        { url: `${municipalityId}/${this.namespace}/metadata`, baseURL, propagateClientError: true, mapUnauthorizedToForbidden: true },
        req.user,
      ),
    ]);

    return {
      errand: errandResponse.data,
      metadata: metadataResponse.data,
      currentVersion: getErrandVersion(errandResponse.data, errandResponse.headers?.etag),
    };
  }

  private async resolveAssignee(
    req: RequestWithUser,
    municipalityId: string,
    step: InvestigationHandoverStepDefinition,
    data: InvestigationHandoverDto,
    errand: SupportErrand,
    metadata: SupportMetadata,
  ): Promise<string> {
    if (step.assigneeSource === 'request') {
      if (!data.assignedUserId?.trim()) {
        throw new HttpException(400, `The ${step.step} handover requires an assigned user`);
      }
      if (!step.assigneeRoleKey) {
        throw new HttpException(409, `The ${step.step} handover names no required handler role`);
      }
      const handler = await this.handlerDirectory.assertHandlerHoldsRole(req.user, data.assignedUserId, step.assigneeRoleKey);
      return handler.name;
    }

    const { managers, location } = await this.resolveManagersForErrand(req, municipalityId, errand, metadata);
    return this.pickManager(step, data, managers, location);
  }

  /**
   * The caller picks from the managers a place actually has. Validating the choice against that
   * same list is what keeps a hand-written request from assigning anybody else.
   */
  private pickManager(
    step: InvestigationHandoverStepDefinition,
    data: InvestigationHandoverDto,
    managers: readonly ManagerCandidate[],
    location: ErrandLocation,
  ): string {
    if (managers.length === 0) {
      throw new HttpException(409, `No manager is configured for ${location.displayName}`);
    }
    if (!data.assignedUserId?.trim()) {
      throw new HttpException(400, `The ${step.step} handover requires an assigned user`);
    }
    const chosen = managers.find(manager => manager.adAccount.toLowerCase() === data.assignedUserId!.trim().toLowerCase());
    if (!chosen) {
      throw new HttpException(400, `The selected handler is not a manager for ${location.displayName}`);
    }
    return chosen.adAccount;
  }

  /**
   * The place a move goes to, checked against the errand it is applied to.
   *
   * An errand with the LEX roles is not moved: the LEX label, not the location, is what gives them
   * access, and the manager the move would assign could not act on it until it was handed back.
   * The investigator returns it first, and the manager who receives it moves it.
   */
  private requireLocationTarget(errand: SupportErrand, metadata: SupportMetadata, locationLabelId: string | undefined): InvestigationLocationTarget {
    if (!locationLabelId?.trim()) {
      throw new HttpException(400, 'The move-location handover requires a target place');
    }
    const labelStructure = metadata.labels?.labelStructure;
    if (hasInvestigationAccessLexLabel(errand.labels, labelStructure)) {
      throw new HttpException(409, 'The errand is with the LEX roles; it has to be returned to a manager before it can be moved');
    }
    return resolveInvestigationLocationTarget(labelStructure, locationLabelId.trim());
  }

  /**
   * The managers for the errand's place.
   *
   * Both halves come from AccessMapper: the access patterns say who reaches the place, and
   * `access/ad/{adId}?type=role` says which of them is a manager. Names are not in AccessMapper, so
   * they are read from Active Directory afterwards and only for the accounts that survived.
   */
  private async resolveManagersForErrand(
    req: RequestWithUser,
    municipalityId: string,
    errand: SupportErrand,
    metadata: SupportMetadata,
  ): Promise<{ location: ErrandLocation; managers: ManagerCandidate[] }> {
    const location = resolveErrandLocation(errand.labels, metadata.labels?.labelStructure);
    return { location, managers: await this.resolveManagersForLocation(req, municipalityId, location) };
  }

  /** The managers for one place, whether it is the errand's current place or the one it is moved to. */
  private async resolveManagersForLocation(req: RequestWithUser, municipalityId: string, location: ErrandLocation): Promise<ManagerCandidate[]> {
    const locationAccounts = await this.accessMapperService.findLocationAccessCandidates(
      req.user,
      municipalityId,
      this.namespace!,
      location.resourcePath,
    );

    const roleEntries = await Promise.all(
      locationAccounts.map(
        async account =>
          [account.trim().toLowerCase(), await readAccessMapperRoles(this.apiService, req.user, municipalityId, this.namespace!, account)] as const,
      ),
    );
    const rolesByAccount = new Map<string, readonly string[]>(roleEntries);

    const managerAccounts = locationAccounts.filter(account =>
      (rolesByAccount.get(account.trim().toLowerCase()) ?? []).some(findInvestigationManagerRole),
    );
    const displayNames = await this.handlerDirectory.lookupDisplayNames(req.user, managerAccounts);

    return resolveLocationManagers({ locationAccounts, rolesByAccount, displayNames });
  }

  /** Support Management exposes no transition graph, so the target status is checked against metadata. */
  private requireAvailableStatus(metadata: SupportMetadata, status: string): string {
    if (!metadata.statuses) throw new HttpException(502, 'Support Management metadata is missing statuses');
    if (!metadata.statuses.some(candidate => candidate.name === status && !candidate.deprecated)) {
      throw new HttpException(400, `Status ${status} is not available in Support Management metadata`);
    }
    return status;
  }
}
