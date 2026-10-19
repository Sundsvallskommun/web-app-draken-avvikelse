import { sanitized } from '@common/services/sanitizer-service';
import { Button } from '@sk-web-gui/button';
import { SupportCommunicationType } from '@supportmanagement/services/support-communication-types';
import { getChannelLabel, SupportErrand } from '@supportmanagement/services/support-errand-service';
import { Message } from '@supportmanagement/services/support-message-service';
import { getApplicantName } from '@supportmanagement/services/support-stakeholder-service';
import { FC, useState } from 'react';
const MAX_VISIBLE_RECIPIENTS = 2;

const getReciever = (msg: Message, supportErrand: SupportErrand): string | string[] => {
  if (!msg) {
    return '';
  }

  if (msg.communicationType === SupportCommunicationType.WebMessage) {
    return msg.direction === 'INBOUND' ? 'Draken' : getChannelLabel('ESERVICE') ?? '';
  }
  if (msg.communicationType === SupportCommunicationType.MinaSidor && msg.direction === 'OUTBOUND') {
    return getApplicantName(supportErrand);
  }

  if (msg.communicationType === SupportCommunicationType.MinaSidor && msg.direction === 'INBOUND') {
    return 'Draken';
  }

  if (msg.communicationType === SupportCommunicationType.Draken) {
    return 'Draken';
  }

  if (msg.communicationType === SupportCommunicationType.Email) {
    return msg.recipients;
  }
  return msg?.target || '(okänd mottagare)';
};

interface EmailRecipientsProps {
  recipients: string[];
}

export const EmailRecipients: FC<EmailRecipientsProps> = ({ recipients }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalCount = recipients.length;
  const hasMore = totalCount > MAX_VISIBLE_RECIPIENTS;
  const visibleRecipients = isExpanded ? recipients : recipients.slice(0, MAX_VISIBLE_RECIPIENTS);
  const hiddenCount = totalCount - MAX_VISIBLE_RECIPIENTS;

  return (
    <span>
      {sanitized(visibleRecipients.join(', '))}
      {hasMore && !isExpanded && (
        <Button variant="link" className="ml-4" onClick={() => setIsExpanded(true)}>
          + {hiddenCount} {hiddenCount === 1 ? 'annan' : 'andra'}
        </Button>
      )}
      {isExpanded && (
        <Button variant="link" className="ml-4" onClick={() => setIsExpanded(false)}>
          Visa färre
        </Button>
      )}
    </span>
  );
};

export const RenderSupportMessageReciever: FC<{ selectedMessage: Message; errand: SupportErrand }> = ({
  selectedMessage,
  errand,
}) => {
  const reciever = getReciever(selectedMessage, errand);

  if (Array.isArray(reciever)) {
    return <EmailRecipients recipients={reciever} />;
  }

  return <>{sanitized(reciever)}</>;
};
