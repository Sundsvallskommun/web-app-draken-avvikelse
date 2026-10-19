'use client';

import { Alert } from '@sk-web-gui/react';

import { useInvestigationProfileStore } from '../investigation-profile-store';
import { LexTransferNotice } from './assignment/lex-transfer-notice.component';

/**
 * Rendered above the errand tab strip, so what concerns the whole errand is visible from any tab: a
 * profile fault, which the Utredning tab explains again once opened, and a reported misconduct on its
 * way to LEX.
 */
export function AvvikelseInvestigationNotice() {
  const profile = useInvestigationProfileStore((state) => state.profile);
  const status = useInvestigationProfileStore((state) => state.status);
  const unavailable = status === 'ready' && profile?.state === 'unavailable';

  return (
    <>
      {(status === 'error' || unavailable) && (
        <Alert
          type="warning"
          className="mb-16"
          data-cy={unavailable ? 'investigation-profile-unavailable' : 'investigation-profile-error'}
        >
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Title>
              {unavailable
                ? 'Utredningsfunktionen är tillfälligt otillgänglig'
                : 'Utredningsprofilen kunde inte laddas'}
            </Alert.Content.Title>
            <Alert.Content.Description>
              Utredningsflikarna är tillfälligt avstängda. Befintliga utredningsuppgifter döljs inte från
              Ärendeuppgifter.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}
      <LexTransferNotice />
    </>
  );
}
