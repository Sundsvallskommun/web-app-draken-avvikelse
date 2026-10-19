import type { ErrandAttachment } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';

import type ApiService from './api.service';
import { isRecord } from './schema-bound-json.service';
import type { JsonParameterRequest, ReadJsonParameterResult, SupportJsonParameterService } from './support-json-parameter.service';
import { attachPdfToSupportErrand } from './support-pdf-attachment.service';

export interface SupportInvestigationReportEntry {
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly fileName: string;
  readonly attachmentId?: string;
}

// Existing pinned schemas permit filename and optional attachmentId, but no extra lifecycle fields.
// The UUID in the immutable filename is the publication identity; a missing id means pending.
const publicationSuffix = /_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.pdf$/u;
export const isPendingInvestigationReport = (value: unknown): boolean =>
  isRecord(value) && typeof value.fileName === 'string' && publicationSuffix.test(value.fileName) && !value.attachmentId;

export const readInvestigationReportEntries = (value: unknown): SupportInvestigationReportEntry[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpException(502, 'Rapportlistan har ett ogiltigt format. Kontakta support.');
  const entries = value.filter(
    (entry): entry is SupportInvestigationReportEntry =>
      isRecord(entry) &&
      typeof entry.generatedAt === 'string' &&
      typeof entry.generatedBy === 'string' &&
      typeof entry.fileName === 'string' &&
      (entry.attachmentId === undefined || typeof entry.attachmentId === 'string'),
  );
  if (entries.length !== value.length) throw new HttpException(502, 'Rapportlistan innehåller ogiltiga poster. Kontakta support.');
  return entries;
};

interface PublicationRequest {
  readonly request: JsonParameterRequest;
  readonly stored: ReadJsonParameterResult;
  readonly reportsField: string;
  readonly parentVersion: number;
}

interface PublicationDependencies {
  readonly documentService: SupportJsonParameterService;
  readonly apiService: Pick<ApiService, 'get' | 'post'>;
  readonly supportManagementService: string;
  readonly namespace: string;
}

/** Coordinates two independent upstream resources through the document's conditional write.
 * Only the request that confirms its reservation may upload. Retries reconcile an existing
 * attachment; they never repeat an upload whose outcome is unknown, even across BFF restarts.
 *
 * Every step moves the errand's version, and the answer says how many of the steps were this request's own
 * (`ownErrandWrites`), as a document save does: the page can then follow the errand's version instead of being left
 * at the one it loaded, where its next errand write would be refused as somebody else's change.
 */
export class InvestigationReportPublicationService {
  constructor(private readonly dependencies: PublicationDependencies) {}

  async recover(input: PublicationRequest, operationId: string) {
    const reports = readInvestigationReportEntries(input.stored.document.value[input.reportsField]);
    const existing = reports.find(entry => publicationSuffix.exec(entry.fileName)?.[1] === operationId) ?? reports.find(isPendingInvestigationReport);
    if (!existing) return undefined;
    if (existing.attachmentId) {
      return { ...input.stored, parentErrandVersion: input.parentVersion, ownErrandWrites: 0, report: existing };
    }
    const confirmed = await this.confirm(input, existing, await this.findAttachment(input, existing.fileName));
    // The reservation and the upload were an earlier request's; only what moved since this one read the errand is its own.
    return { ...confirmed, ownErrandWrites: confirmed.parentErrandVersion - input.parentVersion };
  }

  async publish(input: PublicationRequest, entry: SupportInvestigationReportEntry, pdfBase64: string) {
    const reports = readInvestigationReportEntries(input.stored.document.value[input.reportsField]);
    // The document ETag serializes competing publications and unlocks. If the response is lost,
    // this request must also stop: it cannot prove that it owns the reservation.
    const reserved = await this.writeReports(input, input.stored, [...reports, entry]);
    let attachmentId: string | undefined;
    try {
      attachmentId = await attachPdfToSupportErrand({
        ...this.dependencies,
        ...input.request,
        fileName: entry.fileName,
        pdfBase64,
      });
    } catch (cause) {
      if (isRecord(cause) && cause.status === 403) throw cause;
      throw new HttpException(503, 'Rapporten är reserverad men uppladdningen kunde inte bekräftas. Försök igen för att kontrollera resultatet.');
    }
    const confirmed = await this.confirm(input, entry, attachmentId ?? (await this.findAttachment(input, entry.fileName)));
    // The reservation is one step, read back right after it; the upload and the confirmation are the steps from there.
    return { ...confirmed, ownErrandWrites: 1 + (confirmed.parentErrandVersion - reserved.parentErrandVersion) };
  }

  private async findAttachment(input: PublicationRequest, fileName: string): Promise<string> {
    const { municipalityId, errandId, user } = input.request;
    const { apiService, namespace, supportManagementService } = this.dependencies;
    const attachments = await apiService.get<ErrandAttachment[]>(
      {
        url: `${supportManagementService}/${encodeURIComponent(municipalityId)}/${encodeURIComponent(namespace)}/errands/${encodeURIComponent(errandId)}/attachments`,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      user,
    );
    const matches = attachments.data.filter(attachment => attachment.fileName === fileName);
    if (matches.length !== 1 || !matches[0].id) {
      throw new HttpException(
        409,
        'En rapport väntar på bekräftelse. Ingen entydig bilaga hittades. Försök igen om uppladdningen pågår, annars kontakta support. Ingen ny kopia har laddats upp.',
      );
    }
    return matches[0].id;
  }

  private async confirm(input: PublicationRequest, entry: SupportInvestigationReportEntry, attachmentId: string) {
    const current = await this.dependencies.documentService.readJsonParameter(input.request);
    const reports = readInvestigationReportEntries(current.document.value[input.reportsField]);
    const reserved = reports.find(report => report.fileName === entry.fileName);
    if (!reserved || (reserved.attachmentId && reserved.attachmentId !== attachmentId)) {
      throw new HttpException(409, 'Rapportens reservation har ändrats. Kontakta support för att bekräfta bilagan.');
    }
    const report = { ...reserved, attachmentId };
    if (reserved.attachmentId) {
      const parent = await this.dependencies.documentService.readParentErrandWithVersion(input.request);
      return { ...current, parentErrandVersion: parent.version, report };
    }
    const written = await this.writeReports(
      input,
      current,
      reports.map(item => (item.fileName === entry.fileName ? report : item)),
    );
    return { ...written, report };
  }

  private writeReports(input: PublicationRequest, stored: ReadJsonParameterResult, reports: readonly SupportInvestigationReportEntry[]) {
    return this.dependencies.documentService.writeJsonParameter({
      ...input.request,
      data: { schemaId: stored.document.schemaId, value: stored.document.value },
      preconditions: { ifMatch: stored.etag, parentErrandVersion: String(input.parentVersion) },
      internal: {
        allowLocked: true,
        serverOwnedOverrides: { [input.reportsField]: reports.map(report => ({ ...report })) },
        // The report list is bookkeeping around the attachment, and the attachment is the news.
        notifySubscribers: false,
      },
    });
  }
}
