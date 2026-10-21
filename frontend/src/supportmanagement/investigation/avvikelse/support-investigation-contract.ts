import type { InvestigationDocumentKey, InvestigationFormData } from './investigation-document';

export interface SupportInvestigationDocument {
  key: InvestigationDocumentKey;
  value: InvestigationFormData;
  schemaId: string;
  version?: number;
}

export interface LoadedSupportInvestigationDocument {
  document: SupportInvestigationDocument;
  etag: string;
}

const strongVersionETagPattern = /^"(0|[1-9]\d*)"$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isJsonValue = (value: unknown, ancestors: ReadonlySet<object> = new Set()): boolean => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;

  const nextAncestors = new Set(ancestors).add(value);
  return Array.isArray(value)
    ? value.every((item) => isJsonValue(item, nextAncestors))
    : Object.values(value).every((item) => isJsonValue(item, nextAncestors));
};

const parseStrongVersionETag = (value: unknown): { etag: string; version: number } => {
  if (typeof value !== 'string') throw new Error('Utredningsdokumentets ETag saknas.');
  const match = strongVersionETagPattern.exec(value);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!match || !Number.isSafeInteger(version)) throw new Error('Utredningsdokumentets ETag är ogiltig.');
  return { etag: value, version };
};

export function parseSupportInvestigationDocument(
  value: unknown,
  expectedKey: InvestigationDocumentKey,
  etagHeader: unknown
): LoadedSupportInvestigationDocument {
  if (
    !isRecord(value) ||
    value.key !== expectedKey ||
    typeof value.schemaId !== 'string' ||
    value.schemaId.trim() === '' ||
    !isRecord(value.value) ||
    !isJsonValue(value.value)
  ) {
    throw new Error('Utredningsdokumentets svar är ogiltigt.');
  }

  const parsedETag = parseStrongVersionETag(etagHeader);
  if (
    value.version !== undefined &&
    (!Number.isSafeInteger(value.version) || (value.version as number) < 0 || value.version !== parsedETag.version)
  ) {
    throw new Error('Utredningsdokumentets version är inkonsekvent.');
  }

  return {
    document: {
      key: expectedKey,
      schemaId: value.schemaId,
      value: value.value,
      ...(value.version === undefined ? {} : { version: value.version as number }),
    },
    etag: parsedETag.etag,
  };
}
