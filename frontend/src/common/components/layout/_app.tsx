'use client';

import LoaderFullScreen from '@common/components/loader/loader-fullscreen';
import { getHandlerDirectory, getMe } from '@common/services/user-service';
import {
  ColorSchemeMode,
  ConfirmationDialogContextProvider,
  defaultTheme,
  extendTheme,
  GuiProvider,
} from '@sk-web-gui/react';
import { useMetadataStore } from '@stores/metadata-store';
import { useUiSettingsStore } from '@stores/ui-settings-store';
import { useUserStore } from '@stores/user-store';
import { getInvestigationProfile } from '@supportmanagement/investigation/investigation-profile-service';
import { useInvestigationProfileStore } from '@supportmanagement/investigation/investigation-profile-store';
import { getSupportMetadata } from '@supportmanagement/services/support-metadata-service';
import dayjs from 'dayjs';
import updateLocale from 'dayjs/plugin/updateLocale';
import utc from 'dayjs/plugin/utc';
import { ReactNode, useEffect, useMemo, useSyncExternalStore } from 'react';

dayjs.extend(utc);
dayjs.locale('sv');
dayjs.extend(updateLocale);
dayjs.updateLocale('sv', {
  months: [
    'Januari',
    'Februari',
    'Mars',
    'April',
    'Maj',
    'Juni',
    'Juli',
    'Augusti',
    'September',
    'Oktober',
    'November',
    'December',
  ],
  monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'],
});

interface ClientApplicationProps {
  children: ReactNode;
}

function isInvestigationSchemaLabRoute(): boolean {
  // The lab route is not compiled into production builds (see pageExtensions in next.config.js),
  // so this branch folds away there instead of running its path check on every app bootstrap.
  if (process.env.NODE_ENV === 'production') return false;
  return globalThis.window?.location.pathname.endsWith('/schema-lab/utredning') ?? false;
}

function isAuthenticationRoute(): boolean {
  return /\/(?:login|logout)\/?$/u.test(globalThis.window?.location.pathname ?? '');
}

function AppInitializer({ children }: Readonly<{ children: ReactNode }>) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const schemaLabRoute = isInvestigationSchemaLabRoute();
  const authenticationRoute = isAuthenticationRoute();
  const investigationProfileStatus = useInvestigationProfileStore((state) => state.status);

  useEffect(() => {
    if (schemaLabRoute) return;
    useInvestigationProfileStore.getState().reset();

    getMe()
      .then((user) => {
        useUserStore.getState().setUser(user);
      })
      .catch(() => {});

    if (authenticationRoute) {
      useInvestigationProfileStore.getState().setDisabled();
    } else {
      useInvestigationProfileStore.getState().startLoading();
      getInvestigationProfile()
        .then((profile) => {
          useInvestigationProfileStore.getState().setProfile(profile);
        })
        .catch((error) => {
          console.error('Failed to load the SupportManagement investigation profile.', error);
          useInvestigationProfileStore.getState().setError();
        });
    }

    getSupportMetadata().then((res) => {
      useMetadataStore.getState().setSupportMetadata(res.metadata);
    });

    getHandlerDirectory()
      .then(({ administrators, roles }) => {
        useUserStore.getState().setAdministrators(administrators);
        useUserStore.getState().setHandlerRoles(roles);
        useUserStore.getState().setHandlerDirectoryState('ready');
      })
      .catch((error) => {
        // One unreachable AD group fails the whole lookup, so swallowing this silently leaves an
        // empty handler list that reads as "nobody holds this role".
        console.error('Failed to load the handler directory.', error);
        useUserStore.getState().setHandlerDirectoryState('error');
      });
  }, [authenticationRoute, schemaLabRoute]);

  const investigationProfileReady =
    schemaLabRoute ||
    investigationProfileStatus === 'ready' ||
    investigationProfileStatus === 'error' ||
    investigationProfileStatus === 'disabled';
  if (!mounted) {
    return null;
  }

  // A slow profile endpoint should show that the app is working, not a blank page.
  if (!investigationProfileReady) {
    return <LoaderFullScreen />;
  }

  return <>{children}</>;
}

function AppLayout({ children }: ClientApplicationProps) {
  const colorScheme = useSyncExternalStore(
    useUiSettingsStore.subscribe,
    () => (useUiSettingsStore.getState().colorScheme as ColorSchemeMode) || ColorSchemeMode.Light,
    () => ColorSchemeMode.Light
  );
  const theme = useMemo(
    () =>
      extendTheme({
        colorSchemes: defaultTheme.colorSchemes,
        spacing: {
          ...defaultTheme.spacing,
          'max-content': '1440px',
        },
        screens: { ...defaultTheme.screens, 'medium-device-max': '800px', 'large-device-max': '960px' },
      }),
    []
  );

  return (
    <GuiProvider theme={theme} colorScheme={colorScheme}>
      <ConfirmationDialogContextProvider>
        <AppInitializer>{children}</AppInitializer>
      </ConfirmationDialogContextProvider>
    </GuiProvider>
  );
}

export default AppLayout;
