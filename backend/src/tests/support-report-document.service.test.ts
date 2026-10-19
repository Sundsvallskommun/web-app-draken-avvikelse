import type { Phase } from '@/data-contracts/supportmanagement/data-contracts';
import { resolveReportDocumentEditability } from '@/services/support-report-document.service';

const reportDocument = { editableChannel: 'WEB_UI', lockedFromPhase: 'INVESTIGATION' };

/** The avvikelse workflow as the test namespace declares it. */
const workflow: Phase[] = [
  { id: 'phase-received', name: 'ACTUALIZATION', phaseOrder: 0 },
  { id: 'phase-review', name: 'REVIEW', phaseOrder: 1 },
  { id: 'phase-investigation', name: 'INVESTIGATION', phaseOrder: 2 },
  { id: 'phase-decision', name: 'DECISION', phaseOrder: 3 },
];

/** An errand in a phase, with the phases it has left behind it closed. */
const errandIn = (channel: string, phaseId?: string) => ({
  channel,
  phases: phaseId ? [{ phaseId: 'phase-received', ended: '2026-10-01T08:00:00Z' }, { phaseId }] : [],
});

describe('resolveReportDocumentEditability', () => {
  it.each(['phase-received', 'phase-review'])('opens the report of an errand registered in Draken in %s', phaseId => {
    expect(resolveReportDocumentEditability(errandIn('WEB_UI', phaseId), workflow, reportDocument)).toBe('editable');
  });

  it.each(['phase-investigation', 'phase-decision'])('locks it once the errand is in %s', phaseId => {
    expect(resolveReportDocumentEditability(errandIn('WEB_UI', phaseId), workflow, reportDocument)).toBe('investigation-started');
  });

  it.each(['ESERVICE', 'PHONE', ''])('never opens the report of an errand that came in on %s', channel => {
    expect(resolveReportDocumentEditability(errandIn(channel, 'phase-received'), workflow, reportDocument)).toBe('arrived-elsewhere');
  });

  it('keeps the report locked when nothing shows that the investigation has not started', () => {
    expect(resolveReportDocumentEditability(errandIn('WEB_UI'), workflow, reportDocument)).toBe('investigation-started');
    expect(resolveReportDocumentEditability(errandIn('WEB_UI', 'phase-received'), undefined, reportDocument)).toBe('investigation-started');
    expect(
      resolveReportDocumentEditability(
        errandIn('WEB_UI', 'phase-received'),
        workflow.filter(phase => phase.name !== 'INVESTIGATION'),
        reportDocument,
      ),
    ).toBe('investigation-started');
  });

  it('ignores a deprecated phase', () => {
    const deprecatedInvestigation = workflow.map(phase => (phase.name === 'INVESTIGATION' ? { ...phase, deprecated: true } : phase));

    expect(resolveReportDocumentEditability(errandIn('WEB_UI', 'phase-received'), deprecatedInvestigation, reportDocument)).toBe(
      'investigation-started',
    );
  });
});
