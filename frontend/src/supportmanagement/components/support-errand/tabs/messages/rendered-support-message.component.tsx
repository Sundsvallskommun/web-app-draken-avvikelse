import { MessageAvatar } from '@common/components/message/message-avatar.component';
import { CommunicationDirectionEnum } from '@common/data-contracts/supportmanagement/data-contracts';
import { sanitized } from '@common/services/sanitizer-service';
import { Button, cx, Icon, useSnackbar } from '@sk-web-gui/react';
import { useConfigStore, useSupportStore, useUserStore } from '@stores/index';
import {
  isSupportReplyableCommunicationType,
  SupportCommunicationType,
} from '@supportmanagement/services/support-communication-types';
import { getSupportConversationAttachment } from '@supportmanagement/services/support-conversation-service';
import {
  getChannelLabel,
  getChannelLabelInSentence,
  isSupportErrandLocked,
  validateAction,
} from '@supportmanagement/services/support-errand-service';
import {
  getMessageAttachment,
  Message,
  MessageNode,
  setMessageViewStatus,
} from '@supportmanagement/services/support-message-service';
import dayjs from 'dayjs';
import {
  CornerDownRight,
  Image,
  type LucideIcon,
  Mail,
  Monitor,
  Paperclip,
  Smartphone,
  SquareMinus,
  SquarePlus,
} from 'lucide-react';
import { Dispatch, FC, SetStateAction, useEffect, useMemo, useState } from 'react';

import { EmailRecipients, RenderSupportMessageReciever } from './render-support-message-reciever.component';
import { useSupportMessagingPhase } from './use-support-messaging-phase';

type ChannelPresentation = {
  Icon: LucideIcon;
  label: string;
};

// Asked for when a message is drawn, not when the module loads: what the e-service is called is the running
// investigation's to say, and that is known only once the feature flags have been served.
const communicationChannelPresentation = (
  communicationType: SupportCommunicationType
): ChannelPresentation | undefined =>
  ((
    {
      [SupportCommunicationType.Sms]: { Icon: Smartphone, label: 'Via SMS' },
      [SupportCommunicationType.Email]: { Icon: Mail, label: 'Via e-post' },
      [SupportCommunicationType.WebMessage]: { Icon: Monitor, label: `Via ${getChannelLabelInSentence('ESERVICE')}` },
      [SupportCommunicationType.Draken]: { Icon: Monitor, label: 'Via Draken' },
      [SupportCommunicationType.MinaSidor]: { Icon: Monitor, label: 'Via Mina sidor' },
    } as Partial<Record<SupportCommunicationType, ChannelPresentation>>
  )[communicationType]);

export const RenderedSupportMessage: FC<{
  update: () => void;
  setShowMessageForm: Dispatch<SetStateAction<boolean>>;
  message: MessageNode;
  selected: string;
  onSelect: (msg: Message) => void;
  root?: boolean;
  children: any;
}> = ({ update, setShowMessageForm, message, onSelect, root = false, children }) => {
  const _supportErrand = useSupportStore((s) => s.supportErrand);
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const user = useUserStore((s) => s.user);
  const supportErrand = _supportErrand!;

  // Changed logic for expanded message to see if it solve problem with unread message counter
  // const [expanded, setExpanded] = useState(!message?.children?.length ? true : false);
  const [expanded, setExpanded] = useState(false);
  const channelPresentation = communicationChannelPresentation(message.communicationType);
  const ChannelIcon = channelPresentation?.Icon;

  const allowed = useMemo(() => validateAction(supportErrand, user), [user, supportErrand]);
  // A reply is a message sent like any other, so it waits for the same phase.
  const messagingPhase = useSupportMessagingPhase();

  const toastMessage = useSnackbar();

  // We truncate reply messages at the first occurence of "Från: " and
  // the first "-----Ursprungligt meddelande-----" line, so that only the
  // last message body is shown.
  const answerMessage =
    Array.isArray(message.emailHeaders?.IN_REPLY_TO) &&
    // message.messageBody.split('Från: ')[0].split('-----Ursprungligt')[0];
    message.messageBody.replace(/\<br\>\<br\>\<br\>\<br\>/g, '<p><br></p>');

  const getSender = (msg: Message) => {
    if (!msg) {
      return '';
    }
    if (msg.communicationType === SupportCommunicationType.WebMessage) {
      return msg.direction === 'OUTBOUND' ? 'Draken' : msg.sender || getChannelLabel('ESERVICE') || '';
    }
    return msg?.sender || '(okänd avsändare)';
  };

  const getMessageOwner = (msg: Message) => {
    if (msg.direction === CommunicationDirectionEnum.INBOUND) {
      const ownerInfomration =
        supportErrand.stakeholders?.filter((stakeholder) => stakeholder.role?.includes('PRIMARY')) ?? [];
      const isWebMessageOpenE = msg.communicationType === SupportCommunicationType.WebMessage;
      const isOwnerStakeholderEmail = ownerInfomration.some((stakeholder) =>
        stakeholder.contactChannels?.some((value) => value.value === msg.sender)
      );

      if (isWebMessageOpenE || isOwnerStakeholderEmail) {
        return <span className="text-xs whitespace-nowrap">Ärendeägare</span>;
      }
    }
  };

  function isInViewport(element: Element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  useEffect(() => {
    if (!message.conversationId && !message.viewed && supportErrand.assignedUserId === user.username) {
      expanded &&
        isInViewport(document.querySelector(`.message-${message.communicationID}`)!) &&
        setMessageViewStatus(supportErrand.id!, municipalityId, message.communicationID, true).then(() => {
          update();
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, supportErrand]);

  return (
    <>
      <div
        data-cy={`message-${message.communicationID}`}
        key={`message-${message.communicationID}`}
        className={cx('rounded-4 m-0 py-sm px-sm text-md hover:bg-background-color-mixin-1')}
      >
        <div className="relative flex gap-md items-start justify-between">
          <div className="flex w-full">
            <MessageAvatar message={message} />
            <div className="w-5/6 ml-sm">
              <div className="my-0 flex justify-between">
                <div>
                  {!root ? <Icon size={16} className="mr-sm" icon={<CornerDownRight />} /> : null}
                  <p
                    className={cx(`mr-md break-all text-small font-bold`)}
                    dangerouslySetInnerHTML={{
                      __html: `Från: ${sanitized(getSender(message))}`,
                    }}
                  ></p>
                  <p className="mr-md break-all font-bold">
                    Till: <RenderSupportMessageReciever selectedMessage={message} errand={supportErrand} />
                  </p>
                  {message.communicationType === SupportCommunicationType.Email && message.ccRecipients?.length > 0 && (
                    <p className="mr-md break-all font-bold">
                      Kopia: <EmailRecipients recipients={message.ccRecipients} />
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col align-end items-end justify-between mt-4">
            <div className="inline-flex items-start flex-nowrap">
              <span className="text-xs whitespace-nowrap">
                {message.sent ? dayjs(message.sent).format('YYYY-MM-DD HH:mm') : 'Datum saknas'}
              </span>
              <span className="text-xs mx-sm">|</span>
              {message.communicationAttachments?.length > 0 ? (
                <>
                  <div className="mx-sm inline-flex items-center gap-xs">
                    <Icon icon={<Paperclip />} size="1.5rem" />
                    <span className="text-xs">{message.communicationAttachments?.length}</span>
                  </div>
                  <span className="text-xs mx-sm">|</span>
                </>
              ) : null}
              {channelPresentation && ChannelIcon ? (
                <span className="flex text-xs whitespace-nowrap items-center">
                  <Icon icon={<ChannelIcon />} size="1.5rem" className="align-sub mx-sm" />
                  {channelPresentation.label}
                </span>
              ) : null}
            </div>
            {getMessageOwner(message)}
          </div>
          <div className="flex gap-8">
            <span
              className={cx(
                message.viewed ? 'bg-gray-200' : `bg-vattjom-surface-primary`,
                `self-center w-12 h-12 my-xs rounded-full flex items-center justify-center text-lg`
              )}
            ></span>
            <Button
              variant="ghost"
              iconButton
              size="sm"
              onClick={() => {
                setExpanded(expanded ? false : true);
                !expanded && onSelect(message);
              }}
            >
              <Icon icon={expanded ? <SquareMinus /> : <SquarePlus />} />
            </Button>
          </div>
        </div>
        <div className="pl-xl flex justify-between items-start">
          <p
            className={cx(`my-0 text-primary`, message.viewed ? 'font-normal' : 'font-bold')}
            dangerouslySetInnerHTML={{
              __html: sanitized(message.subject || ''),
            }}
          ></p>
          {expanded && isSupportReplyableCommunicationType(message.communicationType) ? (
            <Button
              type="button"
              className="self-start"
              color="vattjom"
              disabled={isSupportErrandLocked(supportErrand) || !allowed || !!messagingPhase}
              size="sm"
              variant="primary"
              onClick={() => {
                onSelect(message);
                setShowMessageForm(true);
              }}
            >
              {message?.direction === 'INBOUND' ? 'Svara' : 'Följ upp'}
            </Button>
          ) : null}
        </div>

        <div
          className={`message-${message.communicationID} px-xl ${
            expanded ? '' : 'max-h-0 overflow-hidden'
          } transition-[max-height] ease-in-out`}
        >
          {message?.communicationAttachments?.length > 0 ? (
            <ul className="flex flex-wrap gap-sm items-center my-12">
              <Icon icon={<Paperclip />} size="1.6rem" />
              {message?.communicationAttachments?.map((a, idx) => (
                <Button
                  key={`${a.fileName}-${idx}`}
                  onClick={() => {
                    if (message?.conversationId) {
                      getSupportConversationAttachment(
                        municipalityId,
                        supportErrand.id!,
                        message.conversationId!,
                        message.messageId!,
                        a.id!
                      )
                        .then((res) => {
                          if (res.data.length !== 0) {
                            const uri = `data:${a.mimeType};base64,${res.data}`;
                            const link = document.createElement('a');
                            const filename = a.fileName ?? '';
                            link.href = uri;
                            link.setAttribute('download', filename);
                            document.body.appendChild(link);
                            link.click();
                          } else {
                            toastMessage({
                              position: 'bottom',
                              closeable: false,
                              message: 'Filen kan inte hittas eller är skadad.',
                              status: 'error',
                            });
                          }
                        })
                        .catch((error) => {
                          toastMessage({
                            position: 'bottom',
                            closeable: false,
                            message: 'Något gick fel när bilagan skulle hämtas',
                            status: 'error',
                          });
                        });
                    } else {
                      getMessageAttachment(municipalityId, supportErrand.id!, message.communicationID, a.id!)
                        .then((res) => {
                          if (res.data) {
                            const uri = `data:${a.mimeType};base64,${res.data}`;
                            const link = document.createElement('a');
                            const filename = a.fileName ?? '';
                            link.href = uri;
                            link.setAttribute('download', filename);
                            document.body.appendChild(link);
                            link.click();
                          } else {
                            toastMessage({
                              position: 'bottom',
                              closeable: false,
                              message: 'Filen kan inte hittas eller är skadad.',
                              status: 'error',
                            });
                          }
                        })
                        .catch((error) => {
                          toastMessage({
                            position: 'bottom',
                            closeable: false,
                            message: 'Något gick fel när bilagan skulle hämtas',
                            status: 'error',
                          });
                        });
                    }
                  }}
                  role="listitem"
                  // eslint-disable-next-line jsx-a11y/alt-text
                  leftIcon={a.fileName?.endsWith('pdf') ? <Icon icon={<Paperclip />} /> : <Icon icon={<Image />} />}
                  variant="tertiary"
                >
                  {a.fileName}
                </Button>
              ))}
            </ul>
          ) : null}
          <div className="my-18">
            <span
              className="text"
              dangerouslySetInnerHTML={{
                __html: message.htmlMessageBody ? sanitized(message.htmlMessageBody) : sanitized(message.messageBody),
              }}
            />
          </div>
        </div>
      </div>
      <div className="ml-lg">{children}</div>
    </>
  );
};
