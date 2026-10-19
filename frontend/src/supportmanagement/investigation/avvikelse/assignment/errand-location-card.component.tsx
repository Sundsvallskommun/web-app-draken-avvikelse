import { useConfigStore, useMetadataStore, useSupportStore } from '@stores/index';
import { isSupportErrandLocked } from '@supportmanagement/services/support-errand-service';
import { FC } from 'react';

import { useInvestigationProfileStore } from '../../investigation-profile-store';
import type { InvestigationDetailsHeaderProps } from '../../investigation-variant';
import { UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME } from '../avvikelse-schema-names';
import { isInvestigationDocumentEditable } from '../investigation-tab-state';
import { isWithLexInvestigation } from './avvikelse-assignment-policy';
import { MoveLocationButton } from './move-location-button.component';

/**
 * Ärendets plats, at the top of Ärendeuppgifter.
 *
 * Offered to the manager who may write the unit manager's investigation, on an errand that is not
 * locked, and not while it is with LEX: the LEX label, not the place, is what gives them access, and
 * the manager the move would assign could not act on it until it was handed back.
 */
export const ErrandLocationCard: FC<InvestigationDetailsHeaderProps> = ({ access, disabled }) => {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const labelStructure = useMetadataStore((s) => s.supportMetadata?.labels?.labelStructure);
  const profile = useInvestigationProfileStore((state) => state.profile);

  const managerDocument = profile?.documents.find(
    (document) => document.schemaName === UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME
  );
  const canMoveLocation =
    Boolean(supportErrand?.id) &&
    managerDocument !== undefined &&
    isInvestigationDocumentEditable(managerDocument, access) &&
    !isSupportErrandLocked(supportErrand!) &&
    !isWithLexInvestigation(supportErrand?.labels, labelStructure);

  if (!canMoveLocation) return null;

  return (
    <MoveLocationButton
      municipalityId={municipalityId}
      errandId={supportErrand!.id!}
      expectedVersion={supportErrand?.version}
      disabled={disabled}
    />
  );
};
