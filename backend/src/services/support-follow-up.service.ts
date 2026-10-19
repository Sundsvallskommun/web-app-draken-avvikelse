import dayjs from 'dayjs';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { toUnitFollowUpErrand, type UnitFollowUpErrand } from '@/config/iaf-vof-follow-up';
import type { MeasureType, MetadataResponse, PageErrand } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { User } from '@/interfaces/users.interface';
import ApiService from '@/services/api.service';
import { supportMetadataCache } from '@/services/support-metadata-cache';
import { formatOffsetDateTime } from '@/utils/util';

import { SupportInvestigationPolicyService } from './support-investigation-policy.service';

const UNIT_FOLLOW_UP_PAGE_SIZE = 100;
/** Twelve months of a unit's errands fit well within this; reaching it is reported, not hidden. */
const UNIT_FOLLOW_UP_MAX_PAGES = 20;

/** The registration dates the follow-up covers, as calendar days, inclusive at both ends. */
export interface UnitFollowUpPeriod {
  readonly from: string;
  readonly to: string;
}

export interface UnitFollowUpSnapshot {
  readonly errands: UnitFollowUpErrand[];
  /** The namespace's measure types, so the client can name each measure's type. */
  readonly measureTypes: MeasureType[];
  /** Set when the period held more errands than are read; the view says the list is incomplete. */
  readonly truncated: boolean;
}

/**
 * Upstream filter for the errands registered in the period. Support Management applies its own access
 * control to the list, so a unit manager reads their own units, and an errand with LEX only once it is
 * handed back.
 */
export const unitFollowUpFilter = ({ from, to }: UnitFollowUpPeriod): string =>
  `created>'${formatOffsetDateTime(dayjs(from).startOf('day'))}' and created<'${formatOffsetDateTime(dayjs(to).endOf('day'))}'`;

/**
 * The unit follow-up: every errand the user reaches that was registered in the period, with the facts
 * the IAF/VOF investigation and decision documents hold, and every measure on them.
 *
 * Like the planned measures it reads the errand list, which carries the JSON parameters and measures the
 * user may read; nothing is fetched per errand. The IAF/VOF schema roles are fixed, so an application
 * without that policy has no follow-up to read.
 */
export class SupportFollowUpService {
  constructor(
    private readonly apiService = new ApiService(),
    private readonly policyService = new SupportInvestigationPolicyService(),
  ) {}

  private baseUrl(municipalityId: string): string {
    return `${apiServiceName('supportmanagement')}/${municipalityId}/${SUPPORTMANAGEMENT_NAMESPACE}`;
  }

  async read(municipalityId: string, period: UnitFollowUpPeriod, user: User): Promise<UnitFollowUpSnapshot> {
    if (!this.policyService.iafVofClassificationPolicy) {
      throw new HttpException(409, 'Unit follow-up is not available for this application');
    }
    if ((await this.policyService.getState()) === 'unavailable') throw new HttpException(503, 'Investigation policy is temporarily unavailable');

    const errands: UnitFollowUpErrand[] = [];
    const seen = new Set<string>();
    let truncated = false;
    // Sorted by creation so paging stays stable while others write.
    for (let page = 0; ; page++) {
      if (page >= UNIT_FOLLOW_UP_MAX_PAGES) {
        truncated = true;
        break;
      }
      const query = new URLSearchParams({
        filter: unitFollowUpFilter(period),
        page: String(page),
        size: String(UNIT_FOLLOW_UP_PAGE_SIZE),
        sort: 'created,asc',
      });
      const result = await this.apiService.get<PageErrand>(
        { url: `${this.baseUrl(municipalityId)}/errands?${query.toString()}`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      );
      const content = result.data.content ?? [];
      for (const errand of content) {
        const followUp = toUnitFollowUpErrand(this.policyService.profile, errand);
        // An errand that moved between pages while others wrote is kept once.
        if (followUp && !seen.has(followUp.id)) {
          seen.add(followUp.id);
          errands.push(followUp);
        }
      }
      if (content.length === 0 || result.data.last !== false) break;
    }

    const metadata = (
      await supportMetadataCache.read<MetadataResponse>(
        this.apiService,
        { url: `${this.baseUrl(municipalityId)}/metadata`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      )
    ).data;
    return { errands, measureTypes: metadata.measureTypes ?? [], truncated };
  }
}
