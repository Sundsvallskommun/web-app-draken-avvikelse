import { ReferredFromErrandInformation } from '@common/components/referred-from-errand-information/referred-from-errand-information.component';
import { getMe } from '@common/services/user-service';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Spinner, useGui, useSnackbar } from '@sk-web-gui/react';
import { useBadgeStore, useConfigStore, useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { isSupportRegistrationEnabled } from '@supportmanagement/investigation/investigation-profile';
import { useInvestigationProfileStore } from '@supportmanagement/investigation/investigation-profile-store';
import { getInvestigationLimitedAccessNotice } from '@supportmanagement/investigation/investigation-variant-registry';
import { markLimitedSupportErrandAccess } from '@supportmanagement/services/support-errand-access-service';
import { getLabelCategorizedErrandHeading } from '@supportmanagement/services/support-errand-heading';
import {
  defaultSupportErrandInformation,
  getSupportErrandByErrandNumber,
  SupportErrand,
  supportErrandIsEmpty,
} from '@supportmanagement/services/support-errand-service';
import { getSupportNotesCount, getSupportServiceNotesCount } from '@supportmanagement/services/support-note-service';
import { useAcknowledgeErrandNotifications } from '@supportmanagement/services/use-acknowledge-errand-notifications';
import { useParams } from 'next/navigation';
import { FC, useEffect, useRef, useState } from 'react';
import { FormProvider, type Resolver, useForm } from 'react-hook-form';

import { SupportErrandSummary } from '../support-errand-basics-form/support-errand-summary.component';
import { MessagePortal } from './sidebar/message-portal.component';
import { SidebarWrapper } from './sidebar/sidebar.wrapper';
import { supportErrandFormSchema } from './support-errand-form-schema';
import { SupportErrandLimitedAccessAlert } from './support-errand-limited-access-alert.component';
import { SupportErrandRegistrationForm } from './support-errand-registration-form.component';
import { SupportTabsWrapper } from './support-tabs-wrapper';
import { SupportUiPhaseWrapper } from './ui-phase/ui-phase-wrapper';

export const SupportErrandComponent: FC = () => {
  const params = useParams<{ errandNumber?: string }>();
  const errandNumber = params?.errandNumber;
  const [isLoading, setIsLoading] = useState(!!errandNumber);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const { supportErrand, setSupportErrand } = useSupportStore();
  const { setNotesCount, setServiceNotesCount } = useBadgeStore();
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const toastMessage = useSnackbar();
  const supportApplicationProfile = useInvestigationProfileStore((state) => state.profile);
  const registrationBlocked = !errandNumber && !isSupportRegistrationEnabled(supportApplicationProfile);
  // Only a variant with something to say about an errand the user may merely know of asks for the level.
  const limitedAccessNotice = getInvestigationLimitedAccessNotice();
  // Only the errand this page was opened for, never one still in the store from before it loaded.
  useAcknowledgeErrandNotifications(
    errandNumber && supportErrand?.errandNumber === errandNumber ? supportErrand.id : undefined
  );

  const methods = useForm<SupportErrand>({
    resolver: yupResolver(supportErrandFormSchema) as unknown as Resolver<SupportErrand>,
    defaultValues: defaultSupportErrandInformation,
    mode: 'onChange', // NOTE: Needed if we want to disable submit until valid
  });

  const initialFocus = useRef<HTMLButtonElement>(null);
  const setInitialFocus = () => {
    setTimeout(() => {
      initialFocus.current && initialFocus.current.focus();
    });
  };
  const setUser = useUserStore((s) => s.setUser);

  const { theme } = useGui();

  useEffect(() => {
    setInitialFocus();
    getMe()
      .then((user) => {
        setUser(user);
      })
      .catch((e) => {});
    if (errandNumber) {
      setIsLoading(true);
      // The errand number route reads the municipality on the server; the store may not have it yet.
      const errandMunicipalityId = municipalityId || process.env.NEXT_PUBLIC_MUNICIPALITY_ID || '';
      getSupportErrandByErrandNumber(errandNumber)
        .then(async (res) => {
          if (res.error) {
            toastMessage({
              position: 'bottom',
              closeable: false,
              message: res.error,
              status: 'error',
            });
          }
          const errand =
            limitedAccessNotice && errandMunicipalityId
              ? await markLimitedSupportErrandAccess(errandMunicipalityId, res.errand)
              : res.errand;
          setSupportErrand(errand);
          methods.reset(errand);
          setIsLoading(false);
        })
        .catch(() => {
          toastMessage({
            position: 'bottom',
            closeable: false,
            message: `Något gick fel när ärendet skulle hämtas`,
            status: 'error',
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipalityId, errandNumber]);

  useEffect(() => {
    if (supportErrand && !supportErrandIsEmpty(supportErrand)) {
      getSupportNotesCount(supportErrand!.id!, municipalityId!).then((res) => {
        setNotesCount(res);
      });
      // Answers 0 on failure; it never rejects.
      void getSupportServiceNotesCount(supportErrand.id!, municipalityId!).then(setServiceNotesCount);
    }
  }, [supportErrand, municipalityId, setNotesCount, setServiceNotesCount]);

  const isReady = !isLoading && !!supportErrand?.id && !!supportMetadata;
  // No heading rather than a placeholder: an errand the investigation classifies has no type yet, and that is
  // not a fault worth announcing.
  const errandHeading = supportErrand ? getLabelCategorizedErrandHeading(supportErrand, supportMetadata) : undefined;

  if (registrationBlocked) {
    return (
      <div className="mx-auto w-full max-w-screen-lg p-24 md:p-40" role="alert">
        <Alert type="warning">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Title>Nyregistrering är inte tillgänglig</Alert.Content.Title>
            <Alert.Content.Description>
              Den här applikationen saknar ett godkänt startvärde för nya ärenden. Befintliga ärenden kan fortfarande
              öppnas och hanteras.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      </div>
    );
  }

  // A new errand is registered through the form, which asks what happened and where before the errand exists.
  if (!errandNumber) {
    return <SupportErrandRegistrationForm municipalityId={municipalityId!} />;
  }

  if (!isReady) {
    return (
      <div className="grow shrink overflow-y-hidden">
        <div className="h-full w-full flex flex-col items-center justify-start p-28">
          <Spinner size={4} />
          <span className="text-gray m-md">Hämtar ärende..</span>
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <div className="grow shrink overflow-y-hidden">
        <div className="flex justify-end w-full pl-24 md:pl-40 h-full">
          <div className="flex justify-center overflow-y-auto w-full grow max-lg:mr-[5.6rem]">
            <main
              className="flex-grow flex justify-center max-w-content h-fit w-full pb-40"
              style={{
                maxWidth: `calc(${theme.spacing['max-content']} + (100vw - ${theme.spacing['max-content']})/2)`,
                minHeight: `calc(100vh - 7.2rem)`,
              }}
            >
              <div className="flex-grow w-full max-w-screen-lg">
                <section className="bg-transparent pt-24">
                  <div className="container m-auto pl-0 pr-24 md:pr-40">
                    <SupportUiPhaseWrapper />
                  </div>
                </section>
                <section className="bg-transparent pt-24 pb-4">
                  <div className="container m-auto pl-0 pr-24 md:pr-40">
                    <div className="w-full flex flex-wrap flex-col justify-between gap-24">
                      {supportErrand?.limitedAccess && limitedAccessNotice && (
                        <SupportErrandLimitedAccessAlert notice={limitedAccessNotice} />
                      )}
                      {!supportErrandIsEmpty(supportErrand!) ? (
                        <>
                          {errandHeading && (
                            <h1 className="max-md:w-full text-h2-sm md:text-h2-md xl:text-h2-md mb-0 break-words">
                              {errandHeading}
                            </h1>
                          )}
                          <SupportErrandSummary />
                        </>
                      ) : (
                        <div className="flex justify-between items-center pt-8">
                          <h1 className="text-h3-sm md:text-h3-md xl:text-h2-lg mb-0 break-words">
                            {/* A limited read carries no classification, so it reads as empty without being new. */}
                            {supportErrand?.limitedAccess
                              ? `Ärende ${supportErrand.errandNumber}`
                              : 'Registrera nytt ärende'}
                          </h1>
                        </div>
                      )}
                    </div>
                    {!supportErrandIsEmpty(supportErrand!) && (
                      <div className="mt-16">
                        <ReferredFromErrandInformation municipalityId={municipalityId} errandId={supportErrand!.id!} />
                      </div>
                    )}
                  </div>
                </section>

                <section className="bg-transparent pb-4">
                  <div className="container m-auto bg-transparent py-12 pl-0 pr-24 md:pr-40">
                    <SupportTabsWrapper onUnsavedChangesChange={setHasUnsavedChanges} />
                    <MessagePortal />
                  </div>
                </section>
              </div>
            </main>
          </div>
          <SidebarWrapper hasUnsavedChanges={hasUnsavedChanges} />
        </div>
      </div>
    </FormProvider>
  );
};
