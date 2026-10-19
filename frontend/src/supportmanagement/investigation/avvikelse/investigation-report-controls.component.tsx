'use client';

import { Alert, Button } from '@sk-web-gui/react';
import dayjs from 'dayjs';
import { Eye, FileText } from 'lucide-react';

import type { InvestigationAfterCompletion } from './investigation-after-completion';
import { type InvestigationReport, isPendingInvestigationReport } from './investigation-form-data';

interface InvestigationReportControlsProps {
  readonly documentKey: string;
  /** The form currently answers Ja to the completion question, saved or not. */
  readonly completedInDraft: boolean;
  /** The stored document is marked completed, so it is locked and may be reported. */
  readonly locked: boolean;
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly canEdit: boolean;
  readonly reports: readonly InvestigationReport[];
  /** Saves the form as completed if it is not already, then creates the report. */
  readonly onGenerate: (form: HTMLFormElement | null) => void;
  /** Renders the form as it currently is, without saving it. */
  readonly onPreview: () => void;
  readonly onUnlock: () => void;
  /**
   * Set where the errand has measures: they are registered in the Åtgärder tab, away from the document, so every
   * investigation leads there from where it is finished.
   */
  readonly onGoToMeasures?: () => void;
  /** The investigator proposes measures others decide on, so finishing the investigation reminds of them. */
  readonly proposesMeasures?: boolean;
  /** The errand is known to have no measures, which the one finishing the investigation is told - not stopped by. */
  readonly withoutMeasures?: boolean;
  /** What follows once the investigation is finished, which the one finishing it is told (`investigationAfterCompletion`). */
  readonly afterCompletion?: InvestigationAfterCompletion;
}

const COMPLETED_NOTICES: Readonly<Record<InvestigationAfterCompletion, string>> = {
  'hand-over-to-lex-manager':
    'När du är klar med din utredning, ska du skapa en rapport och tilldela ärendet till LEX-ansvarig.',
  'create-report': 'När du är klar med din utredning, ska du skapa en rapport.',
  save: 'Din del av utredningen är klar. Tryck på Spara ärende. Ärendet behöver inte tilldelas någon.',
};

/**
 * The report controls at the end of an investigation document. Answering Ja enables Skapa rapport,
 * which saves the document as completed and creates the report in one go; the document is then
 * locked, and the owner can unlock it to change it and generate another, numbered report. The
 * preview renders the form as it is, saved or not.
 */
export function InvestigationReportControls({
  documentKey,
  completedInDraft,
  locked,
  dirty,
  busy,
  canEdit,
  reports,
  onGenerate,
  onPreview,
  onUnlock,
  onGoToMeasures,
  proposesMeasures = false,
  withoutMeasures = false,
  afterCompletion = 'hand-over-to-lex-manager',
}: Readonly<InvestigationReportControlsProps>) {
  const pending = reports.some(isPendingInvestigationReport);
  const canGenerate = completedInDraft && canEdit && !busy;

  return (
    <div className="flex flex-col gap-16" data-cy={`investigation-report-${documentKey}`}>
      {completedInDraft && (
        <Alert type="info" data-cy="investigation-report-completed-notice">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description>{COMPLETED_NOTICES[afterCompletion]}</Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}
      {completedInDraft && withoutMeasures && onGoToMeasures && (
        <Alert type="info" data-cy="investigation-no-measures-notice">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description>
              Det finns inga åtgärder i ärendet. Lägg till åtgärder under fliken Åtgärder.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}
      {onGoToMeasures && (
        <div className="flex flex-wrap items-center gap-12" data-cy="investigation-measures-link">
          {completedInDraft && proposesMeasures ? (
            <span data-cy="investigation-measures-reminder">
              Har du förslag på åtgärder? Registrera dem i fliken Åtgärder innan du tilldelar ärendet.
            </span>
          ) : (
            <span>Åtgärder registreras under fliken Åtgärder.</span>
          )}
          <Button type="button" variant="tertiary" size="sm" onClick={onGoToMeasures}>
            Gå till Åtgärder
          </Button>
        </div>
      )}
      <p className="text-small">
        När du har färdigställt utredningen kan du skapa en rapport. Rapporten kommer att läggas till som en bilaga på
        ärendet.
      </p>
      <div className="flex flex-wrap items-center gap-12">
        <Button
          type="button"
          variant="primary"
          leftIcon={<FileText />}
          disabled={!canGenerate}
          loading={busy}
          onClick={(event) => onGenerate(event.currentTarget.form)}
          data-cy="investigation-report-generate"
        >
          {pending ? 'Slutför rapport' : 'Skapa rapport'}
        </Button>
        <Button
          type="button"
          variant="link"
          leftIcon={<Eye />}
          disabled={busy}
          onClick={onPreview}
          data-cy="investigation-report-preview"
        >
          Förhandsgranska rapport
        </Button>
        {locked && canEdit && (
          <Button
            type="button"
            variant="tertiary"
            disabled={busy || pending}
            onClick={onUnlock}
            data-cy="investigation-report-unlock"
          >
            Lås upp utredningen
          </Button>
        )}
      </div>
      {reports.length > 0 && (
        <div>
          <h4 className="text-label-medium font-bold">Rapporter</h4>
          <ul className="mt-4 flex flex-col gap-4" data-cy="investigation-report-list">
            {reports.map((report, index) => (
              <li key={`${report.fileName}-${index}`} className="text-small">
                {isPendingInvestigationReport(report) && <span>Väntar på bekräftelse · </span>}
                <span className="font-bold">{report.fileName}</span>{' '}
                <span>
                  · <time dateTime={report.generatedAt}>{dayjs(report.generatedAt).format('YYYY-MM-DD HH:mm')}</time> av{' '}
                  {report.generatedBy}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-small">Bekräftade rapporter finns under fliken Bilagor.</p>
        </div>
      )}
    </div>
  );
}
