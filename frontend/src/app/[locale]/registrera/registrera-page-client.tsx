'use client';

import Layout from '@common/components/layout/layout.component';
import { appConfig } from '@config/appconfig';
import { SupportErrandComponent } from '@supportmanagement/components/support-errand/support-errand.component';
import NextLink from 'next/link';
import { useRef } from 'react';

export function RegistreraPageClient() {
  const initialFocus = useRef<HTMLBodyElement>(null);
  const setInitalFocus = () => {
    setTimeout(() => {
      initialFocus.current?.focus();
    });
  };

  return (
    <div className="bg-background-100 h-screen min-h-screen max-h-screen overflow-hidden w-full flex flex-col">
      <Layout title={`${appConfig.applicationName} - Registrera ärende`}>
        <NextLink
          href="#content"
          passHref
          tabIndex={0}
          onClick={() => setInitalFocus()}
          className="sr-only focus:not-sr-only bg-primary-light border-2 border-black p-4 text-black inline-block focus:absolute focus:top-0 focus:left-0 focus:right-0 focus:m-auto focus:w-80 text-center"
        >
          Hoppa till innehåll
        </NextLink>
        <SupportErrandComponent />
      </Layout>
    </div>
  );
}
