import '@styles/tailwind.scss';

import AppLayout from '@common/components/layout/_app';
import { headers } from 'next/headers';
import { ReactNode } from 'react';

import i18nConfig from './i18nConfig';

interface RootLayoutProps {
  children: ReactNode;
  params: Promise<{}>;
}

export const generateStaticParams = () => i18nConfig.locales.map((locale) => ({ locale }));

const RootLayout = async ({ children }: RootLayoutProps) => {
  const headerList = await headers();
  const path = headerList.get('x-path') ?? '';

  const validLocale = i18nConfig.locales.find((locale) => path.startsWith(`/${locale}/`) || path === `/${locale}`);
  const locale = validLocale ?? i18nConfig.defaultLocale;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
};

export default RootLayout;
