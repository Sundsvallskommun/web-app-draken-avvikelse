import { ApiResponse, apiService } from '@common/services/api-service';
import { sanitized } from '@common/services/sanitizer-service';
import { toBase64 } from '@common/utils/toBase64';
import dayjs from 'dayjs';
import { CCommunicationAttachment } from 'src/data-contracts/backend/data-contracts';
import { v4 as uuidv4 } from 'uuid';

import { getClosingTemplate } from './message-template-service';
import { SingleSupportAttachment } from './support-attachment-service';
import { SupportCommunicationType } from './support-communication-types';

export interface MessageRequest {
  errandId: string;
  contactMeans: string;
  emails: { value: string }[];
  recipientEmail: string;
  phoneNumbers: { value: string }[];
  plaintextMessage: string;
  htmlMessage: string;
  senderName?: string;
  subject: string;
  attachments?: { file: File | undefined }[];
  existingAttachments?: SingleSupportAttachment[];
  headerReplyTo: string;
  headerReferences: string;
  attachmentIds?: string[];
}

export interface Message {
  communicationAttachments: CCommunicationAttachment[];
  communicationID: string;
  communicationType: SupportCommunicationType;
  direction: string;
  errandNumber: string;
  messageBody: string;
  htmlMessageBody?: string;
  sent: string;
  subject: string;
  sender: string;
  target: string;
  viewed: boolean;
  emailHeaders: Record<string, string[]>;
  conversationId?: string;
  messageId?: string;
  recipients: string[];
  ccRecipients: string[];
}

const getClosingMessageBody = async (userName: string): Promise<string> => {
  const app = process.env.NEXT_PUBLIC_APPLICATION?.toLowerCase() || 'default';

  const content = await getClosingTemplate(app, { user: userName });
  if (!content) {
    console.error(`Could not get closing-template: neither ${app}.email.closing nor default.email.closing was found`);
    return '';
  }

  return content;
};

const getPlaintextMessageBody = (htmlMessage: string): string => {
  const transformed = htmlMessage
    .replace(/<br\s*\/?>/gi, '\n') // <br> till \n
    .replace(/<\/p>/gi, '\n') // </p> till \n
    .replace(/<[^>]+>/g, '') // Ta bort övriga taggar
    .replace(/&nbsp;/g, ' ') // HTML-space till vanlig space
    .replace(/\n[ \t]+/g, '\n') // Ta bort indrag i början av rad
    .replace(/\n{2,}/g, '\n') // Extra radbrytningar
    .trim();

  return sanitized(transformed).trim();
};

export const sendMessage = async (data: MessageRequest): Promise<boolean> => {
  if (!data.errandId) {
    return Promise.reject('No errand id found, cannot send message');
  }
  const targets =
    data.contactMeans === 'webmessage'
      ? [{ value: '' }]
      : data.contactMeans === 'email'
      ? [...data.emails]
      : [...data.phoneNumbers];
  const msgPromises = targets.map(async (target) => {
    const attachmentPromises: Promise<{ name: string; blob: Blob }>[] = (data.attachments || []).map(async (f) => {
      const fileItem = (f.file as unknown as FileList)[0];
      try {
        const fileData = await toBase64(fileItem);
        const buf = Buffer.from(fileData, 'base64');
        const blob = new Blob([buf], { type: fileItem.type });
        return { name: fileItem.name, blob };
      } catch (error) {
        console.error('Error while processing attachment:', error);
        throw error;
      }
    });

    const messageFormData = new FormData();
    try {
      const attachmentResults = await Promise.all(attachmentPromises);
      attachmentResults.forEach(({ name, blob }) => {
        messageFormData.append(`files`, blob, name);
      });

      messageFormData.append('contactMeans', data.contactMeans);
      if (data.contactMeans === 'email') {
        messageFormData.append('recipientEmail', Object(target).value);
      } else if (data.contactMeans === 'sms') {
        messageFormData.append('recipientPhone', Object(target).value.replace('-', ''));
      }
      messageFormData.append('plaintextMessage', data.plaintextMessage);
      messageFormData.append(
        'htmlMessage',
        `${data.htmlMessage.replaceAll('<p>', '<p style="margin-top:0;margin-bottom:0">')}</div>`
      );
      messageFormData.append('senderName', data.senderName ?? '');
      messageFormData.append('subject', data.subject);
      messageFormData.append('reply_to', data.headerReplyTo || '');
      messageFormData.append('references', data.headerReferences || '');
      data.existingAttachments?.map((attachment) => {
        messageFormData.append('attachmentIds[]', attachment.errandAttachmentHeader.id);
      });
      if (data.attachmentIds) {
        data.attachmentIds?.map((id) => {
          messageFormData.append('attachmentIds[]', id);
        });
      }
      try {
        await apiService.post<boolean, FormData>(`supportmessage/${data.errandId}`, messageFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        return true;
      } catch (error) {
        console.error('Something went wrong when sending message to:', data.emails, data.phoneNumbers, error);
        return false;
      }
    } catch (error) {
      console.error('Error while processing attachments:', error);
      throw error;
    }
  });
  return Promise.all(msgPromises).then((results) => (results.every((r) => r) ? true : false));
};

export const fetchSupportMessages: (errandId: string) => Promise<MessageNode[]> = (errandId) => {
  if (!errandId) {
    console.error('No errand id found, cannot fetch messages. Returning.');
  }
  return apiService
    .get<Message[]>(`supportmessage/errands/${errandId}/communication`)
    .then((res) => {
      const list: Message[] = res.data.sort((a, b) =>
        dayjs(a.sent).isAfter(dayjs(b.sent)) ? -1 : dayjs(b.sent).isAfter(dayjs(a.sent)) ? 1 : 0
      );
      return list;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching messages for errand:', errandId);
      throw e;
    });
};

export const setMessageViewStatus: (
  errandId: string,
  communicationID: string,
  isViewed: boolean
) => Promise<ApiResponse<any>> = (errandId, communicationID, isViewed) => {
  if (!communicationID) {
    console.error('No communication id found, cannot fetch. Returning.');
  }
  const url = `supportmessage/errands/${errandId}/communication/${communicationID}/viewed/${isViewed}`;
  return apiService
    .put<ApiResponse<any>, any>(url, {})
    .then((res) => res.data)
    .catch((e) => {
      console.error('Something went wrong when setting message isViewed status: ', communicationID);
      throw e;
    });
};

export const getMessageAttachment: (
  errandId: string,
  communicationID: string,
  attachmentId: string
) => Promise<ApiResponse<string>> = (errandId, communicationID, attachmentId) => {
  if (!errandId) {
    console.error('No errand id found, cannot fetch.');
  }
  if (!communicationID) {
    console.error('No communication id found, cannot fetch.');
  }
  if (!attachmentId) {
    console.error('No attachment id found, cannot fetch.');
  }

  const url = `supportmessage/errand/${errandId}/communication/${communicationID}/attachments/${attachmentId}`;
  return apiService
    .get<ApiResponse<string>>(url)
    .then((res) => res.data)
    .catch((e) => {
      console.error('Something went wrong when fetching attachment');
      return { data: undefined as unknown as string, message: 'error' } as ApiResponse<string>;
    });
};

export interface MessageNode extends Message {
  children?: MessageNode[];
}

export const groupByConversationIdSortedTree = (messages: Message[]): MessageNode[] => {
  const conversationMap: Map<string, Message[]> = new Map();

  messages.forEach((msg) => {
    if (!msg.conversationId) return;
    if (!conversationMap.has(msg.conversationId)) {
      conversationMap.set(msg.conversationId, []);
    }
    conversationMap.get(msg.conversationId)?.push(msg);
  });

  const trees: MessageNode[] = [];
  conversationMap.forEach((msgList) => {
    const sorted = msgList.toSorted((a, b) => (dayjs(a.sent).isAfter(dayjs(b.sent)) ? 1 : -1));

    let prevNode: MessageNode | null = null;
    let rootNode: MessageNode | null = null;
    sorted.forEach((msg) => {
      const node: MessageNode = { ...msg, children: [] };
      if (!prevNode) {
        rootNode = node;
      } else {
        prevNode.children = [node];
      }
      prevNode = node;
    });

    if (rootNode) {
      trees.push(rootNode);
    }
  });

  return trees;
};

export const buildTree = (_list: Message[]) => {
  const nodesMap: Map<string, MessageNode> = new Map();
  const roots: MessageNode[] = [];
  const list: Message[] = _list.sort((a, b) =>
    dayjs(a.sent).isAfter(dayjs(b.sent)) ? -1 : dayjs(b.sent).isAfter(dayjs(a.sent)) ? 1 : 0
  );
  list.forEach((msg) => {
    msg.messageBody = msg.messageBody?.replace(/\r\n/g, '<br>');
    const id =
      msg.communicationType === SupportCommunicationType.Email
        ? msg.emailHeaders?.['MESSAGE_ID']?.[0]
        : msg.communicationID;
    nodesMap.set(id, { ...msg, children: [] });
  });

  list.forEach((msg) => {
    const id =
      msg.communicationType === SupportCommunicationType.Email
        ? msg.emailHeaders?.['MESSAGE_ID']?.[0]
        : msg.communicationID;
    const parent = msg.emailHeaders?.['IN_REPLY_TO']?.[0];
    if (parent) {
      const parentMsg = nodesMap.get(parent);
      if (!parentMsg) {
        console.error('Parent message not found for message:', msg);
        const dummyParent: MessageNode = {
          communicationAttachments: [],
          communicationID: uuidv4(),
          communicationType: msg.communicationType,
          direction: msg.direction === 'INBOUND' ? 'OUTBOUND' : 'INBOUND',
          errandNumber: msg.errandNumber,
          messageBody: '',
          sent: '',
          subject: 'Meddelande har vidarebefordrats',
          sender: 'N/A',
          target: msg.sender,
          viewed: true,
          emailHeaders: {
            MESSAGE_ID: [parent],
          },
          children: [],
          recipients: [],
          ccRecipients: [],
        };
        dummyParent?.children?.push(nodesMap.get(id)!);
        roots.push(dummyParent);
        return;
      }
      parentMsg?.children?.push(nodesMap.get(id)!);
    } else {
      roots.push(nodesMap.get(id)!);
    }
  });

  return roots;
};

export const countAllMessages = (tree: MessageNode[]): number => {
  if (!tree) {
    return 0;
  }
  let c = 0;
  c += tree.length;
  tree.forEach((root) => {
    c += countAllMessages(root.children ?? []);
  });
  return c;
};

export const countUnreadMessages = (tree: MessageNode[]): number => {
  if (!tree) {
    return 0;
  }
  let c = 0;
  c += tree.filter((node) => !node.viewed).length;
  tree.forEach((root) => {
    c += countUnreadMessages(root.children ?? []);
  });
  return c;
};
