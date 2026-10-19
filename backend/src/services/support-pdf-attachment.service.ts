import FormData from 'form-data';

import { ErrandAttachmentChannelEnum } from '@/data-contracts/supportmanagement/data-contracts';
import type { DirectRenderRequest, RenderResponse } from '@/data-contracts/templating/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { User } from '@/interfaces/users.interface';

import type ApiService from './api.service';
import { isRecord } from './schema-bound-json.service';

/**
 * The two steps every BFF-generated PDF shares: render a Pebble template through the Templating
 * API and store the result as an attachment on a Support Management errand. The investigation
 * report and the measure action plan differ only in the template and the model they feed it.
 */
export type PdfAttachmentApiService = Pick<ApiService, 'post'>;

export interface RenderPdfRequest {
  readonly apiService: PdfAttachmentApiService;
  /** Templating service path without a trailing slash, e.g. `templating/2.0`. */
  readonly templatingService: string;
  readonly municipalityId: string;
  /** Pebble template source; sent with every render so template and model stay versioned together. */
  readonly template: string;
  readonly parameters: Record<string, unknown>;
  /** Names the document in the error raised when Templating returns nothing, e.g. "the investigation report". */
  readonly subject: string;
  readonly user: User;
}

export const renderPdfWithTemplating = async (request: RenderPdfRequest): Promise<string> => {
  const renderRequest: DirectRenderRequest = {
    content: Buffer.from(request.template, 'utf8').toString('base64'),
    parameters: request.parameters,
  };
  const rendered = await request.apiService
    .post<RenderResponse, DirectRenderRequest>(
      {
        url: `${request.templatingService}/${encodeURIComponent(request.municipalityId)}/render/direct/pdf`,
        data: renderRequest,
        propagateClientError: true,
      },
      request.user,
    )
    .catch((error: unknown) => {
      // Templating authenticates the application. Its denial is not a denial of the
      // handler's errand access and must not trigger an access refresh in the UI.
      if (isRecord(error) && (error.status === 401 || error.status === 403)) {
        throw new HttpException(502, 'Rapporttjänsten nekade applikationens åtkomst. Kontakta support.');
      }
      throw error;
    });
  const output = rendered.data?.output;
  if (typeof output !== 'string' || output.length === 0) {
    throw new HttpException(502, `Templating returned no PDF for ${request.subject}`);
  }
  return output;
};

export interface AttachPdfRequest {
  readonly apiService: PdfAttachmentApiService;
  /** Support Management service path without a trailing slash, e.g. `supportmanagement/14.9`. */
  readonly supportManagementService: string;
  readonly namespace: string;
  readonly municipalityId: string;
  readonly errandId: string;
  readonly fileName: string;
  readonly pdfBase64: string;
  readonly user: User;
}

const attachmentIdFrom = (data: unknown, location: unknown): string | undefined => {
  if (isRecord(data) && typeof data.id === 'string' && data.id.length > 0) return data.id;
  if (typeof location === 'string') {
    const match = location.match(/\/attachments\/([^/?#]+)/u);
    if (match) return decodeURIComponent(match[1]);
  }
  return undefined;
};

/** Stores the PDF as an errand attachment and returns its id when Support Management reveals one. */
export const attachPdfToSupportErrand = async (request: AttachPdfRequest): Promise<string | undefined> => {
  const data = new FormData();
  data.append('errandAttachment', Buffer.from(request.pdfBase64, 'base64'), { filename: request.fileName, contentType: 'application/pdf' });
  data.append('channel', ErrandAttachmentChannelEnum.WEB_UI);
  const url = `${request.supportManagementService}/${encodeURIComponent(request.municipalityId)}/${encodeURIComponent(request.namespace)}/errands/${encodeURIComponent(request.errandId)}/attachments`;
  const uploaded = await request.apiService.post<unknown, FormData>(
    {
      url,
      data,
      headers: { 'Content-Type': data.getHeaders()['content-type'] },
      includeResponseHeaders: true,
      followLocation: false,
      propagateClientError: true,
      mapUnauthorizedToForbidden: true,
    },
    request.user,
  );
  return attachmentIdFrom(uploaded.data, uploaded.headers?.location);
};
