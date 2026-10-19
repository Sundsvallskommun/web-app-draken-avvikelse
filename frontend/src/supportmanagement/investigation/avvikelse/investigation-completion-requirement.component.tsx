'use client';

import { Button, Modal } from '@sk-web-gui/react';
import { useSupportStore } from '@stores/index';
import { FC } from 'react';

import { useInvestigationProfileStore } from '../investigation-profile-store';
import type { InvestigationPhaseEntryRequirementProps } from '../investigation-variant';
import {
  describeIncompleteDecisionInvestigation,
  resolveDecisionInvestigation,
} from './avvikelse-decision-investigation';

/**
 * Shown instead of the move to the decision while the investigation the errand is decided on is not
 * saved as completed. There is nothing to do from here: the investigation is finished on its own tab,
 * so the dialog only says which one and closes.
 */
export const InvestigationCompletionRequirement: FC<InvestigationPhaseEntryRequirementProps> = ({ onClose }) => {
  const errand = useSupportStore((state) => state.supportErrand);
  const profile = useInvestigationProfileStore((state) => state.profile);
  const required = resolveDecisionInvestigation({ errand, profile });
  if (!required) return null;

  return (
    <Modal
      show
      label="Utredningen är inte klar"
      className="w-[52rem]"
      data-cy="investigation-completion-requirement"
      onClose={onClose}
    >
      <Modal.Content>
        <p>{describeIncompleteDecisionInvestigation(required)}</p>
      </Modal.Content>
      <Modal.Footer>
        <Button variant="primary" color="vattjom" className="w-full" onClick={onClose}>
          Stäng
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
