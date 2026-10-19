import { MessageContactMeans } from '@common/services/message-template-body-service';

export interface MessageReplyContext {
  contactMeans: MessageContactMeans;
  headerReplyTo: string;
  headerReferences: string;
  recipients: { value: string }[];
  historyHtml: string;
  setupKey: string;
}
