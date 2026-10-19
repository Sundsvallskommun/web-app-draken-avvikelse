import { imageMimeTypes } from '@common/components/file-upload/file-upload.component';
import { MAX_FILE_SIZE_MB } from '@common/components/file-upload/file-upload-limits';
import { apiService, withRequestGroup } from '@common/services/api-service';
import { toBase64 } from '@common/utils/toBase64';

export interface SupportAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  channel?: string;
}

export interface SingleSupportAttachment {
  errandAttachmentHeader: {
    id: string;
    fileName: string;
    mimeType: string;
  };
  base64EncodedString: string;
}

type AttachmentCategory =
  | 'PASSPORT_PHOTO'
  | 'MEDICAL_CONFIRMATION'
  | 'SIGNATURE'
  | 'POLICE_REPORT'
  | 'UNKNOWN'
  | 'ERRAND_SCANNED_APPLICATION'
  | 'SERVICE_RECEIPT'
  | 'OTHER_ATTACHMENT';

export const documentMimeTypes = [
  'video/quicktime',
  'video/mp4',
  'video/mpeg',
  'video/x-ms-wmv',
  'video/x-msvideo',
  'application/pdf',
  'application/rtf',
  'application/msword',
  'application/x-tika-msoffice',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.ms-outlook',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export const ACCEPTED_UPLOAD_FILETYPES = [
  'mov',
  'mp4',
  'mpeg',
  'wmv',
  'avi',
  'bmp',
  'gif',
  'tif',
  'tiff',
  'jpeg',
  'jpg',
  'png',
  'htm',
  'html',
  'pdf',
  'rtf',
  'docx',
  'doc',
  'txt',
  'xlsx',
  'xls',
  'pptx',
  'odt',
  'ods',
  'text/html',
  'msg',
  'heic',
  'heif',
  ...imageMimeTypes,
  ...documentMimeTypes,
];

export const getSupportAttachment: (
  errandId: string,
  attachment: SupportAttachment
) => Promise<SingleSupportAttachment> = (errandId, attachment) => {
  return apiService
    .get<string>(`supportattachments/errands/${errandId}/attachments/${attachment.id}`)
    .then((res) => {
      const att: SingleSupportAttachment = {
        errandAttachmentHeader: {
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
        },
        base64EncodedString: res.data,
      };
      return att;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching attachment');
      throw e;
    });
};

export const getSupportAttachments: (errandId: string) => Promise<SupportAttachment[]> = (errandId) => {
  // return Promise.resolve([]);
  return apiService
    .get<SupportAttachment[]>(`supportattachments/errands/${errandId}/attachments`)
    .then((res) => {
      return res.data;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching attachments');
      throw e;
    });
};

export const deleteSupportAttachment = (errandId: string, attachmentId: string) => {
  if (!attachmentId) {
    console.error('No id found, cannot continue.');
    return;
  }

  return apiService
    .deleteRequest<boolean>(`supportattachments/errands/${errandId}/attachments/${attachmentId}`)
    .then((res) => {
      return res;
    })
    .catch((e) => {
      console.error('Something went wrong when removing attachment ', attachmentId);
      throw e;
    });
};

/**
 * Uploads the files, one request each. However many files there are, the upload is one action: the requests
 * share a request group, so the people following the errand get one notification rather than one for each file.
 */
export const saveSupportAttachments: (
  errandId: string,
  attachments: { file: File }[]
) => Promise<({ status: 'fulfilled'; value: any } | { status: 'rejected'; reason: any })[]> = (errandId, attachments) =>
  withRequestGroup(() => {
    const attachmentPromises = attachments.map(async (attachment, idx) => {
      // await delay(idx * 500);

      const fileItem = (attachment.file as unknown as FileList)[0];
      if (fileItem.size / 1024 / 1024 > MAX_FILE_SIZE_MB) {
        throw new Error('MAX_SIZE');
      }
      const fileData = await toBase64(fileItem);
      const buf = Buffer.from(fileData, 'base64');
      const blob = new Blob([buf], { type: fileItem.type });

      // Building form data
      const formData = new FormData();
      formData.append(`files`, blob, fileItem.name);
      formData.append(`name`, fileItem.name);
      return apiService
        .post<boolean, FormData>(`supportattachments/errands/${errandId}/attachments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((res) => {
          return res;
        })
        .catch((e) => {
          console.error('Something went wrong when saving attachment', e);
          throw e;
        });
    });

    return Promise.allSettled(attachmentPromises).then(
      (res: ({ status: 'fulfilled'; value: any } | { status: 'rejected'; reason: any })[]) => {
        if (res.length === 1 && res[0].status === 'rejected') {
          throw res[0].reason;
        }
        return res;
      }
    );
  });

export const countAttachment = (attachment: SupportAttachment[]): number => {
  let numberOfAttachment = 0;
  if (attachment) {
    numberOfAttachment = attachment.length;
  }

  return numberOfAttachment;
};
