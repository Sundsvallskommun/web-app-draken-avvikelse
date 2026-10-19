import { Button } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore } from '@stores/index';
import { useRouter } from 'next/navigation';
import { FC, useCallback, useMemo, useState } from 'react';

import {
  applyInvestigationHandover,
  getLocationManagers,
  investigationHandoverErrorMessage,
} from './avvikelse-assignment-service';
import { describePlace, resolveErrandPlace, selectablePlaceNodes } from './errand-location';
import { MoveLocationModal } from './move-location-modal.component';

interface MoveLocationButtonProps {
  municipalityId: string;
  errandId: string;
  expectedVersion: number | undefined;
  disabled: boolean;
}

/**
 * Shows where the errand's labels put it, and lets the manager who wrongly received it send it on.
 *
 * The place shown here is the one AccessMapper matches on, read from the labels. It is not the place
 * in Ärendeuppgifter: that is what the reporter wrote, and it stays as it arrived. When the two
 * differ, this one is the one that decides who sees the errand - which is exactly why a wrong
 * routing is fixed here and not by editing the report.
 *
 * Moving the errand writes the mover out of it, so the page navigates to the overview afterwards
 * instead of re-rendering an errand they can no longer see.
 */
export const MoveLocationButton: FC<MoveLocationButtonProps> = ({
  municipalityId,
  errandId,
  expectedVersion,
  disabled,
}) => {
  const router = useRouter();
  const labels = useSupportStore((s) => s.supportErrand?.labels);
  const labelStructure = useMetadataStore((s) => s.supportMetadata?.labels?.labelStructure);
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const currentPlace = useMemo(() => resolveErrandPlace(labels, labelStructure), [labels, labelStructure]);
  const placeNodes = useMemo(() => selectablePlaceNodes(labelStructure), [labelStructure]);
  const currentPlaceText = currentPlace ? describePlace(currentPlace.presentation) : undefined;

  const loadManagers = useCallback(
    (locationLabelId: string) => getLocationManagers(municipalityId, errandId, locationLabelId),
    [errandId, municipalityId]
  );

  // A deployment whose metadata has no place structure has nothing to move an errand to, so the
  // card is not shown at all rather than shown with nothing to offer.
  if (placeNodes.length === 0) return null;

  const move = async (locationLabelId: string, adAccount: string) => {
    if (typeof expectedVersion !== 'number') {
      setError('Ärendets version saknas. Ladda om ärendet innan du flyttar det.');
      return;
    }

    setIsSaving(true);
    setError(undefined);
    try {
      await applyInvestigationHandover(municipalityId, errandId, 'move-location', expectedVersion, adAccount, {
        locationLabelId,
      });
      router.push('/oversikt');
    } catch (e) {
      setError(investigationHandoverErrorMessage(e, 'Ärendet kunde inte flyttas. Försök igen.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-button border bg-background-content p-16" data-cy="errand-location">
      <div className="flex flex-wrap items-start justify-between gap-16">
        <div className="min-w-0">
          <div className="font-bold">Ärendets plats</div>
          <div className="break-words" data-cy="errand-location-name">
            {currentPlaceText ?? 'Ingen plats är satt på ärendet.'}
          </div>
          <p className="text-small text-text-secondary mt-4 mb-0">
            Platsen styr vem som når ärendet. Har ärendet kommit till fel enhet flyttas det hit, utan att de
            inrapporterade uppgifterna ändras.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={disabled}
          data-cy="move-location-button"
          onClick={() => {
            setError(undefined);
            setShowModal(true);
          }}
        >
          Flytta till annan plats
        </Button>
      </div>

      {showModal && (
        <MoveLocationModal
          show={showModal}
          currentPlace={currentPlaceText}
          placeNodes={placeNodes}
          loadManagers={loadManagers}
          isSaving={isSaving}
          error={error}
          onMove={(locationLabelId, adAccount) => void move(locationLabelId, adAccount)}
          onClose={() => {
            if (!isSaving) setShowModal(false);
          }}
        />
      )}
    </div>
  );
};
