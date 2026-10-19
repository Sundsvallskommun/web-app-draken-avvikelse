import { hasClassificationCategory } from './support-errand-emptiness';
import type { SupportErrand } from './support-errand-service';
import { getCategorizationLabels } from './support-errand-service';

/**
 * LEGACY_CLASSIFICATION: temporary read-only display of the classification of errands registered before
 * label categorization. To remove: delete this file and every branch marked LEGACY_CLASSIFICATION.
 */

/** Shown from the classification, for errands without categorization labels. */
export const showsLegacyClassification = (errand: SupportErrand): boolean =>
  getCategorizationLabels(errand).length === 0 && hasClassificationCategory(errand.classification?.category);
