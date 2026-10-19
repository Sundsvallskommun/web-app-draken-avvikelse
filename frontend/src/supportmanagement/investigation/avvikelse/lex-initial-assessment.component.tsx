'use client';

import { Disclosure } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import {
  isSupportErrandLocked,
  isSupportErrandOpenToHandover,
} from '@supportmanagement/services/support-errand-service';
import { Info } from 'lucide-react';
import { FC, useCallback, useMemo, useState } from 'react';

import { investigationDocumentAccess } from '../investigation-access';
import { useInvestigationProfileStore } from '../investigation-profile-store';
import type { InvestigationDetailsHeaderProps } from '../investigation-variant';
import { isWithLexInvestigation } from './assignment/avvikelse-assignment-policy';
import { recordSavedInvestigationDocument } from './record-saved-investigation-document';
import { readSavedInvestigationDocument } from './saved-investigation-document';
import { SupportInvestigationDocument } from './support-investigation-document.component';
import type { SupportInvestigationDocument as SavedInvestigationDocument } from './support-investigation-service';

/**
 * The documents the profile places in Ärendeuppgifter - LEX-ansvarig's initial assessment - each in its own
 * accordion, with the same document machinery the investigation tabs use: Support Management's grant decides
 * whether it is read or written, and a locked errand is read only.
 *
 * An assessment belongs to the errand while LEX has it, and is shown then. Once it is saved it stays part of the
 * errand's record, so it is shown afterwards too, to whoever Support Management lets read it.
 */
export const LexInitialAssessment: FC<InvestigationDetailsHeaderProps> = ({
  access,
  onDirtyChange,
  refreshAccess,
  revealTab,
}) => {
  const supportErrand = useSupportStore((state) => state.supportErrand);
  const labelStructure = useMetadataStore((state) => state.supportMetadata?.labels?.labelStructure);
  const canEditSupportManagement = useUserStore((state) => state.user.permissions.canEditSupportManagement);
  const profile = useInvestigationProfileStore((state) => state.profile);
  const [open, setOpen] = useState(true);

  const definitions = useMemo(
    () => (profile?.state === 'active' ? profile.documents.filter((document) => document.placement === 'details') : []),
    [profile]
  );
  const recordSavedDocument = useCallback(
    (document: SavedInvestigationDocument) => recordSavedInvestigationDocument(supportErrand?.id, document),
    [supportErrand?.id]
  );

  if (!supportErrand) return null;
  const withLex = isWithLexInvestigation(supportErrand.labels, labelStructure);
  const errandReadonly = isSupportErrandLocked(supportErrand);

  return (
    <>
      {definitions.map((definition) => {
        const documentAccess = investigationDocumentAccess(access, definition.key);
        const saved = Boolean(readSavedInvestigationDocument(supportErrand, definition.key));
        if (documentAccess === 'hidden' || (!withLex && !saved)) return null;

        return (
          <div key={definition.key} className="mb-32" data-cy={`details-document-${definition.key}`}>
            <Disclosure variant="alt" open={open} onToggleOpen={setOpen}>
              <Disclosure.Header>
                <Disclosure.Icon icon={<Info />} />
                <Disclosure.Title>{definition.tabLabel}</Disclosure.Title>
                <Disclosure.Button />
              </Disclosure.Header>
              <Disclosure.Content>
                <SupportInvestigationDocument
                  definition={definition}
                  readable
                  readonly={errandReadonly || documentAccess !== 'edit'}
                  canHandBack={isSupportErrandOpenToHandover(supportErrand) && documentAccess === 'edit'}
                  classificationReadonly={!canEditSupportManagement}
                  refreshAccess={refreshAccess}
                  onDirtyChange={(isDirty) => onDirtyChange(definition.key, isDirty)}
                  onSaved={recordSavedDocument}
                  onReveal={() => {
                    revealTab();
                    setOpen(true);
                  }}
                />
              </Disclosure.Content>
            </Disclosure>
          </div>
        );
      })}
    </>
  );
};
