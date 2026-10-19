import type { InvestigationProfile } from './investigation-profile';

/** Document grants are scoped to the selected errand; the application profile carries no grants. */
export type InvestigationDocumentAccess = 'edit' | 'read' | 'hidden';

export interface InvestigationAccess {
  readonly municipalityId: string;
  readonly errandId: string;
  readonly documents: ReadonlyMap<string, InvestigationDocumentAccess>;
}

export type InvestigationAccessState =
  | { readonly status: 'loading' | 'disabled' | 'error' | 'denied' }
  | { readonly status: 'ready'; readonly access: InvestigationAccess };

const invalidAccess = (): never => {
  throw new Error('Behörigheterna för ärendets dokument kunde inte läsas.');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseInvestigationAccess(
  value: unknown,
  municipalityId: string,
  errandId: string
): InvestigationAccess {
  if (
    !isRecord(value) ||
    value.municipalityId !== municipalityId ||
    value.errandId !== errandId ||
    !Array.isArray(value.documents)
  )
    return invalidAccess();

  const documents = new Map<string, InvestigationDocumentAccess>();
  for (const entry of value.documents) {
    if (
      !isRecord(entry) ||
      typeof entry.key !== 'string' ||
      !entry.key.trim() ||
      documents.has(entry.key) ||
      (entry.access !== 'edit' && entry.access !== 'read' && entry.access !== 'hidden')
    )
      return invalidAccess();
    documents.set(entry.key, entry.access);
  }
  return { municipalityId, errandId, documents };
}

export const investigationDocumentAccess = (
  state: InvestigationAccessState,
  key: string
): InvestigationDocumentAccess => (state.status === 'ready' ? state.access.documents.get(key) ?? 'hidden' : 'hidden');

/**
 * The access as the page draws it: the given documents hidden, whatever their grant. It only narrows what is
 * shown - nothing hidden is brought into view, and the BFF still decides every read and write. With nothing
 * to conceal the state is returned as it is.
 */
export const concealInvestigationDocuments = (
  state: InvestigationAccessState,
  keys: readonly string[]
): InvestigationAccessState => {
  if (state.status !== 'ready' || !keys.some((key) => state.access.documents.has(key))) return state;
  const documents = new Map(state.access.documents);
  keys.forEach((key) => {
    if (documents.has(key)) documents.set(key, 'hidden');
  });
  return { status: 'ready', access: { ...state.access, documents } };
};

/** The generic JSON view must respect the same grants for documents this profile owns. */
export const isInvestigationParameterReadable = (
  profile: InvestigationProfile | null,
  state: InvestigationAccessState,
  key: string
): boolean =>
  !profile?.documents.some((document) => document.key === key) ||
  state.status === 'disabled' ||
  investigationDocumentAccess(state, key) !== 'hidden';
