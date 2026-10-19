import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import type { Errand, Labels } from '@/data-contracts/supportmanagement/data-contracts';
import { User } from '@/interfaces/users.interface';
import ApiService from '@/services/api.service';
import { apiURL } from '@/utils/util';

import { buildLabelAdditionUpdate } from './errand-label-presence';
import { getErrandVersion } from './support-errand.service';

interface ApplyDerivedLabelRequest {
  readonly municipalityId: string;
  readonly errandId: string;
  readonly user: User;
  /** The label the saved document decides the errand carries. */
  readonly resourcePath: string;
  /** The errand version the document write left; the label write follows it directly or not at all. */
  readonly expectedVersion: number;
}

/**
 * Adds a label to an errand, right after the investigation write that decided it - the high HSL risk the unit
 * manager's investigation assesses, or the HSL event analysis MAS/MAR decides to make.
 *
 * These labels are permanent (`IAF_VOF_PERMANENT_LABELS`), so a label is only ever added, never taken off. Adding
 * it notifies like the save it follows: a subscription profile on the label is how MAS/MAR and the head of
 * operations hear of the errand.
 *
 * The write is conditioned on the version that document write left, so it lands directly on top of it or not at
 * all: anybody else having written in between leaves the label for the next save rather than racing them. A
 * namespace without the label in its metadata is left alone.
 */
export class InvestigationDerivedLabelService {
  constructor(
    private readonly apiService: Pick<ApiService, 'get' | 'patch'> = new ApiService(),
    private readonly namespace: string = SUPPORTMANAGEMENT_NAMESPACE ?? '',
  ) {}

  /**
   * Answers the errand version after its own write, or `undefined` when it wrote nothing.
   *
   * The version is read back, never counted: how many steps Support Management takes for a label write is its
   * own business, and a version one step short makes the caller's next errand write - the classification saved
   * with the investigation - somebody else's change.
   */
  async applyDerivedLabel({ municipalityId, errandId, user, resourcePath, expectedVersion }: ApplyDerivedLabelRequest): Promise<number | undefined> {
    const baseURL = apiURL(apiServiceName('supportmanagement'));
    const url = `${municipalityId}/${this.namespace}/errands/${errandId}`;
    const readErrandVersion = async (): Promise<{ version: number; labels: Errand['labels'] }> => {
      const errand = await this.apiService.get<Errand>(
        { url, baseURL, includeResponseHeaders: true, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      );
      return { version: getErrandVersion(errand.data, errand.headers?.etag), labels: errand.data.labels };
    };
    const [errand, labels] = await Promise.all([
      readErrandVersion(),
      this.apiService.get<Labels | null>(
        { url: `${municipalityId}/${this.namespace}/metadata/labels`, baseURL, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      ),
    ]);
    if (errand.version !== expectedVersion) return undefined;

    const update = buildLabelAdditionUpdate({
      currentLabels: errand.labels,
      labelStructure: labels.data?.labelStructure,
      resourcePath,
    });
    if (!update) return undefined;

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
    return (await readErrandVersion()).version;
  }
}
