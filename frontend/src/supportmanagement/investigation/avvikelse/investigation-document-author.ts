import type { RJSFSchema } from '@rjsf/utils';

import type { InvestigationFormData } from './investigation-document';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Who writes the document now, and in which role: who it will be by if they are the first to save it. */
export interface InvestigationDocumentWriter {
  readonly name: string;
  readonly role: string;
}

/** Who a document is by, as it is shown: the heading the schema gives it, and what is known under its own labels. */
export interface InvestigationDocumentAuthor {
  /** The property the schema leaves to the server, which is also where the UI schema places it. */
  readonly field: string;
  readonly title: string;
  readonly details: readonly { readonly label: string; readonly value: string }[];
}

const findAuthorProperty = (schema: RJSFSchema): [string, Record<string, unknown>] | undefined =>
  Object.entries(schema.properties ?? {}).find(
    (entry): entry is [string, Record<string, unknown>] =>
      isRecord(entry[1]) && entry[1]['x-draken-server-author'] !== undefined
  );

/**
 * Who the document is by, where its schema records that (`x-draken-server-author`): the BFF stamps it at the first
 * save, so the form never carries it and Draken shows it from the stored document.
 *
 * A document nobody has saved yet is by nobody. For somebody who may write it, it is shown as it will be stamped -
 * their own name, in the role that answers for the document - so they see what saving records. Undefined for a
 * schema without the property, and for an unsaved document shown to somebody who cannot write it.
 */
export const resolveInvestigationDocumentAuthor = (
  schema: RJSFSchema,
  persistedFormData: InvestigationFormData,
  writer: InvestigationDocumentWriter | undefined
): InvestigationDocumentAuthor | undefined => {
  const authorProperty = findAuthorProperty(schema);
  if (!authorProperty) return undefined;
  const [field, property] = authorProperty;

  const stored = persistedFormData[field];
  const author = isRecord(stored) ? stored : writer;
  if (!author) return undefined;

  const details = Object.entries(isRecord(property.properties) ? property.properties : {})
    .map(([name, detail]) => ({
      label: isRecord(detail) && typeof detail.title === 'string' ? detail.title : name,
      value: (author as Record<string, unknown>)[name],
    }))
    .filter(
      (detail): detail is { label: string; value: string } => typeof detail.value === 'string' && detail.value !== ''
    );
  if (details.length === 0) return undefined;

  return { field, title: typeof property.title === 'string' ? property.title : field, details };
};
