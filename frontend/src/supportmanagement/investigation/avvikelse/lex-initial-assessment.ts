import type { SupportErrand } from '@supportmanagement/services/support-errand-service';

import type { InvestigationProfile } from '../investigation-profile';
import { LEX_ASSESSMENT_SCHEMA_NAME, LEX_DECISION_SCHEMA_NAME } from './avvikelse-schema-names';
import type { InvestigationFormData } from './investigation-document';
import { findInvestigationDocumentBySchemaName, readSavedInvestigationDocument } from './saved-investigation-document';

const LEX_INVESTIGATION_DECISION_FIELD = 'lexInvestigationDecision';
const LEX_DECLINED = 'not_investigate';

/** The IVO answer the assessment and the lex Sarah decision share, field for field. */
const IVO_FIELDS = ['ivoNotification', 'ivoCaseNumber', 'public360CaseNumber'] as const;

const savedAssessment = (
  errand: SupportErrand | undefined,
  profile: InvestigationProfile | null | undefined
): InvestigationFormData | undefined =>
  readSavedInvestigationDocument(
    errand,
    findInvestigationDocumentBySchemaName(profile, LEX_ASSESSMENT_SCHEMA_NAME)?.key
  );

/** Whether a saved assessment answers that the errand is not to be lex-investigated. */
export const declinesLexInvestigation = (formData: InvestigationFormData | undefined): boolean =>
  formData?.[LEX_INVESTIGATION_DECISION_FIELD] === LEX_DECLINED;

/**
 * Whether LEX-ansvarig's saved initial assessment declines to lex-investigate the errand. A suspicion of
 * misconduct it declined is no longer one: the errand went back to its unit as a deviation. The BFF applies the
 * same rule (`hasLexDeclinedInvestigation`).
 */
export const hasLexDeclinedInvestigation = (
  errand: SupportErrand | undefined,
  profile: InvestigationProfile | null | undefined
): boolean => declinesLexInvestigation(savedAssessment(errand, profile));

/**
 * What a document that is not yet saved starts with. The lex Sarah decision takes the IVO answer of the initial
 * assessment, so the decision begins where the assessment left off - and can still be changed. Every other
 * document starts empty.
 */
export const prefillInvestigationDocument = (
  schemaName: string,
  errand: SupportErrand | undefined,
  profile: InvestigationProfile | null | undefined
): InvestigationFormData => {
  if (schemaName !== LEX_DECISION_SCHEMA_NAME) return {};
  const assessment = savedAssessment(errand, profile);
  if (!assessment) return {};
  return Object.fromEntries(
    IVO_FIELDS.filter((field) => typeof assessment[field] === 'string' && assessment[field] !== '').map((field) => [
      field,
      assessment[field],
    ])
  );
};
