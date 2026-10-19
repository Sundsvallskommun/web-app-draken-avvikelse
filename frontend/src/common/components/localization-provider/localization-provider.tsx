'use client';

import { createInstance, Resource } from 'i18next';
import { memo, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import initLocalization from 'src/app/i18n';

interface LocalizationProviderProps {
  children: ReactNode;
  locale: string;
  namespaces: string[];
  resources: Resource;
}

const LocalizationProvider = memo<LocalizationProviderProps>(({ children, locale, namespaces, resources }) => {
  const i18n = createInstance();

  initLocalization(locale, namespaces, i18n, resources);

  return <I18nextProvider {...{ i18n }}>{children}</I18nextProvider>;
});

LocalizationProvider.displayName = 'LocalizationProvider';
export default LocalizationProvider;
