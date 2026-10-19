'use client';

import { Button, Dialog, FormControl, FormErrorMessage, FormLabel, Textarea } from '@sk-web-gui/react';
import { ArchiveX } from 'lucide-react';
import { FC, useState } from 'react';

/**
 * Closing an errand before its workflow ends, as MEX asks it: the handler says why, and the reason is kept as a
 * service note on the errand. The dialog stays open while the close is under way and after a failed one.
 */
export const SupportEarlyCloseDialog: FC<{
  show: boolean;
  closing: boolean;
  onCancel: () => void;
  onConfirm: (motivation: string) => void;
}> = ({ show, closing, onCancel, onConfirm }) => {
  const [motivation, setMotivation] = useState('');
  const [motivationMissing, setMotivationMissing] = useState(false);

  const confirm = () => {
    const reason = motivation.trim();
    if (!reason) {
      setMotivationMissing(true);
      return;
    }
    onConfirm(reason);
  };

  return (
    <Dialog show={show} className="w-[36rem]">
      <Dialog.Content className="flex flex-col items-center text-center">
        <ArchiveX className="text-vattjom-surface-primary" size={32} />
        <h1 className="text-h3-md">Avsluta ärendet?</h1>
        <FormControl id="early-close-motivation" className="w-full" invalid={motivationMissing}>
          <FormLabel>
            Beskriv orsak till avslut<span aria-hidden="true">*</span>
          </FormLabel>
          <Textarea
            className="w-full"
            rows={4}
            value={motivation}
            onChange={(event) => {
              setMotivation(event.target.value);
              setMotivationMissing(false);
            }}
            data-cy="early-close-motivation"
          />
          {motivationMissing && <FormErrorMessage>Orsak till avslut måste anges.</FormErrorMessage>}
        </FormControl>
        <small className="my-0 text-dark-secondary">Texten sparas som en tjänsteanteckning på ärendet.</small>
        <p>Du kommer nu att avsluta ärendet innan hela processen är komplett. Är du säker att du vill avsluta?</p>
      </Dialog.Content>
      <Dialog.Buttons className="flex justify-center">
        <Button className="w-[12.8rem]" variant="secondary" disabled={closing} onClick={onCancel}>
          Nej
        </Button>
        <Button
          className="w-[12.8rem]"
          variant="primary"
          loading={closing}
          onClick={confirm}
          data-cy="early-close-confirm"
        >
          Ja
        </Button>
      </Dialog.Buttons>
    </Dialog>
  );
};
