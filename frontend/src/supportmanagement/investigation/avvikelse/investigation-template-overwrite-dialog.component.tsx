'use client';

import { Button, Modal } from '@sk-web-gui/react';
import { FC } from 'react';

/** What the investigator answers when a change of the legal bases calls for another template over written text. */
export type InvestigationTemplateOverwriteChoice = 'overwrite' | 'keep' | 'cancel';

interface InvestigationTemplateOverwriteDialogProps {
  readonly show: boolean;
  readonly onChoose: (choice: InvestigationTemplateOverwriteChoice) => void;
}

/**
 * Asked when the legal bases call for another template while the investigation text holds something written: the
 * text is overwritten with the new template, kept as it is, or the change of the legal bases is undone. Closing the
 * dialog undoes the change too, so nothing happens that the investigator did not choose.
 */
export const InvestigationTemplateOverwriteDialog: FC<InvestigationTemplateOverwriteDialogProps> = ({
  show,
  onChoose,
}) => (
  <Modal
    show={show}
    label="Utredningsmallen ändras"
    className="w-[52rem]"
    data-cy="investigation-template-overwrite"
    onClose={() => onChoose('cancel')}
  >
    <Modal.Content>
      <p>Du har uppdaterat lagrummet och mallen kommer att skrivas över.</p>
    </Modal.Content>
    <Modal.Footer className="flex flex-wrap gap-12">
      <Button variant="primary" color="vattjom" onClick={() => onChoose('overwrite')}>
        Ja, skriv över mallen
      </Button>
      <Button variant="secondary" onClick={() => onChoose('keep')}>
        Nej
      </Button>
      <Button variant="tertiary" onClick={() => onChoose('cancel')}>
        Avbryt
      </Button>
    </Modal.Footer>
  </Modal>
);
