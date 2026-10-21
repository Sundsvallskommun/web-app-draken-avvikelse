import { useUserStore } from '@stores/index';
import type { SeenSupportErrand } from '@supportmanagement/services/support-errand-facts';
import { useRouter } from 'next/navigation';
import { FC, useMemo, useState } from 'react';

import { applyInvestigationHandover, investigationHandoverErrorMessage } from './avvikelse-assignment-service';
import { LEX_MANAGER_ROLE_KEY } from './avvikelse-handler-roles';
import { HandlerAssignmentModal } from './handler-assignment-modal.component';

interface LexAssignmentPromptProps {
  show: boolean;
  errandId: string;
  /** The errand as the handler saw it; the backend refuses the handover when its handler, status or routing moved since. */
  seen: SeenSupportErrand | undefined;
  /** Why the handover is asked for now; the dialog explains the classification when left out. */
  description?: string;
  /** Puts the handover off. It is still required before the errand can be sent to the decision. */
  onClose: () => void;
}

/**
 * Asks the unit manager to hand a suspected misconduct to a LEX manager.
 *
 * The handover can be put off - the dialog closes - but not skipped: the errand cannot enter the
 * decision phase while its saved investigation assesses a suspected misconduct that has not been handed
 * over, and the phase change asks for the handover again.
 *
 * Once the handover lands, the errand belongs to the LEX roles: Support Management's AccessMapper
 * stops showing it to the manager who just handed it over. There is therefore nothing left to
 * re-render, and this navigates to the overview rather than refreshing an errand that is gone.
 */
export const LexAssignmentPrompt: FC<LexAssignmentPromptProps> = ({
  show,
  errandId,
  seen,
  description = 'Ärendet är nu klassificerat som ett misstänkt missförhållande och ska tilldelas en LEX-ansvarig, som sedan skickar det till beslut. Rapporttypen ändras från Avvikelse till Missförhållande, och när ärendet är tilldelat lämnar det din ärendelista.',
  onClose,
}) => {
  const administrators = useUserStore((s) => s.administrators);
  const handlerDirectoryState = useUserStore((s) => s.handlerDirectoryState);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const candidates = useMemo(
    () =>
      administrators
        .filter((administrator) => administrator.roleKeys.includes(LEX_MANAGER_ROLE_KEY))
        .map((administrator) => ({ adAccount: administrator.adAccount, displayName: administrator.displayName })),
    [administrators]
  );

  // An empty list only means "nobody holds this role" once the directory has actually been read.
  // Claiming that while the lookup is failing sends the handler to support over a passing outage.
  const loadedCandidates = handlerDirectoryState === 'ready' ? candidates : undefined;
  const loadError =
    handlerDirectoryState === 'error'
      ? 'Listan över behöriga handläggare kunde inte hämtas. Ladda om sidan och försök igen.'
      : undefined;

  const assign = async (adAccount: string) => {
    if (!seen?.facts) {
      setError('Ärendet är inte helt inläst. Ladda om ärendet innan du tilldelar en LEX-ansvarig.');
      return;
    }

    setIsSaving(true);
    setError(undefined);
    try {
      await applyInvestigationHandover(errandId, 'assign-lex', seen, adAccount);
      router.push('/oversikt');
    } catch (e) {
      setError(investigationHandoverErrorMessage(e, 'Ärendet kunde inte tilldelas en LEX-ansvarig. Försök igen.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <HandlerAssignmentModal
      show={show}
      label="Ärendet är klassificerat som missförhållande"
      description={description}
      selectLabel="LEX-ansvarig"
      confirmLabel="Tilldela LEX-ansvarig"
      confirmLoadingLabel="Tilldelar LEX-ansvarig"
      candidates={loadedCandidates}
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
