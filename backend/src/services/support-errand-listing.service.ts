import { HttpError } from 'routing-controllers';

import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import { CountResponse, Label, Labels, PageErrand, SearchCountResponse } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { User } from '@/interfaces/users.interface';
import { logger } from '@/utils/logger';

import ApiService from './api.service';
import { indexLabelIdsByPath } from './investigation-handover-label.service';
import { buildErrandFilter, ErrandFilterInput, selectCategoryLeafPaths } from './support-errand.service';
import { buildErrandSearchQuery, ERRAND_SEARCH_QUERY_MAX_LENGTH } from './support-errand-search-query';
import {
  SupportManagementLabelFilterError,
  SupportManagementLabelFilterProfile,
  SupportManagementLabelFilterSelection,
  SupportManagementLabelFilterService,
} from './supportmanagement-label-filter.service';

/** Support Management answers 503 while its search cluster is down and 504 when a search runs out of time. */
const SEARCH_UNAVAILABLE = 503;
const SEARCH_TIMED_OUT = 504;

export interface SupportErrandPaging {
  readonly page: number;
  readonly size: number;
  readonly sort?: string;
}

interface SupportErrandListingDependencies {
  readonly apiService: Pick<ApiService, 'get'>;
  /** The Support Management service and version the requests go to, e.g. `supportmanagement-sprint/17.0`. */
  readonly service: string;
  readonly namespace: string | undefined;
  readonly labelFilterProfile: SupportManagementLabelFilterProfile | undefined;
  /** Whether the deployment answers from the search index, see `resolveSupportManagementErrandSearch`. */
  readonly errandSearch: boolean;
}

/** What a request's label criteria ask for, read once and answered by either endpoint. */
interface LabelCriteria {
  /** The `&filter=` fragment of the generic label selections, '' when there are none. */
  readonly labelFilter: string;
  /** Resource paths by criterion, of which an errand has to carry one per group. */
  readonly leafPathGroups: readonly (readonly string[])[];
  readonly labelStructure?: readonly Label[];
}

const getLabelFilterErrorStatus = (error: SupportManagementLabelFilterError): number => {
  if (error.source === 'selection') return 400;
  if (error.source === 'metadata') return 502;
  return 500;
};

const parseLabelFilterSelections = (labelFilter: string): SupportManagementLabelFilterSelection[] => {
  try {
    return JSON.parse(labelFilter);
  } catch {
    throw new HttpException(400, 'Support Management labelFilter must be a valid JSON array');
  }
};

const withoutFilterPrefix = (fragment: string): string => fragment.replace(/^&filter=/u, '');

export interface SupportErrandStatusGroupCounts {
  /** How many errands match in each status group, in the order the groups were asked for. */
  counts: number[];
}

const MAX_STATUS_GROUPS = 20;
const STATUS_NAME = /^[\w-]{1,100}$/u;

/** Reads the `statusGroups` query parameter: a JSON array of non-empty arrays of status names. */
export const parseStatusGroups = (statusGroups: string | undefined): string[][] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(statusGroups ?? '');
  } catch {
    parsed = undefined;
  }
  const isStatusGroup = (group: unknown): group is string[] =>
    Array.isArray(group) && group.length > 0 && group.every(status => typeof status === 'string' && STATUS_NAME.test(status));
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_STATUS_GROUPS || !parsed.every(isStatusGroup)) {
    throw new HttpException(400, `statusGroups must be a JSON array of 1 to ${MAX_STATUS_GROUPS} non-empty arrays of status names`);
  }
  return parsed;
};

/**
 * Lists and counts support errands for the overview. A deployment with the search index asks it; any
 * request the index cannot answer the way the filter endpoint would goes to the filter endpoint, which
 * stays the reference for what a list holds: a label the metadata no longer knows, a query too long
 * for the index, or a search cluster that is down.
 */
export class SupportErrandListingService {
  constructor(private readonly dependencies: SupportErrandListingDependencies) {}

  async list(municipalityId: string, criteria: ErrandFilterInput, paging: SupportErrandPaging, user: User): Promise<PageErrand> {
    const labels = await this.readLabelCriteria(municipalityId, criteria, user);
    const searchQuery = this.searchQueryFor(criteria, labels);
    if (searchQuery !== undefined) {
      const parameters = new URLSearchParams({ page: String(paging.page), size: String(paging.size) });
      if (searchQuery) parameters.set('query', searchQuery);
      if (paging.sort) parameters.set('sort', paging.sort);
      const page = await this.search<PageErrand>(`${this.errandsUrl(municipalityId)}/search?${parameters.toString()}`, user);
      if (page) return page;
    }

    const parameters = new URLSearchParams({ page: String(paging.page), size: String(paging.size) });
    const filter = this.filterFor(criteria, labels);
    if (filter) parameters.set('filter', filter);
    if (paging.sort) parameters.set('sort', paging.sort);
    const response = await this.dependencies.apiService.get<PageErrand>({ url: `${this.errandsUrl(municipalityId)}?${parameters.toString()}` }, user);
    return response.data;
  }

  /**
   * How many errands match the criteria in each group of statuses, in the order of the groups. The
   * criteria's own status is left out, since each group stands in for it. The index answers every group
   * from one breakdown by status; the filter endpoint is asked once per group.
   */
  async countByStatusGroups(
    municipalityId: string,
    criteria: ErrandFilterInput,
    statusGroups: readonly (readonly string[])[],
    user: User,
  ): Promise<number[]> {
    const criteriaWithoutStatus: ErrandFilterInput = { ...criteria, status: undefined };
    const labels = await this.readLabelCriteria(municipalityId, criteriaWithoutStatus, user);
    const searchQuery = this.searchQueryFor(criteriaWithoutStatus, labels);
    if (searchQuery !== undefined) {
      const parameters = new URLSearchParams({ groupBy: 'status' });
      if (searchQuery) parameters.set('query', searchQuery);
      const breakdown = await this.search<SearchCountResponse>(`${this.errandsUrl(municipalityId)}/search/count?${parameters.toString()}`, user);
      if (breakdown) {
        const buckets = breakdown.group?.buckets ?? [];
        return statusGroups.map(statuses =>
          buckets
            .filter(bucket => bucket.value !== undefined && statuses.includes(bucket.value))
            .reduce((sum, bucket) => sum + (bucket.count ?? 0), 0),
        );
      }
    }

    return Promise.all(
      statusGroups.map(async statuses => {
        const filter = this.filterFor({ ...criteriaWithoutStatus, status: statuses.join(',') }, labels);
        const query = filter ? `?${new URLSearchParams({ filter }).toString()}` : '';
        const response = await this.dependencies.apiService.get<CountResponse>({ url: `${this.errandsUrl(municipalityId)}/count${query}` }, user);
        return response.data.count ?? 0;
      }),
    );
  }

  private errandsUrl(municipalityId: string): string {
    return `${this.dependencies.service}/${municipalityId}/${this.dependencies.namespace}/errands`;
  }

  private async readLabelCriteria(municipalityId: string, criteria: ErrandFilterInput, user: User): Promise<LabelCriteria> {
    const categoryLeafPaths = selectCategoryLeafPaths(criteria);
    const categoryGroups = categoryLeafPaths.length > 0 ? [categoryLeafPaths] : [];
    if (!criteria.labelFilter) {
      // The filter endpoint matches the category paths as they are; only the index needs their ids.
      const labels = this.dependencies.errandSearch && categoryGroups.length > 0 ? await this.readLabels(municipalityId, user) : undefined;
      return { labelFilter: '', leafPathGroups: categoryGroups, labelStructure: labels?.labelStructure };
    }

    const selections = parseLabelFilterSelections(criteria.labelFilter);
    const { labelFilterProfile } = this.dependencies;
    if (!labelFilterProfile) {
      throw new HttpException(400, 'Support Management label filtering is not configured for this application');
    }
    const labels = await this.readLabels(municipalityId, user);
    try {
      const labelFilterService = new SupportManagementLabelFilterService(labelFilterProfile, labels);
      return {
        labelFilter: labelFilterService.buildFilter(selections),
        leafPathGroups: [...categoryGroups, ...labelFilterService.selectLeafResourcePaths(selections)],
        labelStructure: labels.labelStructure,
      };
    } catch (error) {
      if (error instanceof SupportManagementLabelFilterError) {
        throw new HttpException(getLabelFilterErrorStatus(error), error.message);
      }
      throw error;
    }
  }

  private async readLabels(municipalityId: string, user: User): Promise<Labels> {
    const url = `${this.dependencies.service}/${municipalityId}/${this.dependencies.namespace}/metadata/labels`;
    const response = await this.dependencies.apiService.get<Labels>({ url, propagateClientError: true }, user);
    return response.data;
  }

  /** The filter expression for the filter endpoint, without its `&filter=` prefix; '' filters nothing. */
  private filterFor(criteria: ErrandFilterInput, labels: LabelCriteria): string {
    const errandFilter = buildErrandFilter(criteria);
    if (!criteria.labelFilter) return withoutFilterPrefix(errandFilter);
    const clauses = [errandFilter, labels.labelFilter].filter(Boolean).map(withoutFilterPrefix);
    return clauses.map(clause => `(${clause})`).join(' and ');
  }

  /** The query for the index, or undefined when the filter endpoint has to answer instead. */
  private searchQueryFor(criteria: ErrandFilterInput, labels: LabelCriteria): string | undefined {
    if (!this.dependencies.errandSearch) return undefined;
    if (criteria.stakeholderParameterKeys?.length) {
      logger.info('Support Management errand search: the index cannot match a handler parameter, asking the filter endpoint');
      return undefined;
    }

    const idByPath = indexLabelIdsByPath(labels.labelStructure);
    const labelIdGroups = labels.leafPathGroups.map(paths => paths.map(path => idByPath.get(normalizeSupportManagementResourcePath(path))));
    if (labelIdGroups.some(labelIds => labelIds.some(labelId => labelId === undefined))) {
      logger.info('Support Management errand search: a selected label is missing from the metadata, asking the filter endpoint');
      return undefined;
    }

    const query = buildErrandSearchQuery({ ...criteria, labelIdGroups: labelIdGroups as string[][] });
    if (query.length > ERRAND_SEARCH_QUERY_MAX_LENGTH) {
      logger.info(`Support Management errand search: query of ${query.length} characters is too long for the index, asking the filter endpoint`);
      return undefined;
    }
    return query;
  }

  /** Asks the index, or answers undefined when its cluster is down and the filter endpoint has to answer. */
  private async search<T>(url: string, user: User): Promise<T | undefined> {
    try {
      const response = await this.dependencies.apiService.get<T>(
        { url, propagateClientError: true, mapUnauthorizedToForbidden: true, propagateServerErrors: [SEARCH_UNAVAILABLE, SEARCH_TIMED_OUT] },
        user,
      );
      return response.data;
    } catch (error) {
      // routing-controllers resets an HttpException's prototype to HttpError, so that is what to test for.
      if (error instanceof HttpError && error.httpCode === SEARCH_UNAVAILABLE) {
        logger.warn('Support Management errand search is not available, asking the filter endpoint');
        return undefined;
      }
      if (error instanceof HttpError && error.httpCode === SEARCH_TIMED_OUT) {
        throw new HttpException(SEARCH_TIMED_OUT, 'Sökningen tog för lång tid. Förfina sökningen och försök igen.');
      }
      throw error;
    }
  }
}
