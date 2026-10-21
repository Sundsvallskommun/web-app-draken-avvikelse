'use client';

import { useSupportStore } from '@stores/index';
import { FC } from 'react';

import type { InvestigationPhaseEntryRequirementProps } from '../../investigation-variant';
import { LexAssignmentPrompt } from './lex-assignment-prompt.component';

/**
 * The handover to LEX, asked for when the errand is about to be sent to the decision while its saved
 * unit manager investigation assesses a suspected misconduct that has not been handed over.
 */
export const LexAssignmentRequirement: FC<InvestigationPhaseEntryRequirementProps> = ({ onClose }) => {
  const errandId = useSupportStore((state) => state.supportErrand?.id);
  const seen = useSupportStore((state) => state.supportErrand);
  if (!errandId) return null;

  return (
    <LexAssignmentPrompt
      show
      errandId={errandId}
      // The handover is conditioned on the errand as the page shows it.
      seen={seen}
      description="Enhetschefens utredning bedömer ett misstänkt missförhållande, så ärendet ska tilldelas en LEX-ansvarig. Fasen byts inte nu: LEX-ansvarig skickar ärendet till beslut. Rapporttypen ändras från Avvikelse till Missförhållande, och när ärendet är tilldelat lämnar det din ärendelista."
      onClose={onClose}
    />
  );
};
