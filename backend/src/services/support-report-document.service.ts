import type { Errand, Phase } from '@/data-contracts/supportmanagement/data-contracts';
import type { SupportInvestigationReportDocumentDto } from '@/dtos/support-investigation-profile.dto';

import { getActiveErrandPhaseId } from './support-errand.service';

/**
 * Whether the report of an errand may be filled in: only on an errand registered in Draken, and only
 * until the investigation starts. Everything else is read-only, for a different reason each.
 */
export type ReportDocumentEditability = 'editable' | 'arrived-elsewhere' | 'investigation-started';

export const REPORT_DOCUMENT_REFUSALS: Readonly<Record<Exclude<ReportDocumentEditability, 'editable'>, string>> = Object.freeze({
  'arrived-elsewhere': 'The report of an errand that was not registered in Draken is the record of what was reported and cannot be changed',
  'investigation-started': 'The report can no longer be changed once the investigation has started',
});

/**
 * Decides from the errand's channel and the phase it is in. The investigation starts in the phase the
 * report names; an errand there or further along has a locked report. A workflow without that phase,
 * or an errand outside the workflow, cannot show that the investigation has not started, so the
 * report stays locked rather than open.
 */
export const resolveReportDocumentEditability = (
  errand: Pick<Errand, 'channel' | 'phases'>,
  phases: readonly Phase[] | undefined,
  reportDocument: Pick<SupportInvestigationReportDocumentDto, 'editableChannel' | 'lockedFromPhase'>,
): ReportDocumentEditability => {
  if (errand.channel !== reportDocument.editableChannel) return 'arrived-elsewhere';

  const workflow = (phases ?? []).filter(phase => !phase.deprecated && phase.id);
  const lockingPhase = workflow.find(phase => phase.name === reportDocument.lockedFromPhase);
  const activePhaseId = getActiveErrandPhaseId(errand);
  const activePhase = workflow.find(phase => phase.id === activePhaseId);
  if (!lockingPhase || !activePhase) return 'investigation-started';

  return (activePhase.phaseOrder ?? 0) < (lockingPhase.phaseOrder ?? 0) ? 'editable' : 'investigation-started';
};
