import { apiService } from '@common/services/api-service';
import type { AxiosError } from 'axios';

import type { InvestigationDocumentKey, InvestigationFormData } from './investigation-document';
import {
  type LoadedSupportInvestigationDocument,
  parseSupportInvestigationDocument,
  type SupportInvestigationDocument,
} from './support-investigation-contract';

export type {
  LoadedSupportInvestigationDocument,
  SupportInvestigationDocument,
} from './support-investigation-contract';

export interface SaveSupportInvestigationDocumentRequest {
  schemaId: string;
  value: InvestigationFormData;
}

const documentUrl = (errandId: string, key: InvestigationDocumentKey): string =>
  `supporterrands/${errandId}/json-parameters/${encodeURIComponent(key)}`;

const responseStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as AxiosError).response?.status;
};

export async function getSupportInvestigationDocument(
  errandId: string,
  key: InvestigationDocumentKey
): Promise<LoadedSupportInvestigationDocument | undefined> {
  try {
    const response = await apiService.get<SupportInvestigationDocument>(documentUrl(errandId, key));
    return parseSupportInvestigationDocument(response.data, key, response.headers.etag);
  } catch (error) {
    if (responseStatus(error) === 404) return undefined;
    throw error;
  }
}

/**
 * Writes one investigation document, conditioned on the document's own ETag: version checks are scoped to the
 * resource being written, and an errand whose version moved because somebody edited an unrelated field has nothing
 * to do with this document.
 */
export async function saveSupportInvestigationDocument(
  errandId: string,
  key: InvestigationDocumentKey,
  data: SaveSupportInvestigationDocumentRequest,
  etag?: string
): Promise<LoadedSupportInvestigationDocument> {
  const response = await apiService.put<SupportInvestigationDocument, SaveSupportInvestigationDocumentRequest>(
    documentUrl(errandId, key),
    data,
    { headers: etag ? { 'If-Match': etag } : { 'If-None-Match': '*' } }
  );

  const expectedStatus = etag ? 200 : 201;
  if (response.status !== expectedStatus) {
    throw new Error(`Utredningsdokumentet returnerade oväntad status ${response.status}.`);
  }

  return parseSupportInvestigationDocument(response.data, key, response.headers.etag);
}

/**
 * Somebody else saved the document after it was loaded: its ETag no longer matches. A 409 is a refusal the BFF
 * gives a reason for - a locked document, a phase it no longer applies in - and is no conflict.
 */
export function isSupportInvestigationDocumentConflict(error: unknown): boolean {
  return responseStatus(error) === 412;
}

export function isSupportInvestigationAccessDenied(error: unknown): boolean {
  const status = responseStatus(error);
  return status === 401 || status === 403;
}

interface SupportInvestigationReportEntry {
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly fileName: string;
  readonly attachmentId?: string;
}

export interface CreatedSupportInvestigationReport extends LoadedSupportInvestigationDocument {
  readonly report: SupportInvestigationReportEntry;
}

interface ReportResponseBody {
  data?: { document?: unknown; report?: unknown; fileName?: unknown; pdfBase64?: unknown };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseReportEntry = (value: unknown): SupportInvestigationReportEntry => {
  if (
    !isRecord(value) ||
    typeof value.generatedAt !== 'string' ||
    typeof value.generatedBy !== 'string' ||
    typeof value.fileName !== 'string'
  ) {
    throw new Error('Rapportsvaret från servern är ogiltigt.');
  }
  return {
    generatedAt: value.generatedAt,
    generatedBy: value.generatedBy,
    fileName: value.fileName,
    ...(typeof value.attachmentId === 'string' ? { attachmentId: value.attachmentId } : {}),
  };
};

/**
 * Renders the completed document as a PDF, attaches it to the errand and records it on the
 * document. The BFF makes the write; the response carries the document as it is afterwards.
 */
export async function createSupportInvestigationReport(
  errandId: string,
  key: InvestigationDocumentKey,
  operationId: string
): Promise<CreatedSupportInvestigationReport> {
  const response = await apiService.post<ReportResponseBody, { operationId: string }>(
    `${documentUrl(errandId, key)}/reports`,
    { operationId }
  );
  if (response.status !== 201) {
    throw new Error(`Rapporten returnerade oväntad status ${response.status}.`);
  }
  return {
    ...parseSupportInvestigationDocument(response.data.data?.document, key, response.headers.etag),
    report: parseReportEntry(response.data.data?.report),
  };
}

export interface SupportInvestigationReportDraft {
  readonly schemaId: string;
  readonly value: InvestigationFormData;
}

/** Renders the form as it currently is, saved or not, without attaching or recording anything. */
export async function previewSupportInvestigationReport(
  errandId: string,
  key: InvestigationDocumentKey,
  draft: SupportInvestigationReportDraft
): Promise<{ fileName: string; pdfBase64: string }> {
  const response = await apiService.post<ReportResponseBody, { preview: true } & SupportInvestigationReportDraft>(
    `${documentUrl(errandId, key)}/reports`,
    { preview: true, ...draft }
  );
  const fileName = response.data.data?.fileName;
  const pdfBase64 = response.data.data?.pdfBase64;
  if (typeof fileName !== 'string' || typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
    throw new Error('Förhandsgranskningen returnerade ingen PDF.');
  }
  return { fileName, pdfBase64 };
}
