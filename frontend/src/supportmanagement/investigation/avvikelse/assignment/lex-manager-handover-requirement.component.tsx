'use client';

import { useSupportStore, useUserStore } from '@stores/index';
import { setSupportErrandAdmin, Status } from '@supportmanagement/services/support-errand-service';
import { getSupportErrandAssignedBy } from '@supportmanagement/services/support-history-service';
import { useRouter } from 'next/navigation';
import { FC, useEffect, useMemo, useState } from 'react';

import type { InvestigationPhaseEntryRequirementProps } from '../../investigation-variant';
import { investigationHandoverErrorMessage } from './avvikelse-assignment-service';
import { LEX_MANAGER_ROLE_KEY } from './avvikelse-handler-roles';
import { HandlerAssignmentModal } from './handler-assignment-modal.component';

/**
 * Asked of a LEX investigator about to send the errand to the decision: they hand it to a LEX manager
 * instead, who sends it on. The errand stays with LEX, so this is an ordinary change of handler, marked
 * Tilldelat for the manager to take up as every handover is.
 *
 * It goes back to the LEX manager who gave it to the investigator, so that one is offered first. The list
 * waits for the errand's history to say who that was; without the history the first manager stands, as before.
 */
export const LexManagerHandoverRequirement: FC<InvestigationPhaseEntryRequirementProps> = ({ onClose }) => {
  const errandId = useSupportStore((state) => state.supportErrand?.id);
  const seen = useSupportStore((state) => state.supportErrand);
  const administrators = useUserStore((state) => state.administrators);
  const handlerDirectoryState = useUserStore((state) => state.handlerDirectoryState);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [assignedBy, setAssignedBy] = useState<{ readFor: string; account?: string }>();

  useEffect(() => {
    if (!errandId) return;
    let cancelled = false;
    getSupportErrandAssignedBy(errandId).then(
      (account) => {
        if (!cancelled) setAssignedBy({ readFor: errandId, account });
      },
      () => {
        if (!cancelled) setAssignedBy({ readFor: errandId });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [errandId]);
  const assignedByRead = assignedBy !== undefined && assignedBy.readFor === errandId;

  const candidates = useMemo(
    () =>
      administrators
        .filter((administrator) => administrator.roleKeys.includes(LEX_MANAGER_ROLE_KEY))
        .map((administrator) => ({ adAccount: administrator.adAccount, displayName: administrator.displayName })),
    [administrators]
  );
  // An empty list only means "nobody holds this role" once the directory has actually been read. The list also
  // waits for the history, so the manager the errand came from is already chosen when it can be confirmed.
  const loadedCandidates = handlerDirectoryState === 'ready' && assignedByRead ? candidates : undefined;
  const loadError =
    handlerDirectoryState === 'error'
      ? 'Listan över behöriga handläggare kunde inte hämtas. Ladda om sidan och försök igen.'
      : undefined;

  if (!errandId) return null;

  const assign = async (adAccount: string) => {
    setIsSaving(true);
    setError(undefined);
    try {
      // Conditioned on the handler the page shows holding the errand.
      await setSupportErrandAdmin(errandId, adAccount, seen, Status.ASSIGNED);
      router.push('/oversikt');
    } catch (cause) {
      setError(investigationHandoverErrorMessage(cause, 'Ärendet kunde inte tilldelas en LEX-ansvarig. Försök igen.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <HandlerAssignmentModal
      show
      label="Tilldela LEX-ansvarig"
      description="Som LEX-utredare skickar du inte ärendet till beslut. Tilldela det till en LEX-ansvarig, som tar det vidare till beslut."
      selectLabel="LEX-ansvarig"
      confirmLabel="Tilldela LEX-ansvarig"
      confirmLoadingLabel="Tilldelar LEX-ansvarig"
      candidates={loadedCandidates}
      preferredAdAccount={assignedBy?.account}
      loadError={loadError}
      emptyMessage="Ingen LEX-ansvarig är konfigurerad för den här verksamheten. Kontakta support innan du går vidare."
      isSaving={isSaving}
      error={error}
      onAssign={(adAccount) => void assign(adAccount)}
      onClose={() => {
        if (!isSaving) onClose();
      }}
    />
  );
};
