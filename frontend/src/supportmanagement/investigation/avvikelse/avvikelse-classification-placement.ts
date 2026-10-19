import { useInvestigationProfileStore } from '../investigation-profile-store';
import {
  type AvvikelseClassificationPlacement,
  resolveSupportErrandClassificationPlacement,
} from './avvikelse-classification-policy';

export const resolveAvvikelseClassificationPlacement = (
  profile: Parameters<typeof resolveSupportErrandClassificationPlacement>[0]['profile']
): AvvikelseClassificationPlacement => resolveSupportErrandClassificationPlacement({ profile });

/**
 * The placement as avvikelse's own code sees it, policy payload included.
 *
 * Deliberately not routed through `getSupportErrandClassificationPlacement`: asking the shared
 * registry which variant is active, from inside the variant that would be the answer, closes a
 * module cycle and loses the concrete policy type on the way out. Shared consumers use the registry
 * adapter; avvikelse resolves its own placement directly.
 */
export const getAvvikelseClassificationPlacement = (): AvvikelseClassificationPlacement =>
  resolveAvvikelseClassificationPlacement(useInvestigationProfileStore.getState().profile);
