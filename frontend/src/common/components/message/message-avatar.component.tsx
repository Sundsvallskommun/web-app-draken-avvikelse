import { Avatar } from '@sk-web-gui/react';
import { Message } from '@supportmanagement/services/support-message-service';
import { FC } from 'react';

const getSenderInitials = (msg: Message): string => {
  if ('sender' in msg && msg) {
    const parts = msg.sender.trim().split(' ');
    if (parts.length >= 2) {
      const firstInitial = parts[0]?.[0] ?? '';
      const lastInitial = parts[1]?.[0] ?? '';
      return `${firstInitial}${lastInitial}`;
    }
  }
  return '@';
};

export const MessageAvatar: FC<{
  message: Message;
}> = ({ message }) => {
  return (
    <Avatar
      rounded
      color={message.direction === 'OUTBOUND' ? 'juniskar' : 'bjornstigen'}
      size={'md'}
      initials={getSenderInitials(message)}
    />
  );
};
