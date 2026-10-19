import type { SupportErrand } from '@supportmanagement/services/support-errand-service';

import type { InvestigationProfile, InvestigationProfileDocument } from '../investigation-profile';
import type { InvestigationFormData } from './investigation-document';

/** The profile's document for one of the fixed avvikelse schema roles, such as `utredning-enhetschef`. */
export const findInvestigationDocumentBySchemaName = (
  profile: InvestigationProfile | null | undefined,
  schemaName: string
): InvestigationProfileDocument | undefined =>
  profile?.documents.find((document) => document.schemaName === schemaName);

const errandHoldsDocument = (errand: SupportErrand | undefined, key: string): boolean =>
  errand?.jsonParameters?.some((parameter) => parameter.key === key) ?? false;

/**
 * Whether a document still waits for the one it answers - a decision for its investigation - to be saved on the
 * errand. The BFF refuses the write until then, and the form says why instead of offering a save that would fail.
 *
 * A document that is itself saved waits for nothing: the BFF never wrote it without its prerequisite. That it is
 * missing from the errand the reader was given then only says the reader may not read it - a unit manager reading
 * the lex Sarah decision does not see the lex Sarah investigation.
 */
export const awaitsPrerequisiteDocument = (
  errand: SupportErrand | undefined,
  definition: Pick<InvestigationProfileDocument, 'key' | 'prerequisiteDocumentKey'>
): boolean =>
  definition.prerequisiteDocumentKey !== undefined &&
  !errandHoldsDocument(errand, definition.prerequisiteDocumentKey) &&
  !errandHoldsDocument(errand, definition.key);

/**
 * A document as it is saved on the errand. Only the saved document counts as an assessment: an answer
 * still in an open form is not one, so the form is never consulted here.
 */
export const readSavedInvestigationDocument = (
  errand: SupportErrand | undefined,
  key: string | undefined
): InvestigationFormData | undefined => {
  const saved: unknown = key ? errand?.jsonParameters?.find((parameter) => parameter.key === key)?.value : undefined;
  return typeof saved === 'object' && saved !== null && !Array.isArray(saved)
    ? (saved as InvestigationFormData)
    : undefined;
};
