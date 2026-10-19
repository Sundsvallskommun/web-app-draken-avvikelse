'use client';

import { appConfig } from '@config/appconfig';
import { Alert, Button, Spinner } from '@sk-web-gui/react';
import {
  getSupportRegistrationOptions,
  initiateSupportErrand,
  type SupportRegistrationOptions,
} from '@supportmanagement/services/support-errand-service';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FC, ReactNode, useEffect, useState } from 'react';

import { SupportErrandRegistrationCard } from './support-errand-registration-card.component';
import { SupportErrandRegistrationLayout } from './support-errand-registration-layout.component';
import { initialRegistrationLocationId } from './support-errand-registration-location';
import { RegistrationLocationField } from './support-errand-registration-location.component';
import { RegistrationReportTypeField } from './support-errand-registration-report-type.component';

interface SupportErrandRegistrationFormProps {}

/** Registration opens in a tab of its own, so cancelling closes it - as CaseData's Avbryt does. */
const CancelButton: FC = () => (
  <Button variant="tertiary" onClick={() => window.close()}>
    Avbryt
  </Button>
);

/** Why there is no form to fill in, said in the frame the form would have had. */
const RegistrationNotice: FC<{ type: 'error' | 'warning'; children: ReactNode; 'data-cy'?: string }> = ({
  type,
  children,
  'data-cy': dataCy,
}) => (
  <SupportErrandRegistrationLayout actions={<CancelButton />}>
    <div role="alert" data-cy={dataCy}>
      <Alert type={type}>
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Description>{children}</Alert.Content.Description>
        </Alert.Content>
      </Alert>
    </div>
  </SupportErrandRegistrationLayout>
);

/**
 * The registration form, which asks what happened and where before the errand exists.
 *
 * Nothing here knows which deployment it is running as: the backend answers with the choices it offers and the
 * places this handler may register for - where they are employed, or else where they are configured - and the form
 * renders those.
 */
export const SupportErrandRegistrationForm: FC<SupportErrandRegistrationFormProps> = ({}) => {
  const router = useRouter();
  const [options, setOptions] = useState<SupportRegistrationOptions>();
  const [loadError, setLoadError] = useState<string>();
  const [reportTypeLabelId, setReportTypeLabelId] = useState('');
  const [locationLabelId, setLocationLabelId] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string>();

  useEffect(() => {
    let current = true;
    getSupportRegistrationOptions()
      .then((loaded) => {
        if (!current) return;
        setOptions(loaded);
        setLocationLabelId(initialRegistrationLocationId(loaded));
      })
      .catch(() => {
        if (current) setLoadError('Registreringsvalen kunde inte hämtas. Ladda om sidan och försök igen.');
      });
    return () => {
      current = false;
    };
  }, []);

  const register = () => {
    setIsRegistering(true);
    setRegisterError(undefined);
    // No priority is sent: the handler is not asked for one, and the BFF starts every errand at Medel.
    initiateSupportErrand({ reportTypeLabelId, locationLabelId })
      .then((errand) => router.push(`/arende/${errand.errandNumber}`))
      .catch(() => {
        setIsRegistering(false);
        setRegisterError('Ärendet kunde inte registreras. Dina val finns kvar och du kan försöka igen.');
      });
  };

  if (loadError) return <RegistrationNotice type="error">{loadError}</RegistrationNotice>;

  if (!options) {
    return (
      <SupportErrandRegistrationLayout actions={<CancelButton />}>
        <div className="flex items-center gap-8" aria-busy="true">
          <Spinner size={3} />
          <span>Hämtar registreringsvalen..</span>
        </div>
      </SupportErrandRegistrationLayout>
    );
  }

  // A handler with no configured place cannot file an errand anywhere, and saying so is more use
  // than a form whose only mandatory choice is empty.
  if (options.locations.length === 0) {
    return (
      <RegistrationNotice type="warning" data-cy="registration-without-location">
        Du har ingen plats kopplad till ditt konto, och ett ärende måste höra till en plats. Kontakta den som
        administrerar behörigheterna för {appConfig.applicationName} för att få en plats kopplad.
      </RegistrationNotice>
    );
  }

  const canRegister = Boolean(reportTypeLabelId) && Boolean(locationLabelId) && !isRegistering;

  return (
    <SupportErrandRegistrationLayout
      data-cy="support-registration-form"
      actions={
        <>
          <CancelButton />
          <Button
            variant="primary"
            color="vattjom"
            rightIcon={<ArrowRight size={18} />}
            disabled={!canRegister}
            loading={isRegistering}
            loadingText="Registrerar"
            onClick={register}
            data-cy="registration-submit"
          >
            Registrera
          </Button>
        </>
      }
    >
      {registerError && (
        <div role="alert" className="mb-16">
          <Alert type="error">
            <Alert.Icon />
            <Alert.Content>
              <Alert.Content.Description>{registerError}</Alert.Content.Description>
            </Alert.Content>
          </Alert>
        </div>
      )}
      <SupportErrandRegistrationCard>
        <RegistrationReportTypeField
          reportTypes={options.reportTypes}
          reportTypeLabelId={reportTypeLabelId}
          onChange={setReportTypeLabelId}
        />
        <RegistrationLocationField options={options} locationLabelId={locationLabelId} onChange={setLocationLabelId} />
      </SupportErrandRegistrationCard>
    </SupportErrandRegistrationLayout>
  );
};
