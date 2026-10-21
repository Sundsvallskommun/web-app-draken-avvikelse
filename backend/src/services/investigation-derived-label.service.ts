import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import type { Errand, Labels } from '@/data-contracts/supportmanagement/data-contracts';
import { User } from '@/interfaces/users.interface';
import ApiService from '@/services/api.service';
import { supportMetadataCache } from '@/services/support-metadata-cache';
import { apiURL } from '@/utils/util';

import { buildLabelAdditionUpdate } from './errand-label-presence';
import { getErrandVersion } from './support-errand.service';

interface ApplyDerivedLabelRequest {
  readonly municipalityId: string;
  readonly errandId: string;
  readonly user: User;
  /** The label the saved document decides the errand carries. */
  readonly resourcePath: string;
}

/**
 * Adds a label to an errand, right after the investigation write that decided it - the high HSL risk the unit
 * manager's investigation assesses, or the HSL event analysis MAS/MAR decides to make.
 *
 * These labels are permanent (`IAF_VOF_PERMANENT_LABELS`), so a label is only ever added, never taken off. Adding
 * it notifies like the save it follows: a subscription profile on the label is how MAS/MAR and the head of
 * operations hear of the errand.
 *
 * The label is added to the labels as they are read right before the write, which is conditioned on the version that
 * read found: it keeps every label somebody else set meanwhile, and a write landing between the read and the label
 * leaves the label for the next save rather than racing it. A namespace without the label in its metadata is left
 * alone.
 */
export class InvestigationDerivedLabelService {
  constructor(
    private readonly apiService: Pick<ApiService, 'get' | 'patch'> = new ApiService(),
    private readonly namespace: string = SUPPORTMANAGEMENT_NAMESPACE ?? '',
  ) {}

  /** Answers whether the label was written. */
  async applyDerivedLabel({ municipalityId, errandId, user, resourcePath }: ApplyDerivedLabelRequest): Promise<boolean> {
    const baseURL = apiURL(apiServiceName('supportmanagement'));
    const url = `${municipalityId}/${this.namespace}/errands/${errandId}`;
    const readErrand = async (): Promise<{ version: number; labels: Errand['labels'] }> => {
      const errand = await this.apiService.get<Errand>(
        { url, baseURL, includeResponseHeaders: true, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      );
      return { version: getErrandVersion(errand.data, errand.headers?.etag), labels: errand.data.labels };
    };
    const [errand, labels] = await Promise.all([
      readErrand(),
      supportMetadataCache.read<Labels | null>(
        this.apiService,
        { url: `${municipalityId}/${this.namespace}/metadata/labels`, baseURL, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      ),
    ]);
    const update = buildLabelAdditionUpdate({
      currentLabels: errand.labels,
      labelStructure: labels.data?.labelStructure,
      resourcePath,
    });
    if (!update) return false;

    try {
      await this.apiService.patch<Errand, { labels: { id: string }[] }>(
        {
          url,
          baseURL,
          data: { labels: update },
          headers: { 'If-Match': `"${errand.version}"` },
          followLocation: false,
          propagateClientError: true,
          mapUnauthorizedToForbidden: true,
        },
        user,
      );
    } catch (error) {
      // Somebody wrote between the read and the label; the next save adds it.
      if (isRecord(error) && error.status === 412) return false;
      throw error;
    }
    return true;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
