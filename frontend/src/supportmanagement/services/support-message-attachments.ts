import type { MessageContactMeans } from '@common/services/message-template-body-service';

/**
 * The contact means a support message can carry attachments over. E-mail and the e-service web message send
 * them with the message; the conversations - Draken, Mina sidor and Katla - post them with the message in the
 * thread. SMS carries none.
 */
const CONTACT_MEANS_WITH_ATTACHMENTS: ReadonlySet<MessageContactMeans> = new Set<MessageContactMeans>([
  'email',
  'webmessage',
  'draken',
  'minasidor',
  'katla',
]);

export const contactMeansCarriesAttachments = (contactMeans: MessageContactMeans | undefined): boolean =>
  contactMeans !== undefined && CONTACT_MEANS_WITH_ATTACHMENTS.has(contactMeans);
