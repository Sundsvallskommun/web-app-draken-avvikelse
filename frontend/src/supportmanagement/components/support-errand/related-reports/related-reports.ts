import type { CaseStatusResponse } from '@common/services/casestatus-service';
import type { SupportStakeholderFormModel } from '@supportmanagement/services/support-errand-service';

/** A report on the brukare as Relaterade rapporter lists it: what CaseStatus says of it, and its subcategory if known. */
export type RelatedReport = CaseStatusResponse & { readonly subcategory?: string };

/** The party id of the person the report concerns - the errand's owner, the brukare - when they are a person. */
export const brukarePartyId = (
  brukare: Pick<SupportStakeholderFormModel, 'stakeholderType' | 'externalId'> | undefined
): string | undefined => (brukare?.stakeholderType === 'PERSON' && brukare.externalId ? brukare.externalId : undefined);

/** The brukare's reports besides the one being read. */
export const otherReports = (
  statuses: readonly CaseStatusResponse[],
  errandId: string | undefined
): CaseStatusResponse[] => statuses.filter((status) => status.caseId !== errandId);
