import { InvestigationSchemaLabClient } from '@supportmanagement/investigation/avvikelse/schema-lab/investigation-schema-lab-client.component';

/**
 * Developer sandbox for previewing the investigation forms. See
 * `supportmanagement/investigation/avvikelse/README.md` for what it is for and how to run it.
 *
 * The `.dev.tsx` extension keeps this route out of production builds entirely - `pageExtensions`
 * in next.config.js only accepts it outside production.
 */
export default function InvestigationSchemaLabPage() {
  return <InvestigationSchemaLabClient />;
}
