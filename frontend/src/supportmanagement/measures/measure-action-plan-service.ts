import { apiService } from '@common/services/api-service';
import { useSupportStore } from '@stores/support-store';

export interface CreatedMeasureActionPlan {
  readonly fileName: string;
  readonly attachmentId?: string;
}

interface ActionPlanResponseBody {
  data?: { fileName?: unknown; attachmentId?: unknown };
}

/**
 * Asks the BFF to render every stored measure of the errand as one PDF and attach it. The plan is
 * built from what Support Management holds, not from the list on screen, so nothing is sent along.
 */
export async function createMeasureActionPlan(
  municipalityId: string,
  errandId: string
): Promise<CreatedMeasureActionPlan> {
  const response = await apiService.post<ActionPlanResponseBody, Record<string, never>>(
    `supporterrands/${encodeURIComponent(municipalityId)}/${encodeURIComponent(errandId)}/measures/action-plan`,
    {}
  );
  const fileName = response.data?.data?.fileName;
  if (response.status !== 201 || typeof fileName !== 'string' || fileName.length === 0) {
    throw new Error('Handlingsplanen returnerade ett oväntat svar.');
  }
  const attachmentId = response.data.data?.attachmentId;
  return { fileName, ...(typeof attachmentId === 'string' ? { attachmentId } : {}) };
}

/**
 * The Bilagor tab shows the store, so the new plan is read back into it. A failed read is not the
 * plan failing: the attachment exists either way, and the tab reads again when it is next opened.
 *
 * The attachment service is loaded on use: it pulls in the file-upload component tree, which forms
 * an import cycle with casedata's attachment service, and loading that with the measures tab makes
 * the cycle resolve in the wrong order under test. Nothing here needs it before a plan exists.
 */
export async function refreshSupportAttachments(municipalityId: string, errandId: string): Promise<void> {
  try {
    const { getSupportAttachments } = await import('@supportmanagement/services/support-attachment-service');
    const attachments = await getSupportAttachments(errandId, municipalityId);
    useSupportStore.getState().setSupportAttachments(attachments);
  } catch {
    // Left to the Bilagor tab's own reload.
  }
}
