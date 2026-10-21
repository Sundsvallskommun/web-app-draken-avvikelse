import { Alert, Button } from '@sk-web-gui/react';
import type { SeenSupportErrand } from '@supportmanagement/services/support-errand-facts';
import { useRouter } from 'next/navigation';
import { FC, useState } from 'react';

import {
  applyInvestigationHandover,
  getUnitManager,
  investigationHandoverErrorMessage,
  type ManagerRoleOption,
  type UnitManagerCandidate,
} from './avvikelse-assignment-service';
import { HandlerAssignmentModal } from './handler-assignment-modal.component';

type ReturnStep = 'return-to-manager' | 'decline-lex';

interface ReturnToManagerButtonProps {
  /** After the lex Sarah decision, or when LEX-ansvarig's initial assessment declines to lex-investigate. */
  step?: ReturnStep;
  errandId: string;
  /** The errand as the handler saw it; the backend refuses the handover when its handler, status or routing moved since. */
  seen: SeenSupportErrand | undefined;
  disabled: boolean;
}

interface ReturnCopy {
  readonly button: string;
  readonly heading: string;
  readonly description: (locationName: string) => string;
  readonly confirm: string;
  readonly confirming: string;
  readonly failure: string;
}

const returnCopy: Readonly<Record<ReturnStep, ReturnCopy>> = {
  'return-to-manager': {
    button: 'Återlämna till chef',
    heading: 'Återlämna ärendet till chef',
    description: (locationName) =>
      locationName
        ? `Ärendet återlämnas till en chef för ${locationName}.`
        : 'Ärendet återlämnas till en chef för platsen det gäller.',
    confirm: 'Återlämna ärendet',
    confirming: 'Återlämnar ärendet',
    failure: 'Ärendet kunde inte återlämnas. Försök igen.',
  },
  'decline-lex': {
    button: 'Lämna tillbaka till enhetschef',
    heading: 'Lämna tillbaka ärendet till enhetschef',
    description: (locationName) =>
      `Ärendet ska inte lex-utredas och lämnas tillbaka ${
        locationName ? `till en chef för ${locationName}` : 'till en chef för platsen det gäller'
      } som en avvikelse. Motiveringen sparas som en tjänsteanteckning på ärendet.`,
    confirm: 'Lämna tillbaka ärendet',
    confirming: 'Lämnar tillbaka ärendet',
    failure: 'Ärendet kunde inte lämnas tillbaka. Försök igen.',
  },
};

/**
 * Hands a finished LEX investigation back to a manager for the place it concerns.
 *
 * The candidates come from AccessMapper: whose access patterns cover the place, narrowed to those
 * holding a manager role there. They are grouped by role - enhetschef, verksamhetschef - the way the
 * handler list in the sidebar is, and the investigator picks one. The backend resolves the same list
 * when it writes and refuses anybody outside it, so the picker cannot widen who may receive it.
 *
 * Removing the LEX label is what gives the errand back. Whether the investigator still sees it
 * afterwards is AccessMapper's answer, not this component's - they may well reach it through some
 * other pattern - so nothing here claims the errand disappears from their list.
 */
export const ReturnToManagerButton: FC<ReturnToManagerButtonProps> = ({
  step = 'return-to-manager',
  errandId,
  seen,
  disabled,
}) => {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [candidates, setCandidates] = useState<UnitManagerCandidate[] | undefined>();
  const [roles, setRoles] = useState<ManagerRoleOption[]>([]);
  const [locationName, setLocationName] = useState('');
  const [loadError, setLoadError] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isResolving, setIsResolving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const copy = returnCopy[step];

  const openModal = async () => {
    setShowModal(true);
    setCandidates(undefined);
    setLoadError(undefined);
    setError(undefined);
    setIsResolving(true);
    try {
      const response = await getUnitManager(errandId);
      setLocationName(response.locationDisplayName);
      setRoles(response.roles);
      setCandidates(response.candidates);
    } catch (e) {
      setLoadError(investigationHandoverErrorMessage(e, 'Cheferna för ärendets plats kunde inte hämtas. Försök igen.'));
    } finally {
      setIsResolving(false);
    }
  };

  const returnErrand = async (adAccount: string) => {
    if (!seen?.facts) {
      setError('Ärendet är inte helt inläst. Ladda om ärendet innan du återlämnar det.');
      return;
    }

    setIsSaving(true);
    setError(undefined);
    try {
      await applyInvestigationHandover(errandId, step, seen, adAccount);
      router.push('/oversikt');
    } catch (e) {
      setError(investigationHandoverErrorMessage(e, copy.failure));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled || isResolving}
        loading={isResolving}
        loadingText="Hämtar chefer"
        data-cy={step === 'decline-lex' ? 'decline-lex-button' : 'return-to-manager-button'}
        onClick={() => void openModal()}
      >
        {copy.button}
      </Button>

      {showModal && (
        <HandlerAssignmentModal
          show={showModal}
          label={copy.heading}
          description={copy.description(locationName)}
          selectLabel="Chef"
          confirmLabel={copy.confirm}
          confirmLoadingLabel={copy.confirming}
          candidates={candidates}
          roles={roles}
          loadError={loadError}
          emptyMessage="Ingen chef är konfigurerad för ärendets plats. Kontakta support innan ärendet återlämnas."
          isSaving={isSaving}
          error={error}
          onAssign={(adAccount) => void returnErrand(adAccount)}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

/** Shown when the errand is not in a state where it can be returned, so the reason is visible. */
const ReturnToManagerUnavailable: FC<{ message: string }> = ({ message }) => (
  <Alert type="info" className="mb-24">
    <Alert.Icon />
    <Alert.Content>
      <Alert.Content.Description>{message}</Alert.Content.Description>
    </Alert.Content>
  </Alert>
);
