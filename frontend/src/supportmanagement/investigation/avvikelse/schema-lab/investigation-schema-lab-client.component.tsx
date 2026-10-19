'use client';

import dynamic from 'next/dynamic';

const ClientOnlyInvestigationSchemaLab = dynamic(
  () => import('./investigation-schema-lab.component').then(({ InvestigationSchemaLab }) => InvestigationSchemaLab),
  { ssr: false }
);

/**
 * The lab reads browser-only drafts during its initial render. Keeping that
 * render client-only prevents persisted data from disagreeing with server HTML.
 */
export function InvestigationSchemaLabClient() {
  return <ClientOnlyInvestigationSchemaLab />;
}
