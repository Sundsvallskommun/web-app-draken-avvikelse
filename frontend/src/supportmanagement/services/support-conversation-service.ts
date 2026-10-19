import { ApiResponse, apiService } from '@common/services/api-service';
import { RelationWithErrandNumber } from '@common/services/relations-service';
import { MessageNode } from '@supportmanagement/services/support-message-service';

import { SingleSupportAttachment } from './support-attachment-service';
import { SupportErrand } from './support-errand-service';

export interface ConversationReadByCount {
  conversationId?: string;
  messageCount?: number;
  readByCount?: {
    identifier?: {
      type?: string;
      value?: string;
    };
    count?: number;
  }[];
  readByPartCount?: {
    part?: string;
    count?: number;
  }[];
}

export interface ConversationMessageCountSummary {
  total: number;
  unread: number;
}

export const getSupportConversations: (municipalityId: string, errandId: string) => Promise<ApiResponse<any[]>> = (
  municipalityId,
  errandId
) => {
  if (!errandId) {
    console.error('No errand id found, cannot fetch. Returning.');
  }

  const url = `supportmanagement/${municipalityId}/namespace/errands/${errandId}/communication/conversations`;
  return apiService
    .get<ApiResponse<any>>(url)
    .then((res) => {
      return res.data.data;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching conversation for errand: ', errandId);
      throw e;
    });
};

export const getSupportConversationMessages: (
  municipalityId: string,
  errandId: string,
  conversationId: string
) => Promise<ApiResponse<MessageNode[]>> = (municipalityId, errandId, conversationId) => {
  if (!errandId) {
    console.error('No errand id found, cannot fetch. Returning.');
  }
  const url = `supportmanagement/${municipalityId}/namespace/errands/${errandId}/communication/conversations/${conversationId}/messages`;
  return apiService
    .get<ApiResponse<any>>(url)
    .then((res) => {
      return res.data;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching conversation for errand: ', errandId);
      throw e;
    });
};

export const getSupportConversationReadByCounts = (
  municipalityId: string,
  errandId: string,
  conversationId?: string,
  includeSystemMessages = false
): Promise<ConversationReadByCount[]> => {
  const query = new URLSearchParams({ includeSystemMessages: String(includeSystemMessages) });
  if (conversationId) {
    query.set('conversationId', conversationId);
  }
  const url = `supportmanagement/${municipalityId}/namespace/errands/${errandId}/communication/conversations/count-read-by?${query}`;

  return apiService
    .get<ConversationReadByCount[]>(url)
    .then((res) => res.data)
    .catch((error) => {
      console.error('Something went wrong when fetching conversation read counts for errand: ', errandId);
      throw error;
    });
};

export const markSupportConversationMessagesAsRead = (
  municipalityId: string,
  errandId: string,
  conversationId: string,
  messageIds: string[]
): Promise<void> => {
  const url = `supportmanagement/${municipalityId}/namespace/errands/${errandId}/communication/conversations/${conversationId}/messages/mark-as-read`;
  return apiService.post<void, { messageIds: string[] }>(url, { messageIds }).then(() => undefined);
};

export const getConversationMessageCountSummary = (
  counts: ConversationReadByCount[],
  errandNumber: string
): ConversationMessageCountSummary =>
  counts.reduce<ConversationMessageCountSummary>(
    (summary, conversation) => {
      const messageCount = Math.max(0, conversation.messageCount ?? 0);
      const readCount = Math.min(
        messageCount,
        (conversation.readByPartCount ?? [])
          .filter((entry) => entry.part === errandNumber)
          .reduce((sum, entry) => sum + Math.max(0, entry.count ?? 0), 0)
      );

      return {
        total: summary.total + messageCount,
        unread: summary.unread + messageCount - readCount,
      };
    },
    { total: 0, unread: 0 }
  );

const createSupportConversation = async (
  municipalityId: string,
  errandId: string,
  topic: string,
  type: string,
  relationId?: string
) => {
  const url = `supportmanagement/${municipalityId}/namespace/errand/${errandId}/communication/conversations`;

  const body: Partial<any> = {
    topic: topic,
    type: type,
    ...(relationId ? { relationIds: [relationId] } : {}),
  };

  return apiService
    .post<ApiResponse<any>, Partial<any>>(url, body)
    .then((res) => {
      return res.data;
    })
    .catch((e) => {
      console.error('Something went wrong when creating relation: ' + e);
      throw e;
    });
};

export const sendSupportConversationMessage = (
  municipalityId: string,
  errandId: string,
  conversationId: string,
  message: string,
  files?: { file: File }[],
  existingAttachments?: SingleSupportAttachment[]
) => {
  const url = `supportmanagement/${municipalityId}/namespace/errand/${errandId}/communication/conversations/${conversationId}/messages`;

  const formData = new FormData();
  const messageBody: { content: string; attachmentIds?: string[] } = {
    content: message,
  };

  if (existingAttachments && existingAttachments.length > 0) {
    const ids = existingAttachments
      .map((a: any) => a.attachmentId ?? a.errandAttachmentHeader?.id)
      .filter((id: any) => id != null);
    if (ids.length > 0) {
      messageBody.attachmentIds = ids;
    }
  }

  formData.append('message', JSON.stringify(messageBody));

  if (files && files.length > 0) {
    files.forEach((fileList) => {
      if (fileList) {
        formData.append('attachments', (fileList.file as unknown as FileList)[0]);
      }
    });
  }

  return apiService
    .post<ApiResponse<any>, FormData>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data)
    .catch((e) => {
      console.error('Something went wrong when creating relation: ' + e);
      throw e;
    });
};

export const getSupportConversationAttachment: (
  municipalityId: string,
  errandId: string,
  conversationId: string,
  messageId: string,
  attachmentId: string
) => Promise<ApiResponse<any>> = (municipalityId, errandId, conversationId, messageId, attachmentId) => {
  if (!errandId) {
    console.error('No errand id found, cannot fetch. Returning.');
  }

  const url = `supportmanagement/${municipalityId}/namespace/errands/${errandId}/communication/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}`;
  return apiService
    .get<ApiResponse<any>>(url)
    .then((res) => {
      return res.data;
    })
    .catch((e) => {
      console.error('Something went wrong when fetching conversation attachment for errand: ', errandId);
      throw e;
    });
};

export const getOrCreateSupportConversationId = async (
  municipalityId: string,
  supportErrand: SupportErrand,
  contactMeans: string,
  selectedRelationId: string,
  relationErrands: RelationWithErrandNumber[],
  messageConversationId: string
): Promise<string> => {
  const conversationType = contactMeans === 'draken' || contactMeans === 'katla' ? 'INTERNAL' : 'EXTERNAL';
  // Only Draken answers on an errand relation. Katla is answered without one even when the errand happens to have
  // one: a linked errand is picked for Draken and that choice is kept in the form, so reading it for any other contact
  // means would quietly tie that thread to whatever errand was linked last.
  const selectedEntry =
    contactMeans === 'draken'
      ? relationErrands.find((entry) => entry.otherResourceId === selectedRelationId)
      : undefined;

  const conversations = await getSupportConversations(municipalityId, supportErrand.id!);
  const existingExternalConversation = conversations.data.find((c) => c.type === 'EXTERNAL');
  const existingInternalConversation = conversations.data.find(
    (conv: any) => conv.type === 'INTERNAL' && conv.relationIds && conv.relationIds[0] === selectedEntry?.relation.id
  );
  // Katla's thread is the internal conversation that is tied to no errand relation at all, which
  // is why it cannot be found by relation id like the others. Finding it is what keeps one thread
  // per errand rather than a new one for every message sent.
  const existingRelationlessConversation = conversations.data.find(
    (conversation: any) => !conversation.relationIds?.length && conversation.type !== 'EXTERNAL'
  );

  let conversationId: string | undefined = undefined;

  if (contactMeans === 'draken' && existingInternalConversation) {
    conversationId = existingInternalConversation.id;
  }

  if (contactMeans === 'minasidor' && existingExternalConversation) {
    conversationId = existingExternalConversation.id;
  }

  if (contactMeans === 'katla' && existingRelationlessConversation) {
    conversationId = existingRelationlessConversation.id;
  }

  if (messageConversationId) {
    conversationId = messageConversationId;
  }

  if (!conversationId) {
    const relation = selectedEntry;
    let topic;
    if (conversationType === 'EXTERNAL') {
      topic = `Mina sidor`;
    } else {
      topic = `${supportErrand.errandNumber}${relation ? ` - ${relation.errandNumber}` : ''}`;
    }

    const newConversation = await createSupportConversation(
      municipalityId,
      supportErrand.id!,
      topic,
      conversationType,
      relation?.relation.id
    );
    conversationId = newConversation.data.id;
  }

  return conversationId!;
};
