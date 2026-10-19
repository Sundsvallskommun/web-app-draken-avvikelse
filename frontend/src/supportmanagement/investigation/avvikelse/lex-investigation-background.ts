import type { Admin } from '@common/services/user-service';
import { plainTextToHtml } from '@common/utils/plain-text-to-html';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import dayjs from 'dayjs';

import type { InvestigationProfile } from '../investigation-profile';
import type { InvestigationFormData } from './investigation-document';

/** What the reported deviation says happened, in the report document the profile names. */
const REPORTED_EVENT_DESCRIPTION_FIELD = 'eventDescription';

interface LexInvestigationBackgroundSource {
  readonly errand: SupportErrand | undefined;
  readonly profile: InvestigationProfile | null | undefined;
  readonly administrators: readonly Pick<Admin, 'adAccount' | 'displayName'>[];
  /** When the investigator took the errand up after it was given to them, as the errand's history tells it. */
  readonly resumedAt: string | undefined;
}

const reportedEventDescription = (
  errand: SupportErrand | undefined,
  profile: InvestigationProfile | null | undefined
): string | undefined => {
  const reportKey = profile?.reportDocument?.key;
  const report = reportKey
    ? errand?.jsonParameters?.find((parameter) => parameter.key === reportKey)?.value
    : undefined;
  const description =
    typeof report === 'object' && report !== null
      ? (report as Record<string, unknown>)[REPORTED_EVENT_DESCRIPTION_FIELD]
      : undefined;
  // Katla reports it as plain text, Draken as markup; the investigation shows it in a rich text editor.
  return typeof description === 'string' && description.trim() ? plainTextToHtml(description) : undefined;
};

/**
 * The background of a lex Sarah investigation as the errand tells it: who investigates it, what was reported,
 * and the day the investigator took the errand up - the day the report reached them. Draken fills it in for an
 * investigation not yet saved, and the investigation keeps it, locked. The summary of the report starts as a copy
 * of what was reported, which the investigator rewrites. What the errand does not tell is left out.
 */
export const lexInvestigationBackground = ({
  errand,
  profile,
  administrators,
  resumedAt,
}: LexInvestigationBackgroundSource): InvestigationFormData => {
  const investigatorAccount = errand?.assignedUserId?.trim();
  const investigator = investigatorAccount
    ? administrators.find(
        (administrator) => administrator.adAccount.toLowerCase() === investigatorAccount.toLowerCase()
      )?.displayName || investigatorAccount
    : undefined;
  const description = reportedEventDescription(errand, profile);
  const received = resumedAt && dayjs(resumedAt).isValid() ? dayjs(resumedAt).format('YYYY-MM-DD') : undefined;

  return {
    ...(investigator ? { investigator } : {}),
    ...(description ? { reportedEventDescription: description, reportSummary: description } : {}),
    ...(received ? { reportReceivedDate: received } : {}),
  };
};
