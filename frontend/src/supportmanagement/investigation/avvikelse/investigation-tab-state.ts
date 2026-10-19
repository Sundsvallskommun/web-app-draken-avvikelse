import { type InvestigationAccessState, investigationDocumentAccess } from '../investigation-access';
import type {
  InvestigationDocumentApplicability,
  InvestigationDocumentPlacement,
  InvestigationProfile,
} from '../investigation-profile';
import type { InvestigationProfileStatus } from '../investigation-profile-store';

export type InvestigationTabState =
  | 'loading'
  | 'error'
  | 'unavailable'
  | 'not-configured'
  | 'not-applicable'
  | 'no-access'
  | 'access-error'
  | 'ready';

/**
 * Which tab is asking, and for which errand. The investigation tab is the default so existing
 * callers keep their meaning; a restricted document only applies when the caller says the errand
 * is of that kind. `applicability` is the one kind the policy resolved for the errand, or nothing.
 */
export interface InvestigationDocumentContext {
  readonly access?: InvestigationAccessState;
  readonly placement?: InvestigationDocumentPlacement;
  readonly applicability?: Exclude<InvestigationDocumentApplicability, 'all' | 'deviation'>;
}

/** Whether a document declared for `appliesTo` belongs on an errand of the kind the policy resolved, if any. */
const appliesToErrandKind = (
  appliesTo: InvestigationDocumentApplicability,
  applicability: InvestigationDocumentContext['applicability']
): boolean => {
  if (appliesTo === 'all') return true;
  if (appliesTo === 'deviation') return applicability !== 'reported-misconduct';
  return appliesTo === applicability;
};

const appliesToErrand = (
  document: InvestigationProfile['documents'][number],
  context: InvestigationDocumentContext
): boolean =>
  (document.placement ?? 'investigation') === (context.placement ?? 'investigation') &&
  appliesToErrandKind(document.appliesTo ?? 'all', context.applicability);

/** The documents configured for this tab and errand, before the user's access is considered. */
export const configuredInvestigationDocuments = (
  profile: InvestigationProfile | null | undefined,
  context: InvestigationDocumentContext = {}
): InvestigationProfile['documents'] =>
  (profile?.documents ?? []).filter((document) => appliesToErrand(document, context));

/** The documents this user reaches. A document they are not mapped to is not theirs to open. */
export const visibleInvestigationDocuments = (
  profile: InvestigationProfile | null | undefined,
  context: InvestigationDocumentContext = {}
): InvestigationProfile['documents'] =>
  configuredInvestigationDocuments(profile, context).filter(
    (document) => investigationDocumentAccess(context.access ?? { status: 'loading' }, document.key) !== 'hidden'
  );

/** Editing requires an explicit current-errand grant. Missing access never enables a form. */
export const isInvestigationDocumentEditable = (
  document: InvestigationProfile['documents'][number],
  access: InvestigationAccessState
): boolean => investigationDocumentAccess(access, document.key) === 'edit';

/**
 * The document the tab shows: the one the user chose, else the first they can write in, else the first they reach.
 * A LEX investigator reads the unit manager's investigation as well, but opens the errand to write their own.
 */
export const selectedInvestigationDocumentKey = (
  visibleDocuments: InvestigationProfile['documents'],
  access: InvestigationAccessState,
  chosenKey: string | undefined
): string | undefined =>
  visibleDocuments.find((document) => document.key === chosenKey)?.key ??
  visibleDocuments.find((document) => isInvestigationDocumentEditable(document, access))?.key ??
  visibleDocuments[0]?.key;

/**
 * What an investigation tab shows once a capability flag has made it visible.
 *
 * Visibility no longer depends on the runtime profile, so every unusable profile has to explain
 * itself here rather than the tab silently disappearing. Kept pure so the ordering of these cases
 * is testable without rendering.
 */
export const resolveInvestigationTabState = (
  status: InvestigationProfileStatus,
  profile: InvestigationProfile | null | undefined,
  context: InvestigationDocumentContext = {}
): InvestigationTabState => {
  if (status === 'idle' || status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  // "disabled" means the profile was never requested - not SupportManagement, or an auth route.
  if (status === 'disabled' || !profile) return 'not-configured';
  if (profile.state === 'unavailable') return 'unavailable';
  if (profile.state !== 'active') return 'not-configured';
  if (configuredInvestigationDocuments(profile, context).length === 0) {
    // Documents exist for this tab, but none of them concerns this errand - a decision the errand does
    // not call for. Kept apart from "not configured", which is a deployment without such documents.
    const placement = context.placement ?? 'investigation';
    const placed = profile.documents.some((document) => (document.placement ?? 'investigation') === placement);
    return placed ? 'not-applicable' : 'not-configured';
  }
  if (!context.access || context.access.status === 'loading') return 'loading';
  if (context.access.status === 'error') return 'access-error';
  // Documents exist, but none of them are this user's. Kept apart from "not configured" so the
  // handler is told it is a question of permissions rather than of a missing deployment.
  if (visibleInvestigationDocuments(profile, context).length === 0) return 'no-access';
  return 'ready';
};
