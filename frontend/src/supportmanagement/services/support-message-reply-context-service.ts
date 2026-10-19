import { MessageReplyContext } from '@common/interfaces/message-reply-context';
import { MessageContactMeans } from '@common/services/message-template-body-service';
import { sanitizeHtmlMessageBody } from '@common/services/sanitizer-service';

import { SupportCommunicationType } from './support-communication-types';
import { Message } from './support-message-service';

const communicationTypeToContactMeans: Partial<Record<SupportCommunicationType, MessageContactMeans>> = {
  [SupportCommunicationType.WebMessage]: 'webmessage',
  [SupportCommunicationType.Draken]: 'draken',
  [SupportCommunicationType.MinaSidor]: 'minasidor',
};

const getReplyContactMeans = (message: Message): MessageContactMeans => {
  return communicationTypeToContactMeans[message.communicationType] ?? 'email';
};

export const buildSupportReplyContext = (message: Message): MessageReplyContext => {
  const contactMeans = getReplyContactMeans(message);
  const replyTo = message.emailHeaders?.['MESSAGE_ID']?.[0] || '';
  const references = message.emailHeaders?.['REFERENCES'] || [];
  const historyHeader = `<br><br>-----Ursprungligt meddelande-----<br>Från: ${message.sender}<br>Skickat: ${message.sent}<br>Till: Sundsvalls kommun<br>Ämne: ${message.subject}<br><br>`;
  const messageBody = message.htmlMessageBody ? sanitizeHtmlMessageBody(message.htmlMessageBody) : message.messageBody;

  return {
    contactMeans,
    headerReplyTo: replyTo,
    headerReferences: [...references, replyTo].filter(Boolean).join(','),
    recipients: message.direction === 'OUTBOUND' ? [{ value: message.target }] : [{ value: message.sender }],
    historyHtml: historyHeader + messageBody,
    setupKey: `reply:${message.communicationID || ''}:${contactMeans}`,
  };
};
