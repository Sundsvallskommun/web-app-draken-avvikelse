import { Type as TypeTransformer } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import { Body, Controller, Get, HeaderParam, HttpCode, Param, Patch, Post, QueryParam, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID, SUPERADMIN_GROUP, SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName, hasSupportManagementErrandSearch, resolveSupportManagementErrandSearch } from '@/config/api-config';
import { resolveHandlerGroupRoles } from '@/config/handler-group-roles';
import {
  preservesIafVofInvestigationClassificationOwnerParameter,
  resolveIafVofInvestigationClassificationOwner,
} from '@/config/iaf-vof-investigation-classification';
import { IAF_VOF_PERMANENT_LABELS } from '@/config/iaf-vof-permanent-labels';
import {
  ContactChannel,
  Errand as SupportErrand,
  ErrandAction,
  ErrandPhase,
  ExternalTag,
  Label,
  Labels as SupportLabels,
  MetadataResponse as SupportMetadata,
  PageErrand,
  Parameter,
  Priority as SupportPriority,
  Stakeholder as SupportStakeholder,
  Suspension,
} from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { ExternalIdType } from '@/interfaces/externalIdType.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import { AccessMapperService } from '@/services/access-mapper.service';
import { readRoleGroups } from '@/services/ad-role.service';
import ApiService from '@/services/api.service';
import { EmploymentService } from '@/services/employment.service';
import { withPermanentLabelsKept } from '@/services/errand-label-presence';
import { resolveInvestigationLocationTarget } from '@/services/investigation-handover-label.service';
import {
  RegistrationLocation,
  RegistrationReportType,
  resolveEmploymentLocations,
  resolveRegistrationLabelsByIds,
  resolveRegistrationLocations,
  resolveRegistrationReportTypes,
} from '@/services/investigation-registration.service';
import { OrganizationService } from '@/services/organization.service';
import { ownHandlerParameterKeys } from '@/services/own-errands-filter';
import {
  assertRequestedErrandVersion,
  assertSupportErrandAdminAssignable,
  assertSupportErrandWritable,
  buildSupportErrandClassificationUpdateBody,
  CLOSED_SUPPORT_ERRAND_STATUS,
  ErrandFilterInput,
  findInitialSupportErrandPhase,
  getErrandVersion,
  NEW_ERRAND_DEFAULTS,
  NewErrandDefaults,
  requireStrongErrandVersion,
  resolvePhaseStatus,
  resolveSupportErrandClassification,
  resolveSupportErrandStatusTransition,
  stripErrandVersions,
  SupportStakeholderRole,
} from '@/services/support-errand.service';
import { parseStatusGroups, SupportErrandListingService, SupportErrandStatusGroupCounts } from '@/services/support-errand-listing.service';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import {
  assertSupportInvestigationClassificationContext,
  selectErrandClassificationIndex,
} from '@/services/support-investigation-classification-context.service';
import {
  assertHslAnalysisFinishedBeforeClose,
  assertMayCloseReportedMisconduct,
  assertMayStartFollowUp,
  resolveEarlyCloseServiceNote,
} from '@/services/support-investigation-decision-readiness';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { SupportJsonParameterService } from '@/services/support-json-parameter.service';
import { assertMeasuresHandledBeforeClose } from '@/services/support-measure-closing';
import { supportMetadataCache } from '@/services/support-metadata-cache';
import { assertCanWriteSupportServiceNote, buildSupportServiceNote } from '@/services/support-note.service';
import { followErrandWithAssignee, SupportSubscriberApi } from '@/services/support-subscriber.service';
import { logger } from '@/utils/logger';
import { apiURL, luhnCheck, withRetries } from '@/utils/util';

enum Status {
  NEW = 'NEW',
  ONGOING = 'ONGOING',
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  SOLVED = 'SOLVED',
}

const assertGenericUpdateFields = (data: Partial<SupportErrandDto>): void => {
  if (data.activePhaseId !== undefined) {
    throw new HttpException(400, 'Use the phase transition endpoint to change the active phase');
  }
  if (data.status !== undefined || data.resolution !== undefined || data.suspension !== undefined) {
    throw new HttpException(400, 'Use the status transition endpoint to change status, resolution or suspension');
  }
  if (data.assignedUserId !== undefined) {
    throw new HttpException(400, 'Use the administrator endpoint to change the assigned user');
  }
};

class CExternalTag implements ExternalTag {
  @IsString()
  key!: string;
  @IsString()
  value!: string;
}

class CParameter implements Parameter {
  @IsString()
  key!: string;
  @IsString()
  @IsOptional()
  displayName?: string;
  @IsString()
  @IsOptional()
  group?: string;
  @IsArray()
  @IsOptional()
  values!: string[];
  // Optimistic locking version, set by SupportManagement. Accepted here because the frontend echoes
  // fetched errands back, but stripped before we forward (SupportManagement rejects it on update).
  @IsNumber()
  @IsOptional()
  version?: number;
}

export class CContactChannel implements ContactChannel {
  @IsString()
  @IsOptional()
  type?: string;
  @IsString()
  @IsOptional()
  value?: string;
}

export class CSupportStakeholder implements SupportStakeholder {
  @IsString()
  @IsOptional()
  externalId?: string;
  @IsString()
  @IsOptional()
  externalIdType?: ExternalIdType;
  @IsString()
  @IsOptional()
  role?: string;
  @IsString()
  @IsOptional()
  city?: string;
  @IsString()
  @IsOptional()
  organizationName?: string;
  @IsString()
  @IsOptional()
  firstName?: string;
  @IsString()
  @IsOptional()
  lastName?: string;
  @IsString()
  @IsOptional()
  address?: string;
  @IsString()
  @IsOptional()
  careOf?: string;
  @IsString()
  @IsOptional()
  zipCode?: string;
  @IsString()
  @IsOptional()
  country?: string;
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @TypeTransformer(() => CContactChannel)
  contactChannels!: CContactChannel[];
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @TypeTransformer(() => CParameter)
  parameters!: Parameter[];
}

export class Classification {
  @IsString()
  category!: string;
  @IsString()
  type!: string;
}

export class RequiredClassificationDto {
  @IsString()
  @MinLength(1)
  category!: string;

  @IsString()
  @MinLength(1)
  type!: string;
}

export class ClassificationLabelReferenceDto {
  @IsString()
  @MinLength(1)
  id!: string;
}

/** One classification of the errand: the category path chosen in one legal base group. */
export class InvestigationClassificationSelectionDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @TypeTransformer(() => RequiredClassificationDto)
  @JSONSchema({ $ref: '#/components/schemas/RequiredClassificationDto' })
  classification!: RequiredClassificationDto;

  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @TypeTransformer(() => ClassificationLabelReferenceDto)
  @JSONSchema({ type: 'array', items: { $ref: '#/components/schemas/ClassificationLabelReferenceDto' } })
  categoryLabels!: ClassificationLabelReferenceDto[];
}

export class UpdateSupportErrandClassificationDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  /** One classification per legal base group the investigation's legal bases reach. */
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @TypeTransformer(() => InvestigationClassificationSelectionDto)
  @JSONSchema({ type: 'array', items: { $ref: '#/components/schemas/InvestigationClassificationSelectionDto' } })
  classifications!: InvestigationClassificationSelectionDto[];

  @IsString()
  @MinLength(1)
  documentKey!: string;

  @IsString()
  @Matches(/^"(0|[1-9]\d*)"$/u)
  documentETag!: string;
}

export class CSuspension implements Suspension {
  @IsString()
  @IsOptional()
  suspendedFrom!: string;
  @IsString()
  @IsOptional()
  suspendedTo!: string;
}

export class UpdateSupportErrandStatusDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  expectedStatus!: string;

  @IsString()
  @MinLength(1)
  status!: string;

  @IsString()
  @IsOptional()
  resolution?: string;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @TypeTransformer(() => CSuspension)
  @JSONSchema({ $ref: '#/components/schemas/CSuspension' })
  suspension?: CSuspension;

  /** Why the errand is closed before its workflow ends, where that has to be said; kept as a service note. */
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  closingMotivation?: string;
}

export class AssignSupportErrandDto {
  @IsString()
  @MinLength(1)
  assignedUserId!: string;
}

export class CErrandAction implements ErrandAction {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  @IsOptional()
  actionName?: string;
  @IsString()
  @IsOptional()
  executeAfter?: string;
  @IsString()
  @IsOptional()
  actionConfigId?: string;
  @IsString()
  @IsOptional()
  displayValue?: string;
}
export class CErrandPhase implements ErrandPhase {
  @IsString()
  @IsOptional()
  phaseId?: string;
  @IsString()
  @IsOptional()
  name?: string;
  @IsString()
  @IsOptional()
  displayName?: string;
  @IsString()
  @IsOptional()
  started?: string;
  @IsString()
  @IsOptional()
  ended?: string;
}
export class SupportErrandDto implements Partial<SupportErrand> {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  @IsOptional()
  errandNumber?: string;
  @IsString()
  @IsOptional()
  title?: string;
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @TypeTransformer(() => CSupportStakeholder)
  stakeholders!: CSupportStakeholder[];
  @IsString()
  @IsOptional()
  priority?: SupportPriority;
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @TypeTransformer(() => CExternalTag)
  externalTags!: ExternalTag[];
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @TypeTransformer(() => CParameter)
  parameters!: Parameter[];
  // jsonParameters is intentionally absent: investigation documents are written only through the
  // per-key endpoints in SupportErrandJsonParameterController, which enforce If-Match versioning.
  @TypeTransformer(() => Classification)
  @ValidateNested()
  @IsObject()
  @IsOptional()
  classification?: Classification;
  @IsOptional()
  @IsString()
  status?: string;
  @IsOptional()
  @IsString()
  resolution?: string;
  @IsOptional()
  @IsString()
  description?: string;
  @IsOptional()
  @IsString()
  channel?: string;
  @IsString()
  @IsOptional()
  reporterUserId?: string;
  @IsString()
  @IsOptional()
  assignedUserId?: string;
  @IsString()
  @IsOptional()
  assignedGroupId?: string;
  @IsOptional()
  @IsString()
  escalationEmail?: string;
  @IsOptional()
  @IsString()
  contactReason?: string;
  @IsOptional()
  @IsString()
  contactReasonDescription?: string;
  @TypeTransformer(() => CSuspension)
  @ValidateNested()
  @IsObject()
  @IsOptional()
  suspension?: CSuspension;
  @IsOptional()
  @IsBoolean()
  businessRelated?: boolean;
  @IsOptional()
  @IsArray()
  labels?: Label[];
  @IsOptional()
  @IsString()
  created?: string;
  @IsOptional()
  @IsString()
  modified?: string;
  @IsOptional()
  @IsString()
  touched?: string;
  // Optimistic locking version, set by SupportManagement. Accepted here because the frontend echoes
  // fetched errands back, but stripped before we forward (SupportManagement rejects it on update).
  @IsNumber()
  @IsOptional()
  version?: number;
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @TypeTransformer(() => CErrandAction)
  actions?: CErrandAction[];
  @IsString()
  @IsOptional()
  activePhaseId?: string;
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @TypeTransformer(() => CErrandPhase)
  phases?: CErrandPhase[];
}

/**
 * Where the places a handler may register for come from: their employment in the organization tree,
 * or the places AccessMapper configures for their account when no employment is a place there.
 */
type RegistrationLocationSource = 'employment' | 'access';

interface HandlerLocations {
  readonly source: RegistrationLocationSource;
  readonly locations: readonly RegistrationLocation[];
}

/** What the registration form offers the signed-in handler. */
export interface NewErrandOptionsResponse {
  readonly reportTypes: readonly RegistrationReportType[];
  readonly locations: readonly RegistrationLocation[];
  readonly locationSource?: RegistrationLocationSource;
  readonly priorities: readonly SupportPriority[];
}

/**
 * What the handler chose in the registration form. Every field is optional on the wire: which of them the
 * form asks for is the form's to say, and a missing choice is refused with a message the handler can act on.
 */
export class NewSupportErrandDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  locationLabelId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reportTypeLabelId?: string;

  @IsOptional()
  @IsIn(Object.values(SupportPriority))
  priority?: SupportPriority;
}

@Controller()
@UseBefore(hasPermissions(['canEditSupportManagement']))
export class SupportErrandController {
  private apiService = new ApiService();
  private organizationService = new OrganizationService();
  private investigationPolicyService = new SupportInvestigationPolicyService();
  private handlerRoles = resolveHandlerGroupRoles();
  private superadminGroups = readRoleGroups(SUPERADMIN_GROUP);
  private investigationAccessService = new SupportInvestigationAccessService();
  private jsonParameterService = new SupportJsonParameterService({ namespace: SUPPORTMANAGEMENT_NAMESPACE ?? '' });
  private accessMapperService = new AccessMapperService();
  private employmentService = new EmploymentService();
  private newErrandDefaults: NewErrandDefaults = NEW_ERRAND_DEFAULTS;
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  private errandSearch = resolveSupportManagementErrandSearch();
  private countSearch = hasSupportManagementErrandSearch();
  SERVICE = apiServiceName('supportmanagement');
  CITIZEN_SERVICE = apiServiceName('citizen');

  /**
   * Resolves a free-text query that looks like an organization or personal number into a party id,
   * so that errands can also be matched on `stakeholders.externalId`. Returns '' when the query is
   * not an identifier or the lookup fails - a failed lookup must not fail the search itself.
   */
  private async resolveQueryPartyId(req: RequestWithUser, queryRaw?: string): Promise<string> {
    if (!queryRaw) return '';
    const normalizedIdentifier = queryRaw.replace(/\D/g, '');
    if (normalizedIdentifier.length === 10 && luhnCheck(normalizedIdentifier) && Number(normalizedIdentifier[2]) > 1) {
      return this.organizationService.getPartyIdByOrganizationNumber(MUNICIPALITY_ID!, normalizedIdentifier, req.user).catch(() => '');
    }
    if ((normalizedIdentifier.length === 10 || normalizedIdentifier.length === 12) && luhnCheck(normalizedIdentifier)) {
      const guidUrl = `${this.CITIZEN_SERVICE}/${MUNICIPALITY_ID}/${normalizedIdentifier}/guid`;
      return this.apiService
        .get<string>({ url: guidUrl }, req.user)
        .then(response => response.data)
        .catch(() => '');
    }
    return '';
  }

  /**
   * The overview's criteria as the listing asks them: the party id its query names, if any, resolved, and Mina
   * ärenden widened to the handler parameters that name the user - MAS/MAR's own errands. The list and its counts
   * both come through here, so they always agree.
   */
  private async resolveOverviewCriteria(req: RequestWithUser, criteria: ErrandFilterInput): Promise<ErrandFilterInput> {
    const stakeholderParameterKeys = ownHandlerParameterKeys(
      criteria.stakeholders,
      req.user,
      this.investigationPolicyService.handlerParameters,
      this.handlerRoles,
    );
    return {
      ...criteria,
      partyId: await this.resolveQueryPartyId(req, criteria.query),
      ...(stakeholderParameterKeys ? { stakeholderParameterKeys } : {}),
    };
  }

  /** Built per call from the controller's own collaborators, so a test that replaces `apiService` reaches it too. */
  private subscriberApi(): SupportSubscriberApi {
    return { apiService: this.apiService, service: this.SERVICE, namespace: this.namespace };
  }

  /**
   * Built per request from the controller's own collaborators, so a test that replaces `apiService`
   * or the investigation policy reaches the listing too.
   */
  private errandListing(): SupportErrandListingService {
    return new SupportErrandListingService({
      apiService: this.apiService,
      service: this.SERVICE,
      namespace: this.namespace,
      labelFilterProfile: this.investigationPolicyService.labelFilter,
      errandSearch: this.errandSearch,
      countSearch: this.countSearch,
    });
  }

  /** A citizen party id can be resolved to a personal number only for these stakeholder types. */
  private hasResolvablePersonNumber(s: SupportStakeholder): boolean {
    return !!s.externalId && (s.externalIdType === ExternalIdType.PRIVATE || s.externalIdType === ExternalIdType.EMPLOYEE);
  }

  /**
   * Enriches an errand's stakeholders with their personal numbers, resolved from the citizen service.
   * Returns new objects - neither the errand nor its stakeholders are mutated. A failed lookup leaves
   * the stakeholder without a personNumber rather than failing the whole response.
   */
  preparedErrandResponse = async (errandData: SupportErrand, req: any) => {
    const stakeholders = errandData.stakeholders;
    if (!stakeholders?.length) {
      return { data: errandData, message: 'success' };
    }

    const personNumberOf = (s: SupportStakeholder) =>
      this.apiService.get<string>({ url: `${this.CITIZEN_SERVICE}/${MUNICIPALITY_ID}/${s.externalId}/personnumber` }, req.user);

    // The first PRIMARY stakeholder is the customer; every non-PRIMARY one is a contact. Any further
    // PRIMARY stakeholders are neither, and are passed through untouched.
    const customerIndex = stakeholders.findIndex(s => s.role === SupportStakeholderRole.PRIMARY);

    const enriched = await Promise.all(
      stakeholders.map(async (s, i): Promise<SupportStakeholder & { personNumber?: string }> => {
        const isCustomer = i === customerIndex;
        const isContact = s.role !== SupportStakeholderRole.PRIMARY;
        if ((!isCustomer && !isContact) || !this.hasResolvablePersonNumber(s)) {
          return s;
        }
        if (isCustomer) {
          // NOTE the asymmetry with the contact branch below: the customer's personNumber is
          // stringified, a contact's is passed through as the citizen service returned it (a
          // number). Pre-existing behaviour the frontend relies on - do not "tidy" without checking.
          const res = await personNumberOf(s)
            .then(r => ({ data: `${r.data}` }))
            .catch(_e => ({ data: undefined }));
          return res.data === undefined ? s : { ...s, personNumber: res.data };
        }
        // Contacts are retried, since a whole page of them is resolved at once.
        const res = await withRetries(3, () => personNumberOf(s).catch(_e => ({ data: undefined, message: '404' })));
        const personNumber = typeof res === 'object' && res !== null ? (res as { data?: string }).data : undefined;
        return personNumber === undefined ? s : { ...s, personNumber };
      }),
    );

    return { data: { ...errandData, stakeholders: enriched }, message: 'success' };
  };

  @Get('/supporterrands/errandnumber/:errandNumber')
  @OpenAPI({ summary: 'Return an errand by number' })
  @UseBefore(authMiddleware)
  async getSupportErrandByErrandNumber(
    @Req() req: RequestWithUser,
    @Param('errandNumber') errandNumber: string,
    @Res() response: any,
  ): Promise<SupportErrand> {
    const url = `${this.SERVICE}/${MUNICIPALITY_ID}/${this.namespace}/errands?filter=errandNumber:'${errandNumber}'`;
    const errandResponse = await this.apiService.get<any>({ url }, req.user);
    const errandData = errandResponse.data.content[0];
    return response.send((await this.preparedErrandResponse(errandData, req)).data);
  }

  @Get('/supporterrands/:id')
  @OpenAPI({ summary: 'Return an errand by id' })
  @UseBefore(authMiddleware)
  async errand(@Req() req: RequestWithUser, @Param('id') id: string, @Res() response: any): Promise<SupportErrand> {
    const url = `${this.SERVICE}/${MUNICIPALITY_ID}/${this.namespace}/errands/${id}`;
    const errandResponse = await this.apiService.get<SupportErrand>({ url }, req.user);
    const errandData = errandResponse.data;

    return response.send((await this.preparedErrandResponse(errandData, req)).data);
  }

  @Get('/supporterrands')
  @OpenAPI({ summary: 'Return all support errands for municipality' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']))
  async errands(
    @Req() req: RequestWithUser,
    @QueryParam('page') page: number,
    @QueryParam('size') size: number,
    @QueryParam('query') query: string,
    @QueryParam('stakeholders') stakeholders: string,
    @QueryParam('priority') priority: string,
    @QueryParam('category') category: string,
    @QueryParam('type') type: string,
    @QueryParam('labelCategory') labelCategory: string,
    @QueryParam('labelType') labelType: string,
    @QueryParam('labelSubType') labelSubType: string,
    @QueryParam('labelFilter') labelFilter: string,
    @QueryParam('channel') channel: string,
    @QueryParam('status') status: string,
    @QueryParam('resolution') resolution: string,
    @QueryParam('start') start: string,
    @QueryParam('end') end: string,
    @QueryParam('sort') sort: string,
    @Res() response: any,
  ): Promise<PageErrand> {
    const criteria = await this.resolveOverviewCriteria(req, {
      query,
      stakeholders,
      priority,
      category,
      type,
      labelCategory,
      labelType,
      labelSubType,
      labelFilter,
      channel,
      status,
      resolution,
      start,
      end,
    });
    const errands = await this.errandListing().list(MUNICIPALITY_ID, criteria, { page: page || 0, size: size || 8, sort }, req.user);
    return response.status(200).send(errands);
  }

  @Get('/countsupporterrands/statusgroups')
  @OpenAPI({ summary: 'Counts the errands matching the filters in each group of statuses, in the order the groups are given' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']))
  async countErrandsByStatusGroups(
    @Req() req: RequestWithUser,
    @QueryParam('statusGroups') statusGroups: string,
    @QueryParam('query') query: string,
    @QueryParam('stakeholders') stakeholders: string,
    @QueryParam('priority') priority: string,
    @QueryParam('category') category: string,
    @QueryParam('type') type: string,
    @QueryParam('labelCategory') labelCategory: string,
    @QueryParam('labelType') labelType: string,
    @QueryParam('labelSubType') labelSubType: string,
    @QueryParam('labelFilter') labelFilter: string,
    @QueryParam('channel') channel: string,
    @QueryParam('resolution') resolution: string,
    @QueryParam('start') start: string,
    @QueryParam('end') end: string,
    @Res() response: any,
  ): Promise<SupportErrandStatusGroupCounts> {
    const groups = parseStatusGroups(statusGroups);
    const criteria = await this.resolveOverviewCriteria(req, {
      query,
      stakeholders,
      priority,
      category,
      type,
      labelCategory,
      labelType,
      labelSubType,
      labelFilter,
      channel,
      resolution,
      start,
      end,
    });
    const counts = await this.errandListing().countByStatusGroups(MUNICIPALITY_ID, criteria, groups, req.user);
    return response.status(200).send({ counts });
  }

  @Post('/newerrand')
  @HttpCode(201)
  @OpenAPI({ summary: 'Initiate a new support errand' })
  @UseBefore(authMiddleware, validationMiddleware(NewSupportErrandDto, 'body'))
  async registerSupportErrand(
    @Req() req: RequestWithUser,
    @Body() data: NewSupportErrandDto,
    @Res() response: any,
  ): Promise<{ data: SupportErrandDto; message: string }> {
    const defaults = await this.assertRegistrationEnabled();

    // The whole metadata rather than just its labels: a new errand also needs the phase it starts in.
    const metadataRes = await this.readSupportMetadata(req, MUNICIPALITY_ID);

    // An errand created without a phase stands outside the workflow, and the phase strip has nothing
    // to advance from. A namespace with no phases configured simply has no workflow, and the errand
    // is created without one as before.
    const initialPhase = findInitialSupportErrandPhase(metadataRes.data.phases);
    const initialStatus = initialPhase ? (resolvePhaseStatus(Status.NEW, initialPhase) ?? Status.NEW) : Status.NEW;

    const registration = await this.resolveRegistrationChoice(req, MUNICIPALITY_ID, data, metadataRes.data);

    const url = `${MUNICIPALITY_ID}/${this.namespace}/errands`;
    const baseURL = apiURL(this.SERVICE);
    const body: Partial<SupportErrandDto> = {
      reporterUserId: req.user.username,
      assignedUserId: req.user.username,
      labels: registration.labels,
      parameters: defaults.parameters.map(parameter => ({ ...parameter })),
      ...(initialPhase?.id ? { activePhaseId: initialPhase.id } : {}),
      priority: registration.priority,
      status: initialStatus,
      channel: defaults.channel,
      title: 'Empty errand',
    };
    const res = await this.apiService.post<any, Partial<SupportErrandDto>>({ url, baseURL, data: body }, req.user).catch(e => {
      logger.error('Error when initiating support errand');
      logger.error(e);
      throw e;
    });
    if (!res.data || res.data === '') {
      console.error('Something went wrong when initiating support errand');
      logger.error('Something went wrong when initiating support errand');
      return response.status(500).send('Something went wrong when initiating support errand');
    }
    if (this.investigationPolicyService.assigneeFollowsErrand && res.data.id) {
      await followErrandWithAssignee(
        this.subscriberApi(),
        { municipalityId: MUNICIPALITY_ID, errandId: res.data.id, nextAssignee: req.user.username },
        req.user,
      );
    }
    return response.status(201).send(res.data);
  }

  /**
   * What the registration form offers the signed-in handler: the report types the application
   * configures, and the places their employment - or else their AccessMapper configuration - gives.
   */
  @Get('/newerrand/options')
  @OpenAPI({ summary: 'The choices the registration form offers the signed-in handler' })
  @UseBefore(authMiddleware)
  async getNewErrandOptions(@Req() req: RequestWithUser): Promise<NewErrandOptionsResponse> {
    const { form } = await this.assertRegistrationEnabled();

    const metadata = await this.readSupportMetadata(req, MUNICIPALITY_ID);
    const labelStructure = metadata.data.labels?.labelStructure;

    const handlerLocations = form.location ? await this.resolveHandlerLocations(req, MUNICIPALITY_ID, labelStructure) : undefined;
    return {
      reportTypes: resolveRegistrationReportTypes(labelStructure, form.reportTypes),
      locations: handlerLocations?.locations ?? [],
      ...(handlerLocations ? { locationSource: handlerLocations.source } : {}),
      priorities: form.priority ? Object.values(SupportPriority) : [],
    };
  }

  /** Refuses while the registration policy cannot be resolved, and hands back what errands are registered with. */
  private async assertRegistrationEnabled(): Promise<NewErrandDefaults> {
    const registrationState = await this.investigationPolicyService.getRegistrationState();
    if (registrationState === 'unavailable') {
      throw new HttpException(503, 'Support errand registration policy is temporarily unavailable');
    }
    return this.newErrandDefaults;
  }

  private readSupportMetadata(req: RequestWithUser, municipalityId: string) {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/metadata`;
    return supportMetadataCache.read<SupportMetadata>(this.apiService, { url }, req.user);
  }

  /**
   * The places the signed-in handler may register an errand for, as the form offers them: the unit
   * their employment puts them at in the organization tree, main employment first. A handler whose
   * employment is no place there - or whose employments cannot be read - picks among the places
   * AccessMapper configures for their account, as registration always offered.
   */
  private async resolveHandlerLocations(
    req: RequestWithUser,
    municipalityId: string,
    labelStructure: Label[] | undefined,
  ): Promise<HandlerLocations> {
    const employmentLocations = resolveEmploymentLocations(labelStructure, await this.readEmploymentOrganizationIds(req));
    if (employmentLocations.length > 0) return { source: 'employment', locations: employmentLocations };

    const patterns = await this.accessMapperService.findAccountLabelPatterns(req.user, municipalityId, this.namespace!, req.user.username);
    return { source: 'access', locations: resolveRegistrationLocations(labelStructure, patterns) };
  }

  private async readEmploymentOrganizationIds(req: RequestWithUser): Promise<number[]> {
    try {
      const employments = await this.employmentService.readEmployments(req.user);
      return employments.map(employment => employment.orgId).filter((organizationId): organizationId is number => typeof organizationId === 'number');
    } catch (error) {
      // The Employee API being unavailable must not stop registration; the configured places still are.
      logger.warn('Could not read the employments of a registering handler; offering their configured places instead', error);
      return [];
    }
  }

  /**
   * The labels and priority the handler chose.
   *
   * The place is checked against the places the handler is offered rather than taken on the client's
   * word: the form only ever offers their places, so a request naming another one is not a handler
   * who changed their mind. The report type likewise has to be one the application configures - it
   * decides which investigation the errand gets, so it is not a free label.
   */
  private async resolveRegistrationChoice(
    req: RequestWithUser,
    municipalityId: string,
    data: NewSupportErrandDto,
    metadata: SupportMetadata,
  ): Promise<{ labels: Label[]; priority: SupportPriority }> {
    const { form } = this.newErrandDefaults;
    const labelStructure = metadata.labels?.labelStructure;
    const reportTypes = resolveRegistrationReportTypes(labelStructure, form.reportTypes);
    const reportType = reportTypes.find(candidate => candidate.labelId === data.reportTypeLabelId);
    if (!reportType) {
      throw new HttpException(400, 'Choose what is being reported');
    }

    const labelIds = [...reportType.chainIds];

    if (form.location) {
      const { locations } = await this.resolveHandlerLocations(req, municipalityId, labelStructure);
      const location = locations.find(candidate => candidate.labelId === data.locationLabelId);
      if (!location) {
        throw new HttpException(400, 'Choose one of the places offered to you');
      }
      labelIds.push(...resolveInvestigationLocationTarget(labelStructure, location.labelId).chainIds);
    }

    return {
      labels: resolveRegistrationLabelsByIds(labelStructure, [...new Set(labelIds)]),
      priority: form.priority ? (data.priority ?? SupportPriority.MEDIUM) : SupportPriority.MEDIUM,
    };
  }

  private async assertGenericClassificationUpdateAllowed(
    req: RequestWithUser,
    currentErrand: SupportErrand,
    data: Partial<SupportErrandDto>,
  ): Promise<void> {
    const classificationFieldsRequested = data.classification !== undefined || data.labels !== undefined;
    const policy = this.investigationPolicyService.iafVofClassificationPolicy;
    if (!classificationFieldsRequested && (data.parameters === undefined || !policy)) return;

    const owner = await this.investigationPolicyService.getClassificationOwner();
    if (owner === 'unavailable') {
      throw new HttpException(503, 'Investigation classification ownership is temporarily unavailable');
    }
    if (owner !== 'investigation') return;
    if (classificationFieldsRequested) {
      throw new HttpException(409, 'Use the investigation classification endpoint to update classification and labels');
    }
    if (policy && !preservesIafVofInvestigationClassificationOwnerParameter(currentErrand.parameters, data.parameters)) {
      throw new HttpException(409, 'The investigation classification owner parameter cannot be changed through the generic errand endpoint');
    }
  }

  /**
   * Where the profile has a report, the channel says whether the errand was registered in Draken and
   * so whether its report may be filled in. It stays what it was when the errand came in: changing it
   * would open Katla's report, the record of what was reported, to editing.
   */
  private assertChannelUnchanged(currentErrand: SupportErrand, data: Partial<SupportErrandDto>): void {
    if (!this.investigationPolicyService.profile.reportDocument) return;
    if (data.channel === undefined || data.channel === currentErrand.channel) return;
    throw new HttpException(409, 'The channel of this errand decides whether its report may be changed and cannot itself be changed');
  }

  /**
   * The labels a generic errand write sends, with every permanent label the errand carries kept on it
   * (`IAF_VOF_PERMANENT_LABELS`). Only a write that leaves out a label the errand carries reads the label metadata.
   */
  private async keepPermanentLabels(
    req: RequestWithUser,
    municipalityId: string,
    currentLabels: SupportErrand['labels'],
    labels: NonNullable<SupportErrandDto['labels']>,
  ): Promise<NonNullable<SupportErrandDto['labels']>> {
    const sentIds = new Set(labels.map(label => label.id));
    if ((currentLabels ?? []).every(label => sentIds.has(label.id))) return labels;
    const labelMetadata = await supportMetadataCache.read<SupportLabels | null>(
      this.apiService,
      { url: `${municipalityId}/${this.namespace}/metadata/labels`, baseURL: apiURL(this.SERVICE), propagateClientError: true },
      req.user,
    );
    return withPermanentLabelsKept({
      labels,
      currentLabels,
      labelStructure: labelMetadata.data?.labelStructure,
      permanentResourcePaths: IAF_VOF_PERMANENT_LABELS,
    });
  }

  @Patch('/supporterrands/:id')
  @OpenAPI({ summary: 'Update a support errand' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(SupportErrandDto, 'body'))
  async updateSupportErrand(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @HeaderParam('If-Match') ifMatch: string,
    @Body() data: Partial<SupportErrandDto>,
    @Res() response: any,
  ): Promise<{ data: any; message: string }> {
    assertGenericUpdateFields(data);
    const requestedVersion = requireStrongErrandVersion(ifMatch);
    const url = `${MUNICIPALITY_ID}/${this.namespace}/errands/${id}`;
    const baseURL = apiURL(this.SERVICE);
    const currentErrand = await this.apiService.get<SupportErrand>(
      { url, baseURL, includeResponseHeaders: true, propagateClientError: true },
      req.user,
    );
    const currentVersion = getErrandVersion(currentErrand.data, currentErrand.headers?.etag);
    assertRequestedErrandVersion(requestedVersion, currentVersion);
    assertSupportErrandWritable(currentErrand.data, 'generic changes');
    this.assertChannelUnchanged(currentErrand.data, data);

    await this.assertGenericClassificationUpdateAllowed(req, currentErrand.data, data);
    const body: Partial<SupportErrandDto> = stripErrandVersions({ ...data });
    if (body.labels) body.labels = await this.keepPermanentLabels(req, MUNICIPALITY_ID, currentErrand.data.labels, body.labels);
    const res = await this.apiService
      .patch<any, Partial<SupportErrandDto>>(
        {
          url,
          baseURL,
          data: body,
          headers: { 'If-Match': `"${currentVersion}"` },
          followLocation: false,
          propagateClientError: true,
        },
        req.user,
      )
      .catch(e => {
        logger.error('Error when registering support errand');
        logger.error(e);
        throw e;
      });
    return response.status(200).send(res.data);
  }

  @Patch('/supporterrands/:id/status')
  @HttpCode(200)
  @OpenAPI({ summary: 'Apply one explicit status transition to a support errand' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(UpdateSupportErrandStatusDto, 'body'))
  async updateSupportErrandStatus(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() data: UpdateSupportErrandStatusDto,
    @Res() response: any,
  ): Promise<any> {
    const url = `${MUNICIPALITY_ID}/${this.namespace}/errands/${id}`;
    const metadataUrl = `${MUNICIPALITY_ID}/${this.namespace}/metadata`;
    const baseURL = apiURL(this.SERVICE);
    const [currentErrand, metadata] = await Promise.all([
      this.apiService.get<SupportErrand>({ url, baseURL, includeResponseHeaders: true, propagateClientError: true }, req.user),
      supportMetadataCache.read<SupportMetadata>(this.apiService, { url: metadataUrl, baseURL, propagateClientError: true }, req.user),
    ]);
    const currentVersion = getErrandVersion(currentErrand.data, currentErrand.headers?.etag);
    if (currentVersion !== data.expectedVersion) {
      throw new HttpException(409, 'Support errand status has changed since it was loaded');
    }
    const assertMeasuresHandled = () =>
      assertMeasuresHandledBeforeClose({
        apiService: this.apiService,
        user: req.user,
        errandUrl: url,
        baseURL,
        status: data.status,
      });
    await assertMeasuresHandled();
    await assertHslAnalysisFinishedBeforeClose({
      policyService: this.investigationPolicyService,
      documentService: this.jsonParameterService,
      user: req.user,
      municipalityId: MUNICIPALITY_ID,
      errandId: id,
      errand: currentErrand.data,
      closes: data.status === CLOSED_SUPPORT_ERRAND_STATUS,
    });

    const { phaseSteps = [], ...body } = resolveSupportErrandStatusTransition(currentErrand.data, metadata.data.statuses, data, metadata.data.phases);
    // A close that has to move the errand into another phase first is one made before its workflow has ended.
    const closesBeforeWorkflowEnds = data.status === CLOSED_SUPPORT_ERRAND_STATUS && Boolean(body.activePhaseId);
    assertMayCloseReportedMisconduct({
      policyService: this.investigationPolicyService,
      errand: currentErrand.data,
      closesBeforeWorkflowEnds,
    });
    // Closing from an earlier phase enters each phase on the way and the one it closes in, and every one of
    // them answers to the same rule as the phase button that would have entered it.
    for (const enteredPhaseId of [...phaseSteps.map(step => step.activePhaseId), body.activePhaseId]) {
      assertMayStartFollowUp({
        policyService: this.investigationPolicyService,
        handlerRoles: this.handlerRoles,
        superadminGroups: this.superadminGroups,
        user: req.user,
        targetPhaseName: metadata.data.phases?.find(phase => phase.id === enteredPhaseId)?.name,
      });
    }
    // Who may close is asked above; why it closes before its workflow ends, here.
    const earlyCloseNote = resolveEarlyCloseServiceNote({
      policyService: this.investigationPolicyService,
      errand: currentErrand.data,
      phases: metadata.data.phases,
      closesBeforeWorkflowEnds,
      motivation: data.closingMotivation,
    });
    // Closing from an earlier phase steps along the workflow first: Support Management refuses a jump
    // between phases. Each step is conditioned on the version the one before it left.
    let version = currentVersion;
    if (earlyCloseNote) {
      // The motivation is the handler's service note, written once every refusal is behind it, so a close is never
      // without it. The note is this request's own write; a version moved further is somebody else's.
      assertCanWriteSupportServiceNote(currentErrand.data, req.user);
      await this.apiService.post(
        { url: `${url}/notes`, baseURL, data: buildSupportServiceNote(earlyCloseNote, req.user), propagateClientError: true },
        req.user,
      );
      const noted = await this.apiService.get<SupportErrand>({ url, baseURL, includeResponseHeaders: true, propagateClientError: true }, req.user);
      const notedVersion = getErrandVersion(noted.data, noted.headers?.etag);
      if (notedVersion > version + 1) throw new HttpException(409, 'Ärendet har ändrats av någon annan. Ladda om ärendet och försök igen.');
      version = notedVersion;
    }
    for (const step of phaseSteps) {
      await this.apiService.patch<SupportErrand, (typeof phaseSteps)[number]>(
        {
          url,
          baseURL,
          data: step,
          headers: { 'If-Match': `"${version}"` },
          followLocation: false,
          propagateClientError: true,
          // Only the close itself is news; the phases it has to pass through on the way are not.
          notifySubscribers: false,
        },
        req.user,
      );
      const stepped = await this.apiService.get<SupportErrand>({ url, baseURL, includeResponseHeaders: true, propagateClientError: true }, req.user);
      version = getErrandVersion(stepped.data, stepped.headers?.etag);
      // The version read back may hold somebody else's write besides the step - a measure proposed while the
      // errand passed through an open phase. The measures are read again after it, so the next write either
      // follows them or, carrying this version, is refused for whatever comes after.
      await assertMeasuresHandled();
    }
    await this.apiService.patch<SupportErrand, typeof body>(
      {
        url,
        baseURL,
        data: body,
        headers: { 'If-Match': `"${version}"` },
        followLocation: false,
        propagateClientError: true,
      },
      req.user,
    );

    const savedErrand = await this.apiService.get<SupportErrand>(
      { url, baseURL, includeResponseHeaders: true, propagateClientError: true },
      req.user,
    );
    return response.status(200).send({
      ...savedErrand.data,
      version: getErrandVersion(savedErrand.data, savedErrand.headers?.etag),
    });
  }

  @Patch('/supporterrands/:id/classification')
  @HttpCode(200)
  @OpenAPI({ summary: 'Update the classification and labels of a support errand' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(UpdateSupportErrandClassificationDto, 'body'))
  async updateSupportErrandClassification(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() data: UpdateSupportErrandClassificationDto,
    @Res() response: any,
  ): Promise<any> {
    const classificationOwner = await this.investigationPolicyService.getClassificationOwner();
    if (classificationOwner === 'unavailable') {
      throw new HttpException(503, 'Investigation classification ownership is temporarily unavailable');
    }
    if (classificationOwner !== 'investigation') {
      throw new HttpException(409, 'Investigation does not own classification for this application');
    }
    const iafVofClassificationPolicy = this.investigationPolicyService.iafVofClassificationPolicy;
    if (!iafVofClassificationPolicy) {
      throw new HttpException(409, 'Investigation classification policy is unavailable');
    }
    const definition = this.investigationPolicyService.profile.documents.find(document => document.key === data.documentKey);
    if (!definition) {
      throw new HttpException(400, 'Unsupported investigation classification document');
    }
    // Classification is written together with the document that owns it, so it follows that
    // document's access rather than carrying an access rule of its own. Reading that document is
    // therefore not enough: this is a write. The document grant stays the authority even when the
    // errand's own level is R and this write reaches labels: /access is trusted as given, and a
    // grant on the key is a grant to what writing that document entails.
    await this.investigationAccessService.assertCanWriteDocument(req.user, MUNICIPALITY_ID, id, definition.key);
    const url = `${MUNICIPALITY_ID}/${this.namespace}/errands/${id}`;
    const metadataUrl = `${MUNICIPALITY_ID}/${this.namespace}/metadata/labels`;
    const baseURL = apiURL(this.SERVICE);
    const [currentErrand, labelMetadata, classificationDocument] = await Promise.all([
      this.apiService.get<SupportErrand>({ url, baseURL, includeResponseHeaders: true, propagateClientError: true }, req.user),
      supportMetadataCache.read<SupportLabels | null>(this.apiService, { url: metadataUrl, baseURL, propagateClientError: true }, req.user),
      this.jsonParameterService.readJsonParameter({
        definition,
        municipalityId: MUNICIPALITY_ID,
        errandId: id,
        user: req.user,
      }),
    ]);
    const currentVersion = getErrandVersion(currentErrand.data, currentErrand.headers?.etag);
    if (currentVersion !== data.expectedVersion) {
      throw new HttpException(409, 'Support errand classification has changed since it was loaded');
    }
    assertSupportErrandWritable(currentErrand.data, 'investigation classification changes');
    if (classificationDocument.etag !== data.documentETag) {
      throw new HttpException(409, 'Investigation document has changed since classification was edited');
    }
    const classificationOwnerSelection = resolveIafVofInvestigationClassificationOwner(iafVofClassificationPolicy, currentErrand.data);
    const classificationGroups = assertSupportInvestigationClassificationContext(
      iafVofClassificationPolicy,
      classificationOwnerSelection,
      definition.key,
      classificationDocument.document.value,
      data.classifications.map(selection => selection.classification),
    );
    const resolvedClassifications = data.classifications.map(selection =>
      resolveSupportErrandClassification(selection, labelMetadata.data?.labelStructure, iafVofClassificationPolicy.labelTree),
    );
    // Every classification is kept as labels; the errand's own classification field holds only one.
    const errandClassification = resolvedClassifications[selectErrandClassificationIndex(iafVofClassificationPolicy, classificationGroups)];
    const categoryLabels = [
      ...new Map(resolvedClassifications.flatMap(resolved => resolved.categoryLabels).map(label => [label.id, label])).values(),
    ];
    const body = buildSupportErrandClassificationUpdateBody(
      { classification: errandClassification.classification, categoryLabels },
      currentErrand.data.labels,
      categoryLabels,
      errandClassification.classification,
      errandClassification.managedCategoryLabelIds,
      errandClassification.managedRootResource,
    );
    await this.apiService.patch<SupportErrand, typeof body>(
      { url, baseURL, data: body, headers: { 'If-Match': `"${data.expectedVersion}"` }, propagateClientError: true },
      req.user,
    );
    const savedErrand = await this.apiService.get<SupportErrand>(
      { url, baseURL, includeResponseHeaders: true, propagateClientError: true },
      req.user,
    );
    const savedVersion = getErrandVersion(savedErrand.data, savedErrand.headers?.etag);

    return response.status(200).send({ ...savedErrand.data, version: savedVersion });
  }

  @Patch('/supporterrands/:id/admin')
  @OpenAPI({ summary: 'Set user as admin for support errand' })
  @UseBefore(authMiddleware, hasPermissions(['canEditSupportManagement']), validationMiddleware(AssignSupportErrandDto, 'body'))
  async becomeAdminForSupportErrand(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @HeaderParam('If-Match') ifMatch: string,
    @Body() data: AssignSupportErrandDto,
    @Res() response: any,
  ): Promise<{ data: any; message: string }> {
    const requestedVersion = requireStrongErrandVersion(ifMatch);
    const url = `${MUNICIPALITY_ID}/${this.namespace}/errands/${id}`;
    const baseURL = apiURL(this.SERVICE);
    const currentErrand = await this.apiService.get<SupportErrand>(
      { url, baseURL, includeResponseHeaders: true, propagateClientError: true },
      req.user,
    );
    const currentVersion = getErrandVersion(currentErrand.data, currentErrand.headers?.etag);
    assertRequestedErrandVersion(requestedVersion, currentVersion);
    assertSupportErrandAdminAssignable(currentErrand.data, 'administrator changes');

    const body: AssignSupportErrandDto = { assignedUserId: data.assignedUserId };
    const res = await this.apiService
      .patch<any, AssignSupportErrandDto>(
        {
          url,
          baseURL,
          data: body,
          headers: { 'If-Match': `"${currentVersion}"` },
          followLocation: false,
          propagateClientError: true,
        },
        req.user,
      )
      .catch(e => {
        logger.error('Error when setting administrator for support errand');
        logger.error(e);
        throw e;
      });
    if (this.investigationPolicyService.assigneeFollowsErrand) {
      await followErrandWithAssignee(
        this.subscriberApi(),
        { municipalityId: MUNICIPALITY_ID, errandId: id, previousAssignee: currentErrand.data.assignedUserId, nextAssignee: data.assignedUserId },
        req.user,
      );
    }
    return response.status(200).send(res.data);
  }
}
