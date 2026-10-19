'use client';

import { Button, Modal } from '@sk-web-gui/react';
import { useSupportStore } from '@stores/index';
import { FC } from 'react';

import type { InvestigationPhaseEntryRequirementProps } from '../investigation-variant';

/**
 * Shown instead of the move to the follow-up while proposals wait for their decision. The follow-up follows up what
 * was approved, so each proposal is approved, partly approved or rejected first - under Åtgärder, where the dialog
 * leads. Why is told in the words the BFF would refuse the move with.
 */
export const UndecidedProposalsRequirement: FC<InvestigationPhaseEntryRequirementProps> = ({ onClose, context }) => {
  const setActiveTabKey = useSupportStore((state) => state.setActiveTabKey);

  return (
    <Modal
      show
      label="Åtgärdsförslagen är inte bedömda"
      className="w-[52rem]"
      data-cy="undecided-proposals-requirement"
      onClose={onClose}
    >
      <Modal.Content>
        <p>{context.measuresFollowUpRefusal}</p>
        <p>Förslagen bedöms under fliken Åtgärder, med Bedöm förslag på varje förslag.</p>
      </Modal.Content>
      <Modal.Footer>
        <Button
          variant="primary"
          color="vattjom"
          onClick={() => {
            setActiveTabKey('measures');
            onClose();
          }}
        >
          Gå till Åtgärder
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Stäng
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
