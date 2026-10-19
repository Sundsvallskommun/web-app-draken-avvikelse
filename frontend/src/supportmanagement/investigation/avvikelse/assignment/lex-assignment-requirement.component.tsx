'use client';

import { useConfigStore, useSupportStore } from '@stores/index';
import { FC } from 'react';

import type { InvestigationPhaseEntryRequirementProps } from '../../investigation-variant';
import { LexAssignmentPrompt } from './lex-assignment-prompt.component';

/**
 * The handover to LEX, asked for when the errand is about to be sent to the decision while its saved
 * unit manager investigation assesses a suspected misconduct that has not been handed over.
 */
export const LexAssignmentRequirement: FC<InvestigationPhaseEntryRequirementProps> = ({ onClose }) => {
  const municipalityId = useConfigStore((state) => state.municipalityId);
  const errandId = useSupportStore((state) => state.supportErrand?.id);
  const version = useSupportStore((state) => state.supportErrand?.version);
  if (!errandId) return null;

  return (
    <LexAssignmentPrompt
      show
      municipalityId={municipalityId}
      errandId={errandId}
      // The handover is the first write of this flow, so it is conditioned on the errand as the page shows it.
      expectedVersion={version}
      description="Enhetschefens utredning bedömer ett misstänkt missförhållande, så ärendet ska tilldelas en LEX-ansvarig. Fasen byts inte nu: LEX-ansvarig skickar ärendet till beslut. Rapporttypen ändras från Avvikelse till Missförhållande, och när ärendet är tilldelat lämnar det din ärendelista."
      onClose={onClose}
    />
  );
};
