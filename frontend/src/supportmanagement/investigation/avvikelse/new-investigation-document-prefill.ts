import type { Admin } from '@common/services/user-service';
import type { RJSFSchema } from '@rjsf/utils';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { getSupportErrandAssigneeResumedAt } from '@supportmanagement/services/support-history-service';

import type { InvestigationProfile } from '../investigation-profile';
import { LEX_INVESTIGATION_SCHEMA_NAME } from './avvikelse-schema-names';
import type { InvestigationFormData } from './investigation-document';
import { prefillInvestigationDocument } from './lex-initial-assessment';
import { lexInvestigationBackground } from './lex-investigation-background';

interface NewInvestigationDocumentSource {
  readonly municipalityId: string;
  readonly schemaName: string;
  /** The schema the new document is written against. Only what it declares is filled in. */
  readonly schema: RJSFSchema;
  readonly errand: SupportErrand | undefined;
  readonly profile: InvestigationProfile | null | undefined;
  readonly administrators: readonly Pick<Admin, 'adAccount' | 'displayName'>[];
}

const declaredOnly = (formData: InvestigationFormData, schema: RJSFSchema): InvestigationFormData => {
  const properties = typeof schema.properties === 'object' && schema.properties !== null ? schema.properties : {};
  return Object.fromEntries(Object.entries(formData).filter(([field]) => Object.hasOwn(properties, field)));
};

const readResumedAt = async (municipalityId: string, errandId: string | undefined): Promise<string | undefined> => {
  if (!errandId) return undefined;
  try {
    return await getSupportErrandAssigneeResumedAt(errandId, municipalityId);
  } catch (error) {
    // The day is left out rather than the investigation not opening over it.
    console.warn('Could not read when the investigator took the errand up', error);
    return undefined;
  }
};

/**
 * Where a document not yet saved starts: the lex Sarah decision from the initial assessment, the lex Sarah
 * investigation from the errand's background. Every other document starts empty. Only fields the document's
 * schema declares are filled in, so a schema version without one is never handed it.
 */
export const prefillNewInvestigationDocument = async ({
  municipalityId,
  schemaName,
  schema,
  errand,
  profile,
  administrators,
}: NewInvestigationDocumentSource): Promise<InvestigationFormData> => {
  const prefilled =
    schemaName === LEX_INVESTIGATION_SCHEMA_NAME
      ? lexInvestigationBackground({
          errand,
          profile,
          administrators,
          resumedAt: await readResumedAt(municipalityId, errand?.id),
        })
      : prefillInvestigationDocument(schemaName, errand, profile);
  return declaredOnly(prefilled, schema);
};
