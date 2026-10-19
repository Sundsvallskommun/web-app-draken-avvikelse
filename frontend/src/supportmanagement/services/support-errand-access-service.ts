import { apiService } from '@common/services/api-service';

import type { SupportErrand } from './support-errand-service';

/** What the user may do with an errand itself: limited read (knowing it exists), read, or read and write. */
type SupportErrandAccessLevel = 'LR' | 'R' | 'RW';

/** The current user's level on one errand, as Support Management's /access answers it. */
const getSupportErrandAccessLevel = (
  municipalityId: string,
  errandId: string
): Promise<SupportErrandAccessLevel | undefined> =>
  apiService
    .get<{ level?: SupportErrandAccessLevel }>(`supporterrands/${municipalityId}/${errandId}/errand-access`)
    .then((response) => response.data.level);

/**
 * Marks the errand as one the user may only know of, when Support Management says so, which locks it.
 * An unanswered question leaves the errand as it was read: Support Management refuses whatever the user
 * may not do either way, so a failed lookup costs a clearer page, not access.
 */
export const markLimitedSupportErrandAccess = async (
  municipalityId: string,
  errand: SupportErrand
): Promise<SupportErrand> => {
  if (!errand?.id) return errand;
  const level = await getSupportErrandAccessLevel(municipalityId, errand.id).catch(() => undefined);
  return level === 'LR' ? { ...errand, limitedAccess: true } : errand;
};
