import { isInSupportPhase, type SupportPhaseContext } from '@supportmanagement/services/support-phase-service';

export interface PhaseBoundTab {
  readonly key: string;
  readonly visibleFor: boolean;
  /** The workflow phase the tab belongs to; tabs that belong to no phase leave this out. */
  readonly phaseName?: string;
}

/**
 * The tab an errand lands on, when it is opened or its phase changes: the first visible tab that
 * belongs to the phase the errand is in.
 *
 * Several tabs can share a phase - Utredning and Åtgärder both belong to the investigation - and the
 * order the tab strip already has decides between them. A tab
 * that belongs to the phase but is not offered to this user is passed over. Undefined when no visible
 * tab belongs to the active phase, which leaves the tab as it was.
 */
export const resolvePhaseTabKey = (tabs: readonly PhaseBoundTab[], phases: SupportPhaseContext): string | undefined =>
  tabs.find((tab) => tab.visibleFor && tab.phaseName !== undefined && isInSupportPhase(tab.phaseName, phases))?.key;
