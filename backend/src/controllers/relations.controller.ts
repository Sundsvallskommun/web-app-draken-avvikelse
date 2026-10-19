import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { CaseStatusResponse } from '@/data-contracts/casestatus/data-contracts';
import { Relation, RelationPagedResponse, ResourceIdentifier } from '@/data-contracts/relations/data-contracts';
import {
  Category,
  ContactChannel,
  Errand as SupportManagementErrand,
  ErrandLabel,
  MetadataResponse,
  Role,
  Stakeholder as SupportStakeholder,
} from '@/data-contracts/supportmanagement/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { ExternalIdType } from '@/interfaces/externalIdType.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import ApiService from '@/services/api.service';
import { OrganizationService } from '@/services/organization.service';
import { supportMetadataCache } from '@/services/support-metadata-cache';
import { logger } from '@/utils/logger';
import { apiURL, formatOrgNr, OrgNumberFormat } from '@/utils/util';

interface ResolvedClassification {
  category: string;
  categoryDisplayName: string;
  type: string;
  typeDisplayName: string;
  subType: string;
  subTypeDisplayName: string;
}

type Level = { name: string; displayName: string };

const level = (name?: string, displayName?: string): Level => ({
  name: name ?? '',
  displayName: displayName ?? name ?? '',
});

const toResolvedClassification = (category: Level, type: Level, subType: Level): ResolvedClassification => ({
  category: category.name,
  categoryDisplayName: category.displayName,
  type: type.name,
  typeDisplayName: type.displayName,
  subType: subType.name,
  subTypeDisplayName: subType.displayName,
});

interface ReferredFromStakeholder {
  externalId: string;
  externalIdType: string;
  personNumber: string;
  organizationNumber: string;
  role: string;
  roleDisplayName: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  address: string;
  careOf: string;
  zipCode: string;
  city: string;
  contactChannels: { type: string; value: string }[];
}

export interface ReferredFromErrandResponse {
  errandNumber: string;
  classificationCategory: string;
  classificationCategoryDisplayName: string;
  classificationType: string;
  classificationTypeDisplayName: string;
  classificationSubType: string;
  classificationSubTypeDisplayName: string;
  priority: string;
  channel: string;
  created: string;
  description: string;
  title: string;
  stakeholders: ReferredFromStakeholder[];
}

@Controller()
export class RelationsController {
  private apiService = new ApiService();
  private organizationService = new OrganizationService();
  private SERVICE = apiServiceName('relations');
  private SUPPORTMANAGEMENT_SERVICE = apiServiceName('supportmanagement');
  private CASESTATUS_SERVICE = apiServiceName('casestatus');
  private CITIZEN_SERVICE = apiServiceName('citizen');

  // The relations service returns service names in varying formats ('support-management',
  // 'SUPPORT_MANAGEMENT', 'supportmanagement'). Normalise to our canonical value so comparisons
  // work regardless of which system created the relation.
  private normalizeService(service?: string): string {
    const normalized = (service ?? '').toLowerCase().replace(/[-_]/g, '');
    if (normalized === 'supportmanagement') return 'supportmanagement';
    return service ?? '';
  }

  private async fetchErrandNumber(municipalityId: string, resource: ResourceIdentifier, user: any): Promise<string> {
    const { service, namespace, resourceId } = resource;
    if (this.normalizeService(service) !== 'supportmanagement') {
      logger.error(`Unknown service: ${service}`);
      return '';
    }
    const url = `${municipalityId}/${namespace}/errands/${resourceId}`;
    const baseURL = apiURL(this.SUPPORTMANAGEMENT_SERVICE);

    const res = await this.apiService.get<any>({ url, baseURL }, user).catch(e => {
      logger.error(`Error fetching errand number for ${service}/${namespace}/${resourceId}: `, e);
      return null;
    });

    return res?.data?.errandNumber ?? '';
  }

  private async fetchCaseStatus(municipalityId: string, errandNumber: string, user: any): Promise<CaseStatusResponse[]> {
    if (!errandNumber) return [];

    const url = `${municipalityId}/errands/statuses?errandNumber=${errandNumber}`;
    const baseURL = apiURL(this.CASESTATUS_SERVICE);
    const res = await this.apiService.get<CaseStatusResponse[]>({ url, baseURL }, user).catch(e => {
      logger.error(`Error fetching case status for ${errandNumber}: `, e);
      return null;
    });

    return res?.data ?? [];
  }

  @Post('/relations')
  @HttpCode(201)
  @OpenAPI({ summary: 'Create relation' })
  @UseBefore(authMiddleware)
  async createRelation(@Req() req: RequestWithUser, @Body() relationbody: Relation): Promise<{ data: any; message: string }> {
    const url = `${MUNICIPALITY_ID}/relations`;
    const modifiedRelationBody = {
      ...relationbody,
      source: {
        ...relationbody.source,
        type: 'case',
        namespace: process.env.SUPPORTMANAGEMENT_NAMESPACE,
      },
      target: {
        ...relationbody.target,
        type: 'case',
      },
    };
    const baseURL = apiURL(this.SERVICE);
    const response = await this.apiService.post<any, any>({ url, baseURL, data: modifiedRelationBody }, req.user).catch(e => {
      console.error('Something went wrong when creating relation: ' + e);
      throw e;
    });
    return { data: response.data, message: `Relation created` };
  }

  @Delete('/relations/:id')
  @HttpCode(201)
  @OpenAPI({ summary: 'Delete a relation' })
  @UseBefore(authMiddleware)
  async deleteRelation(@Req() req: RequestWithUser, @Param('id') id: string): Promise<{ data: boolean; message: string }> {
    const baseURL = apiURL(this.SERVICE);
    if (!id) {
      console.error('Id not found. Cannot delete relation without id.');
    }
    const url = `${MUNICIPALITY_ID}/relations/${id}`;
    const response = await this.apiService.delete<boolean>({ url, baseURL }, req.user).catch(e => {
      throw e;
    });
    return { data: response.data, message: `Relation with id ${id} removed` };
  }

  private async getResolvedRelations(
    direction: 'source' | 'target',
    municipalityId: string,
    query: string,
    sort: string,
    user: any,
  ): Promise<{ relations: Relation[]; caseStatuses: CaseStatusResponse[] }> {
    const url = `${municipalityId}/relations?filter=${direction}.resourceId%3A%27${query}%27&sortDirection=${sort}`;
    const baseURL = apiURL(this.SERVICE);
    const res = await this.apiService.get<RelationPagedResponse>({ url, baseURL }, user).catch(e => {
      logger.error('Error when fetching relations: ', e);
      throw e;
    });

    const relations = res.data.relations ?? [];
    const resolveDirection = direction === 'source' ? 'target' : 'source';

    const caseStatuses = await Promise.all(
      relations.map(async relation => {
        const errandNumber = await this.fetchErrandNumber(municipalityId, relation[resolveDirection], user);
        return this.fetchCaseStatus(municipalityId, errandNumber, user);
      }),
    );

    return {
      relations,
      caseStatuses: caseStatuses.flat(),
    };
  }

  @Get('/resolvedrelations/:direction/:sort/:query')
  @OpenAPI({ summary: 'Find relations by direction and resolve their case statuses' })
  @UseBefore(authMiddleware)
  async getResolvedRelationsEndpoint(
    @Req() req: RequestWithUser,
    @Param('direction') direction: 'source' | 'target',
    @Param('query') query: string,
    @Param('sort') sort: string,
  ): Promise<{ data: { relations: Relation[]; caseStatuses: CaseStatusResponse[] }; message: string }> {
    const data = await this.getResolvedRelations(direction, MUNICIPALITY_ID, query, sort, req.user);
    return { data, message: 'success' };
  }

  private async fetchSupportManagementErrand(
    municipalityId: string,
    namespace: string,
    resourceId: string,
    user: any,
  ): Promise<SupportManagementErrand | null> {
    const url = `${municipalityId}/${namespace}/errands/${resourceId}`;
    const baseURL = apiURL(this.SUPPORTMANAGEMENT_SERVICE);
    const res = await this.apiService.get<SupportManagementErrand>({ url, baseURL }, user).catch(e => {
      logger.error(`Error fetching support management errand ${namespace}/${resourceId}: `, e);
      return null;
    });
    return res?.data ?? null;
  }

  private async fetchSupportManagementMetadata(municipalityId: string, namespace: string, user: any): Promise<MetadataResponse | null> {
    const url = `${municipalityId}/${namespace}/metadata`;
    const baseURL = apiURL(this.SUPPORTMANAGEMENT_SERVICE);
    const res = await supportMetadataCache.read<MetadataResponse>(this.apiService, { url, baseURL }, user).catch(e => {
      logger.error(`Error fetching support management metadata for namespace ${namespace}: `, e);
      return null;
    });
    return res?.data ?? null;
  }

  private resolveClassification(errand: SupportManagementErrand, categories: Category[]): ResolvedClassification {
    const labels = errand.labels ?? [];
    if (labels.length > 0) {
      const labelLevel = (classification: string) => {
        const label = labels.find((l: ErrandLabel) => l.classification === classification);
        return level(label?.resourceName, label?.displayName);
      };
      return toResolvedClassification(labelLevel('CATEGORY'), labelLevel('TYPE'), labelLevel('SUBTYPE'));
    }

    const classification = errand.classification;
    const category = categories.find(c => c.name === classification?.category);
    const type = category?.types?.find(t => t.name === classification?.type);
    return toResolvedClassification(level(classification?.category, category?.displayName), level(classification?.type, type?.displayName), level());
  }

  private mapPriority(priority: string): string {
    const priorityMap: Record<string, string> = {
      HIGH: 'Hög',
      MEDIUM: 'Medel',
      LOW: 'Låg',
    };
    return priorityMap[priority] ?? priority;
  }

  private async fetchPersonNumber(municipalityId: string, partyId: string, user: any): Promise<string> {
    const url = `${this.CITIZEN_SERVICE}/${municipalityId}/${partyId}/personnumber`;
    const res = await this.apiService.get<string>({ url }, user).catch(e => {
      logger.error(`Error fetching person number for partyId ${partyId}: `, e);
      return null;
    });
    return res?.data ? `${res.data}` : '';
  }

  private resolveRoleDisplayName(role: string, roles: Role[]): string {
    const found = roles.find(r => r.name === role);
    return found?.displayName ?? role;
  }

  private async mapStakeholders(
    municipalityId: string,
    stakeholders: SupportStakeholder[],
    roles: Role[],
    user: any,
  ): Promise<ReferredFromStakeholder[]> {
    return Promise.all(
      stakeholders.map(async stakeholder => {
        const shouldFetchPersonNumber =
          stakeholder.externalId && (stakeholder.externalIdType === ExternalIdType.PRIVATE || stakeholder.externalIdType === ExternalIdType.EMPLOYEE);

        const personNumber = shouldFetchPersonNumber ? await this.fetchPersonNumber(municipalityId, stakeholder.externalId!, user) : '';
        const organizationNumberFromLegalEntity =
          stakeholder.externalId && stakeholder.externalIdType === ExternalIdType.COMPANY
            ? await this.organizationService.getOrganizationNumberByPartyId(municipalityId, stakeholder.externalId, user).catch(e => {
                logger.error(`Error fetching organization number for partyId ${stakeholder.externalId}: `, e);
                return '';
              })
            : '';
        const organizationNumber = formatOrgNr(organizationNumberFromLegalEntity, OrgNumberFormat.DASH) ?? '';

        return {
          externalId: stakeholder.externalId ?? '',
          externalIdType: stakeholder.externalIdType ?? '',
          personNumber,
          organizationNumber,
          role: stakeholder.role ?? '',
          roleDisplayName: this.resolveRoleDisplayName(stakeholder.role ?? '', roles),
          firstName: stakeholder.firstName ?? '',
          lastName: stakeholder.lastName ?? '',
          organizationName: stakeholder.organizationName ?? '',
          address: stakeholder.address ?? '',
          careOf: stakeholder.careOf ?? '',
          zipCode: stakeholder.zipCode ?? '',
          city: stakeholder.city ?? '',
          contactChannels: (stakeholder.contactChannels ?? []).map((channel: ContactChannel) => ({
            type: channel.type ?? '',
            value: channel.value ?? '',
          })),
        };
      }),
    );
  }

  @Get('/relations/referredfrom/:resourceId')
  @OpenAPI({ summary: 'Get info on the support management errand another errand was referred from' })
  @UseBefore(authMiddleware)
  async getReferredFromErrand(
    @Req() req: RequestWithUser,
    @Param('resourceId') resourceId: string,
  ): Promise<{ data: ReferredFromErrandResponse[]; message: string }> {
    const url = `${MUNICIPALITY_ID}/relations?filter=target.resourceId%3A%27${resourceId}%27`;
    const baseURL = apiURL(this.SERVICE);
    const res = await this.apiService.get<RelationPagedResponse>({ url, baseURL }, req.user).catch(e => {
      logger.error('Error fetching relations for referred-from: ', e);
      throw e;
    });

    // REFERRED_FROM and HANDOVER relations both name the errand another one was created from; both
    // surface the source errand's info on the new errand.
    const referredFromRelations = (res.data.relations ?? []).filter(
      relation =>
        (relation.type === 'REFERRED_FROM' || relation.type === 'HANDOVER') && this.normalizeService(relation.source.service) === 'supportmanagement',
    );

    if (referredFromRelations.length === 0) {
      return { data: [], message: 'success' };
    }

    const metadataCache = new Map<string, MetadataResponse | null>();

    const results = await Promise.all(
      referredFromRelations.map(async relation => {
        const { namespace, resourceId: sourceResourceId } = relation.source;
        const namespaceName = namespace ?? '';

        const errand = await this.fetchSupportManagementErrand(MUNICIPALITY_ID, namespaceName, sourceResourceId, req.user);
        if (!errand) return null;

        if (!metadataCache.has(namespaceName)) {
          metadataCache.set(namespaceName, await this.fetchSupportManagementMetadata(MUNICIPALITY_ID, namespaceName, req.user));
        }
        const metadata = metadataCache.get(namespaceName);

        const classification = this.resolveClassification(errand, metadata?.categories ?? []);

        const response: ReferredFromErrandResponse = {
          errandNumber: errand.errandNumber ?? '',
          classificationCategory: classification.category,
          classificationCategoryDisplayName: classification.categoryDisplayName,
          classificationType: classification.type,
          classificationTypeDisplayName: classification.typeDisplayName,
          classificationSubType: classification.subType,
          classificationSubTypeDisplayName: classification.subTypeDisplayName,
          priority: this.mapPriority(errand.priority ?? ''),
          channel: errand.channel ?? '',
          created: errand.created ?? '',
          description: errand.description ?? '',
          title: errand.title ?? '',
          stakeholders: await this.mapStakeholders(
            MUNICIPALITY_ID,
            [...(errand.stakeholders ?? [])].sort((a, b) => (a.role === 'PRIMARY' ? -1 : b.role === 'PRIMARY' ? 1 : 0)),
            metadata?.roles ?? [],
            req.user,
          ),
        };

        return response;
      }),
    );

    return { data: results.filter((result): result is ReferredFromErrandResponse => result !== null), message: 'success' };
  }
}
