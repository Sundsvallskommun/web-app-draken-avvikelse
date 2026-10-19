import { apiService } from '@common/services/api-service';
import type { AxiosError } from 'axios';

import type { InvestigationDocumentKey, InvestigationFormData } from './investigation-document';
import {
  type LoadedSupportInvestigationDocument,
  parseOwnErrandWrites,
  parseParentErrandVersion,
  parseReportErrandWrites,
  parseSupportInvestigationDocument,
  type SavedSupportInvestigationDocument,
  type SupportInvestigationDocument,
} from './support-investigation-contract';

export type {
  LoadedSupportInvestigationDocument,
  SavedSupportInvestigationDocument,
  SupportInvestigationDocument,
} from './support-investigation-contract';

export interface SaveSupportInvestigationDocumentRequest {
  schemaId: string;
  value: InvestigationFormData;
}

const documentUrl = (municipalityId: string, errandId: string, key: InvestigationDocumentKey): string =>
  `supporterrands/${municipalityId}/${errandId}/json-parameters/${encodeURIComponent(key)}`;

const responseStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as AxiosError).response?.status;
};

export async function getSupportInvestigationDocument(
  municipalityId: string,
  errandId: string,
  key: InvestigationDocumentKey
): Promise<LoadedSupportInvestigationDocument | undefined> {
  try {
    const response = await apiService.get<SupportInvestigationDocument>(documentUrl(municipalityId, errandId, key));
    return parseSupportInvestigationDocument(response.data, key, response.headers.etag);
  } catch (error) {
    if (responseStatus(error) === 404) return undefined;
    throw error;
  }
}

/**
 * Writes one investigation document.
 *
 * The document's own ETag is the precondition. The errand version the form was loaded with is sent
 * along, but it is not a precondition: version checks are scoped to the resource being written, and
 * an errand whose version moved because somebody edited an unrelated field has nothing to do with
 * this document. The response carries the errand's fresh version back, because writing the document
 * does move it.
 */
export async function saveSupportInvestigationDocument(
  municipalityId: string,
  errandId: string,
  key: InvestigationDocumentKey,
  data: SaveSupportInvestigationDocumentRequest,
  loadedParentErrandVersion: number | undefined,
  etag?: string
): Promise<SavedSupportInvestigationDocument> {
  const response = await apiService.put<SupportInvestigationDocument, SaveSupportInvestigationDocumentRequest>(
    documentUrl(municipalityId, errandId, key),
    data,
    {
      headers: {
        ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }),
        ...(typeof loadedParentErrandVersion === 'number'
          ? { 'X-Errand-Version': String(loadedParentErrandVersion) }
          : {}),
      },
    }
  );

  const expectedStatus = etag ? 200 : 201;
  if (response.status !== expectedStatus) {
    throw new Error(`Utredningsdokumentet returnerade oväntad status ${response.status}.`);
  }

  return {
    ...parseSupportInvestigationDocument(response.data, key, response.headers.etag),
    parentErrandVersion: parseParentErrandVersion(response.headers['x-errand-version']),
    ownErrandWrites: parseOwnErrandWrites(response.headers['x-errand-writes']),
  };
}

export function isSupportInvestigationConflict(error: unknown): boolean {
  const status = responseStatus(error);
  return status === 409 || status === 412 || status === 428;
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

export interface CreatedSupportInvestigationReport extends SavedSupportInvestigationDocument {
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
  municipalityId: string,
  errandId: string,
  key: InvestigationDocumentKey,
  operationId: string
): Promise<CreatedSupportInvestigationReport> {
  const response = await apiService.post<ReportResponseBody, { operationId: string }>(
    `${documentUrl(municipalityId, errandId, key)}/reports`,
    { operationId }
  );
  if (response.status !== 201) {
    throw new Error(`Rapporten returnerade oväntad status ${response.status}.`);
  }
  return {
    ...parseSupportInvestigationDocument(response.data.data?.document, key, response.headers.etag),
    parentErrandVersion: parseParentErrandVersion(response.headers['x-errand-version']),
    ownErrandWrites: parseReportErrandWrites(response.headers['x-errand-writes']),
    report: parseReportEntry(response.data.data?.report),
  };
}

export interface SupportInvestigationReportDraft {
  readonly schemaId: string;
  readonly value: InvestigationFormData;
}

/** Renders the form as it currently is, saved or not, without attaching or recording anything. */
export async function previewSupportInvestigationReport(
  municipalityId: string,
  errandId: string,
  key: InvestigationDocumentKey,
  draft: SupportInvestigationReportDraft
): Promise<{ fileName: string; pdfBase64: string }> {
  const response = await apiService.post<ReportResponseBody, { preview: true } & SupportInvestigationReportDraft>(
    `${documentUrl(municipalityId, errandId, key)}/reports`,
    { preview: true, ...draft }
  );
  const fileName = response.data.data?.fileName;
  const pdfBase64 = response.data.data?.pdfBase64;
  if (typeof fileName !== 'string' || typeof pdfBase64 !== 'string' || pdfBase64.length === 0) {
    throw new Error('Förhandsgranskningen returnerade ingen PDF.');
  }
  return { fileName, pdfBase64 };
}
