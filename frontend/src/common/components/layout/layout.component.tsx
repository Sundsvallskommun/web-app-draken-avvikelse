import { getApplicationEnvironment } from '@common/services/application-service';
import { appConfig } from '@config/appconfig';
import { Button, CookieConsent, Divider, Link, Logo, PopupMenu, UserMenu } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { SupportStatusLabelComponent } from '@supportmanagement/components/ongoing-support-errands/components/support-status-label.component';
import { isSupportRegistrationEnabled } from '@supportmanagement/investigation/investigation-profile';
import { useInvestigationProfileStore } from '@supportmanagement/investigation/investigation-profile-store';
import { getLabelCategorizedErrandHeading } from '@supportmanagement/services/support-errand-heading';
import { ExternalLink, Menu } from 'lucide-react';
import NextLink from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Fragment, useState } from 'react';

import { PageHeader } from './page-header.component';
import { useUserMenu } from './userMenuGroups';

export default function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  const user = useUserStore((s) => s.user);
  const applicationEnvironment = getApplicationEnvironment();
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const pathName = usePathname() ?? '';
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const params = useParams<{ errandNumber?: string }>();
  const errandNumber = params?.errandNumber;
  const [hostName] = useState(() =>
    typeof globalThis.window === 'undefined' ? '' : globalThis.window.location.hostname
  );
  const supportApplicationProfile = useInvestigationProfileStore((state) => state.profile);
  const registrationEnabled = isSupportRegistrationEnabled(supportApplicationProfile);

  const mainTitle = (
    <NextLink
      href="/"
      className="no-underline"
      aria-label={`Draken - ${
        appConfig.applicationName + (applicationEnvironment ? ` ${applicationEnvironment}` : '')
      }. Gå till startsidan.`}
    >
      <Logo
        variant="service"
        title={'Draken'}
        subtitle={appConfig.applicationName + (applicationEnvironment ? ` ${applicationEnvironment}` : '')}
      />
    </NextLink>
  );

  const singleErrandTitle = (
    <div className="flex items-center gap-24 py-10">
      <a
        href={`${process.env.NEXT_PUBLIC_BASEPATH}`}
        title={`Draken - ${
          appConfig.applicationName + (applicationEnvironment ? ` ${applicationEnvironment}` : '')
        }. Gå till startsidan.`}
      >
        <Logo variant="symbol" className="h-40" />
      </a>
      <span className="text-large">
        <SupportStatusLabelComponent status={supportErrand?.status ?? ''} actions={supportErrand?.actions ?? []} />
        <span className="font-bold ml-8">
          {supportErrand && getLabelCategorizedErrandHeading(supportErrand, supportMetadata)}{' '}
        </span>
        <span className="text-small">({errandNumber})</span>
      </span>
    </div>
  );

  const { menuGroups: userMenuGroups, dialogs: userMenuDialogs } = useUserMenu();

  return (
    <>
      <div className="relative z-[15] bg-background-content">
        <PageHeader
          logo={pathName.includes('arende') && errandNumber !== undefined ? singleErrandTitle : mainTitle}
          userMenu={
            <div className="flex items-center h-fit">
              <span data-cy="usermenu">
                <UserMenu
                  initials={`${user.firstName[0]}${user.lastName[0]}`}
                  menuTitle={`${user.name} (${user.username})`}
                  menuSubTitle=""
                  menuGroups={userMenuGroups}
                  buttonRounded={false}
                  buttonSize="sm"
                />
              </span>

              <Divider orientation="vertical" className="mx-24" />
              {registrationEnabled && (
                <Link
                  href={`${process.env.NEXT_PUBLIC_BASEPATH}/registrera`}
                  target="_blank"
                  data-cy="register-new-errand-button"
                >
                  <Button color={'primary'} variant={'tertiary'} rightIcon={<ExternalLink />}>
                    Nytt ärende
                  </Button>
                </Link>
              )}
            </div>
          }
          mobileMenu={
            <PopupMenu align="end">
              <PopupMenu.Button iconButton>
                <Menu />
              </PopupMenu.Button>
              <PopupMenu.Panel>
                <PopupMenu.Group>
                  <div className="font-bold">{`${user.name} (${user.username})`}</div>
                </PopupMenu.Group>
                <PopupMenu.Items>
                  {registrationEnabled && (
                    <PopupMenu.Group>
                      <PopupMenu.Item>
                        <Link href={`${process.env.NEXT_PUBLIC_BASEPATH}/registrera`}>
                          <ExternalLink className="h-md" /> Nytt ärende
                        </Link>
                      </PopupMenu.Item>
                    </PopupMenu.Group>
                  )}

                  {userMenuGroups.map((group, groupindex) => (
                    <PopupMenu.Group key={`mobilegroup-${groupindex}`}>
                      {group.elements.map((item, itemindex) => (
                        <Fragment key={`mobilegroup-${groupindex}-${itemindex}`}>{item.element()}</Fragment>
                      ))}
                    </PopupMenu.Group>
                  ))}
                </PopupMenu.Items>
              </PopupMenu.Panel>
            </PopupMenu>
          }
        />
      </div>

      {children}
      {userMenuDialogs}

      <CookieConsent
        title={`Kakor på ${hostName}`}
        body={
          <p>
            Vi använder kakor, cookies, för att ge dig en förbättrad upplevelse, sammanställa statistik och för att viss
            nödvändig funktionalitet ska fungera på webbplatsen.{' '}
            <NextLink href="/kakor" passHref>
              <Button variant={'link'}>Läs mer om hur vi använder kakor</Button>
            </NextLink>
          </p>
        }
        cookies={[
          {
            optional: false,
            displayName: 'Nödvändiga kakor',
            description:
              'Dessa kakor är nödvändiga för att webbplatsen ska fungera och kan inte stängas av i våra system.',
            cookieName: 'nessecary',
          },
          {
            optional: true,
            displayName: 'Funktionella kakor',
            description: ' Dessa kakor ger förbättrade funktioner på webbplatsen.',
            cookieName: 'func',
          },
          {
            optional: true,
            displayName: 'Kakor för statistik',
            description:
              'Dessa kakor tillåter oss att räkna besök och trafikkällor, så att vi kan mäta och förbättra prestanda på vår webbplats.',
            cookieName: 'stats',
          },
        ]}
        resetConsentOnInit={false}
        onConsent={(cookies) => {
          // NOTE: do stuff with cookies?
        }}
      />
    </>
  );
}
