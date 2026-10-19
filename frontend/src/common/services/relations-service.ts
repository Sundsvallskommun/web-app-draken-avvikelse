import { Relation } from '@common/data-contracts/relations/data-contracts';

import { ApiResponse, apiService } from './api-service';
import { CaseStatusResponse } from './casestatus-service';

const formatServiceName = (str: string) => {
  if (str === 'SUPPORT_MANAGEMENT') return 'supportmanagement';
  if (str === 'CASE_DATA') return 'case-data';
  return str.toLocaleLowerCase();
};

export interface RelationWithErrandNumber {
  relation: Relation;
  errandNumber: string;
  otherResourceId: string;
}

interface ResolvedRelationsResponse {
  relations: Relation[];
  caseStatuses: CaseStatusResponse[];
}

const ALLOWED_SERVICES = ['supportmanagement', 'case-data'];

// The relations service returns service names in varying formats ('support-management',
// 'SUPPORT_MANAGEMENT', 'supportmanagement', 'case-data', 'casedata'). Normalise to our canonical
// values so filtering works regardless of which system created the relation.
const normalizeService = (service?: string): string => {
  const normalized = (service ?? '').toLowerCase().replace(/[-_]/g, '');
  if (normalized === 'supportmanagement') return 'supportmanagement';
  if (normalized === 'casedata') return 'case-data';
  return service ?? '';
};

export const getAllRelatedErrands = async (
  municipalityId: string,
  resourceId: string
): Promise<RelationWithErrandNumber[]> => {
  const [sourceResult, targetResult] = await Promise.all([
    getResolvedRelations('source', municipalityId, resourceId, 'ASC'),
    getResolvedRelations('target', municipalityId, resourceId, 'ASC'),
  ]);

  const allStatuses = [...sourceResult.caseStatuses, ...targetResult.caseStatuses];

  const fromSource: RelationWithErrandNumber[] = sourceResult.relations
    .filter((relation) => ALLOWED_SERVICES.includes(normalizeService(relation.target.service)))
    .map((relation) => {
      const otherResourceId = relation.target.resourceId;
      const status = allStatuses.find((s) => s.caseId === otherResourceId);
      return {
        relation,
        errandNumber: status?.errandNumber ?? otherResourceId,
        otherResourceId,
      };
    });

  const fromTarget: RelationWithErrandNumber[] = targetResult.relations
    .filter((relation) => ALLOWED_SERVICES.includes(normalizeService(relation.source.service)))
    .map((relation) => {
      const otherResourceId = relation.source.resourceId;
      const status = allStatuses.find((s) => s.caseId === otherResourceId);
      return {
        relation,
        errandNumber: status?.errandNumber ?? otherResourceId,
        otherResourceId,
      };
    });

  const seen = new Set<string>();
  const deduplicated = [...fromSource, ...fromTarget].filter((entry) => {
    if (seen.has(entry.otherResourceId)) return false;
    seen.add(entry.otherResourceId);
    return true;
  });

  return deduplicated.sort((a, b) => a.errandNumber.localeCompare(b.errandNumber));
};

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

export const getReferredFromErrands = (
  municipalityId: string,
  resourceId: string
): Promise<ReferredFromErrandResponse[]> => {
  const url = `${municipalityId}/relations/referredfrom/${resourceId}`;

  return apiService
    .get<ApiResponse<ReferredFromErrandResponse[]>>(url)
    .then((res) => res.data.data)
    .catch((e) => {
      console.error('Error fetching referred-from errands: ' + e);
      return [];
    });
};

const getResolvedRelations = (
  direction: 'source' | 'target',
  municipalityId: string,
  resourceId: string,
  sort: string
): Promise<ResolvedRelationsResponse> => {
  const url = `${municipalityId}/resolvedrelations/${direction}/${sort}/${resourceId}`;

  return apiService
    .get<ApiResponse<ResolvedRelationsResponse>>(url)
    .then((res) => res.data.data)
    .catch(() => ({ relations: [], caseStatuses: [] }));
};
