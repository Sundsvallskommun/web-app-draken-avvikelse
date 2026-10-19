import { type SupportErrandClassificationPlacement } from './classification-placement';
import { useInvestigationProfileStore } from './investigation-profile-store';
import { getInvestigationVariant } from './investigation-variant-registry';

/**
 * Thin runtime adapter. Every consumer asks this function whether Grundinformation or an
 * investigation document owns classification persistence, and which label tree the errand is
 * categorized from. The investigation variant decides.
 */
export const getSupportErrandClassificationPlacement = (): SupportErrandClassificationPlacement =>
  getInvestigationVariant().resolveClassificationPlacement(useInvestigationProfileStore.getState().profile);
