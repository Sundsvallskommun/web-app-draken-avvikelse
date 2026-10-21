import { apiService } from '@common/services/api-service';
import { type SeenSupportErrand, seenSupportErrandFacts } from '@supportmanagement/services/support-errand-facts';
import type { AxiosError } from 'axios';

/** The named handovers the backend implements. The client names the step and never composes it. */
export type InvestigationHandoverStep =
  | 'assign-lex'
  | 'return-to-manager'
  | 'decline-lex'
  | 'move-location'
  | 'request-vc-comment';

export interface UnitManagerCandidate {
  adAccount: string;
  displayName: string;
  /** The AccessMapper role this person holds for the place, e.g. `UNIT_MANAGER`. */
  roleKey: string;
}

/** One heading in the picker. The labels come from the backend so they are defined in one place. */
export interface ManagerRoleOption {
  key: string;
  label: string;
}

export interface UnitManagerResponse {
  /** The managers for the place, most specific access first. */
  candidates: UnitManagerCandidate[];
  roles: ManagerRoleOption[];
  locationResourcePath: string;
  /** The place's name. Show this, never the resource path - that is an identity, not a label. */
  locationDisplayName: string;
}

/**
 * Resolves who the errand goes back to, so the choice can be shown before it is made. The backend
 * resolves it again when the handover is applied; this is a preview, never the decision itself.
 */
export const getUnitManager = (errandId: string): Promise<UnitManagerResponse> =>
  apiService.get<UnitManagerResponse>(`supporterrands/${errandId}/unit-manager`).then((res) => res.data);

/**
 * Resolves the managers of a place the errand would be moved to, so the choice can be shown before
 * it is made. Like the return preview, the backend resolves the list again when the move is applied.
 */
export const getLocationManagers = (errandId: string, locationLabelId: string): Promise<UnitManagerResponse> =>
  apiService
    .get<UnitManagerResponse>(`supporterrands/${errandId}/location-managers/${encodeURIComponent(locationLabelId)}`)
    .then((res) => res.data);

export interface InvestigationHandoverOptions {
  /** The place the errand is moved to. Only `move-location` reads it. */
  readonly locationLabelId?: string;
}

/**
 * Applies one handover step to the errand as the handler saw it (`seen`): the BFF refuses it when the errand's
 * handler, status or routing has moved on since.
 *
 * Answers 204 and returns nothing to read back: a step that moves access has usually just taken the
 * errand away from the caller, so there is no errand left for them to fetch. The caller navigates
 * away instead of refreshing.
 */
export const applyInvestigationHandover = async (
  errandId: string,
  step: InvestigationHandoverStep,
  seen: SeenSupportErrand | undefined,
  assignedUserId?: string,
  options: InvestigationHandoverOptions = {}
): Promise<void> => {
  const body = {
    seenFacts: seenSupportErrandFacts(seen),
    ...(assignedUserId ? { assignedUserId } : {}),
    ...(options.locationLabelId ? { locationLabelId: options.locationLabelId } : {}),
  };
  await apiService.post<void, typeof body>(`supporterrands/${errandId}/investigation-handover/${step}`, body);
};

const conflictMessages: Record<string, string> = {
  409: 'Ändringen sparades inte: ärendet har ändrats sedan du öppnade det, eller saknar uppgifter som behövs. Ladda om ärendet och gör om ändringen.',
  412: 'Ändringen sparades inte: någon annan har ändrat ärendet sedan du öppnade det. Ladda om ärendet och gör om ändringen.',
  403: 'Du saknar behörighet att utföra det här steget.',
};

/**
 * Somebody else's write came between the BFF's read of the errand and its own write. The backend reports it as the
 * HTTP precondition it is and not as anything to act on.
 */
const VERSION_CONFLICT_STATUS = 412;

/** Turns a failed handover into something a handler can act on, keeping the backend's own reason when it has one. */
export const investigationHandoverErrorMessage = (error: unknown, fallback: string): string => {
  const response = (error as AxiosError<{ message?: string }>)?.response;
  if (response?.status === VERSION_CONFLICT_STATUS) return conflictMessages[VERSION_CONFLICT_STATUS];

  const apiMessage = response?.data?.message;
  if (apiMessage) return apiMessage;

  const statusMessage = response?.status ? conflictMessages[String(response.status)] : undefined;
  if (statusMessage) return statusMessage;

  if (error instanceof Error && error.message) return error.message;
  return fallback;
};
