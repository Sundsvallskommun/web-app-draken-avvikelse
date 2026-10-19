import type { SupportLabelTreeProfile } from '../services/support-label-classification-projector';

/** Which part of the UI persists the errand's classification. */
type SupportErrandClassificationOwner = 'basics' | 'investigation' | 'unavailable';

/**
 * The shared vocabulary for classification placement: who owns persistence, and which label tree
 * the errand is categorized from. Deliberately says nothing about *which* variant is active - a
 * variant's own policy payload is private to that variant and travels on its own placement type.
 */
export interface SupportErrandClassificationPlacement {
  readonly owner: SupportErrandClassificationOwner;
  /** The label tree the errand is categorized from. */
  readonly labelTree: SupportLabelTreeProfile;
}
