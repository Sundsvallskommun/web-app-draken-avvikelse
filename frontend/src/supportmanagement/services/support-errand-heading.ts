import type { SupportErrand } from './support-errand-service';
import { getLabelCategory, getLabelReportType } from './support-label-classification-service';
import { getLabelDisplayName } from './support-label-service';
import type { SupportMetadata } from './support-metadata-service';

/**
 * The heading of an errand: its type, which is the category of the investigation's label tree. Until the investigation has classified
 * the errand it has no type, so it is named by what was reported instead - a deviation or a misconduct, as the
 * overview names it - and by nothing when no report type is known either.
 */
export const getLabelCategorizedErrandHeading = (
  errand: SupportErrand,
  metadata: SupportMetadata | undefined
): string | undefined =>
  getLabelCategory(errand, metadata)?.displayName ||
  getLabelDisplayName(getLabelReportType(errand), metadata) ||
  undefined;
