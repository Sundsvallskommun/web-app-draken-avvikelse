import { matchEventToNotification } from '@common/components/notifications/notification-utils';
import { useRefreshNotifications } from '@common/hooks/useNotificationPoller';
import { sanitized } from '@common/services/sanitizer-service';
import { Avatar, Button, cx, Modal, Spinner } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { Priority } from '@supportmanagement/interfaces/priority';
import { ParsedSupportEvent } from '@supportmanagement/interfaces/supportEvent';
import { ParsedSupportRevisionDifference } from '@supportmanagement/interfaces/supportRevisionDiff';
import { Channels, getChannelLabel } from '@supportmanagement/services/support-errand-service';
import { getSupportErrandEvents, groupSupportEvents } from '@supportmanagement/services/support-history-service';
import { fetchRevisionDiff } from '@supportmanagement/services/support-revision-service';
import dayjs from 'dayjs';
import { Bell, History } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

export const SidebarHistory: React.FC<{}> = () => {
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const notifications = useSupportStore((s) => s.notifications);
  const administrators = useUserStore((s) => s.administrators);
  const refreshNotifications = useRefreshNotifications();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [events, setEvents] = useState<ParsedSupportEvent[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [selectedChange, setSelectedChange] = useState<ParsedSupportEvent>();
  const [selectedChangeDetails, setSelectedChangeDetails] = useState<ParsedSupportRevisionDifference[]>();
  const [keyMapper, setKeyMapper] = useState<{ [key: string]: string }>();
  const highlightRef = useRef<HTMLDivElement>(null);
  const hasLoadedNotifications = useRef(false);

  useEffect(() => {
    if (supportErrand && keyMapper && Object.keys(keyMapper).length > 1) {
      setError(false);
      setIsLoading(true);
      getSupportErrandEvents(supportErrand?.id!, keyMapper)
        .then((res) => {
          setEvents(res);
          setIsLoading(false);
        })
        .catch((e) => setError(true));
    }
  }, [supportErrand, keyMapper]);

  useEffect(() => {
    const _km: Record<string, string> = { NONE: 'Ingen' };
    supportMetadata?.statuses?.forEach((e) => {
      if (e.name && e.displayName) _km[e.name] = e.displayName;
    });
    Object.entries(Priority).forEach((e) => {
      _km[e[0]] = e[1];
    });
    Object.keys(Channels).forEach((channel) => {
      _km[channel] = getChannelLabel(channel) ?? channel;
    });
    _km['true'] = 'Ja';
    _km['false'] = 'Nej';
    supportMetadata?.categories?.forEach((c) => {
      _km[c.name!.replaceAll('.', '/')] = c.displayName!;
      c.types?.forEach((t) => {
        _km[t.name.replaceAll('.', '/')] = t.displayName!;
      });
    });
    setKeyMapper(_km);
  }, [supportMetadata]);

  useEffect(() => {
    if (selectedChange) {
      // setSelectedChangeDetails(selectedChange.parsed.diffList);
      // setIsOpen(true);
      // TODO Fetch revison diff on modal opening or when fetching events (slow)?
      fetchRevisionDiff(supportErrand!.id!, selectedChange, keyMapper!, administrators)
        .then((res) => {
          setSelectedChangeDetails(res);
          setIsOpen(true);
        })
        .catch((e) => {
          console.error('Could not fetch change data');
        })
        .finally(() => {
          setIsLoading(false);
          setSelectedIndex(undefined);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const groups = useMemo(() => groupSupportEvents(events), [events]);

  const notificationId = searchParams?.get('notification');

  /** Errands open in a new tab, so the store starts empty whether or not a notification link was used. */
  useEffect(() => {
    if (hasLoadedNotifications.current) return;
    hasLoadedNotifications.current = true;
    void refreshNotifications();
  }, [refreshNotifications]);

  /** Matching is a timestamp heuristic, so it has to be scoped to this errand. */
  const errandNotifications = useMemo(
    () => notifications.filter((notification) => notification.errandId === supportErrand?.id),
    [notifications, supportErrand?.id]
  );

  /**
   * The notification the user arrived from, if any. Following a notification should land on the very
   * thing it was about, not just somewhere in the log.
   */
  const originNotification = useMemo(() => {
    if (!notificationId) return undefined;
    return errandNotifications.find((notification) => notification.id === notificationId);
  }, [notificationId, errandNotifications]);

  /** Events that produced a notification for this user — the "you were told about this" marker. */
  const notifiedEventKeys = useMemo(() => {
    const keys = new Set<string>();
    groups.forEach((group) => {
      const notified = group.events.some((event) =>
        errandNotifications.some((notification) => matchEventToNotification(event, notification))
      );
      if (notified) keys.add(group.key);
    });
    return keys;
  }, [groups, errandNotifications]);

  const highlightedKey = useMemo(() => {
    if (!originNotification) return undefined;
    return groups.find((group) => group.events.some((event) => matchEventToNotification(event, originNotification)))
      ?.key;
  }, [groups, originNotification]);

  useEffect(() => {
    if (highlightedKey && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center' });
    }
  }, [highlightedKey]);

  const openDetails = (event: ParsedSupportEvent, index: number) => {
    setIsLoading(true);
    setSelectedIndex(index);
    setSelectedChange(event);
  };

  return (
    <div className="relative h-full flex flex-col justify-start" data-cy="history-log">
      <div className="px-0 flex justify-between items-center">
        <span className="text-base md:text-large xl:text-lead font-semibold">Ärendelogg</span>
      </div>
      {isLoading ? (
        <div className="mt-64 flex flex-col items-center justify-center gap-md">
          <Spinner size={2} />
          Hämtar logg
        </div>
      ) : (
        <>
          <div>
            {groups?.map((group, idx) => {
              const isHighlighted = group.key === highlightedKey;
              return (
                <div
                  key={`history-event-${group.key}`}
                  ref={isHighlighted ? highlightRef : undefined}
                  data-cy={`history-event-${group.key}`}
                  className={cx(
                    'history-event first:mt-lg mb-xs relative pb-md px-md flex flex-col gap-sm',
                    idx < groups.length - 1 && 'border-0 border-l-1 border-gray-300',
                    isHighlighted && 'bg-vattjom-surface-accent rounded-groups'
                  )}
                >
                  <div className="bg-white absolute m-0 p-0 flex items-start justify-start -left-[4px] top-0 w-[7px] h-[7px] border-2 border-gray-700 rounded-full"></div>
                  <small className="font-normal -mt-[4px] mb-6 flex items-center gap-8">
                    {group.latest.parsed.datetime}
                    {notifiedEventKeys.has(group.key) && (
                      <Bell size="1.4rem" aria-label="Gav en notis" data-cy="history-event-notified" />
                    )}
                  </small>
                  <small className="mb-6">
                    {/* TODO User image or initials for Avatar */}
                    <Avatar rounded size="sm" className="mr-8" />
                    {group.latest.metadata.find((a) => a.key === 'ExecutedBy')?.value}
                  </small>
                  {group.events.map((event) => (
                    <small key={event.id ?? event.message}>
                      <Button
                        aria-label={`${event.parsed.event}, visa.`}
                        variant="link"
                        className="text-dark-secondary text-left"
                        onClick={() => openDetails(event, idx)}
                      >
                        {event.message}
                      </Button>
                    </small>
                  ))}
                </div>
              );
            })}
          </div>
          <Modal
            className="w-[64rem] px-40"
            show={isOpen}
            label={
              <div className="flex items-center gap-md">
                <History />
                <h3 className="text-h3-sm md:text-h3-md xl:text-h3-lg">Detaljer</h3>
              </div>
            }
            onClose={() => {
              setIsOpen(false);
            }}
          >
            <Modal.Content>
              <p>{selectedChange?.message}</p>
              {selectedChange?.details ? (
                <p className="text-dark-secondary" data-cy="history-event-details">
                  {selectedChange.details}
                </p>
              ) : null}
              <div className="flex flex-col justify-center">
                <div data-cy="history-table-details-title">
                  {selectedChangeDetails?.map((details, index) => {
                    return (
                      <div key={`change-detail-${index}`}>
                        <strong>{details.title + '\n'}</strong>

                        <p
                          data-cy="history-table-details-content"
                          dangerouslySetInnerHTML={{
                            __html: sanitized(details.description || ''),
                          }}
                        ></p>
                      </div>
                    );
                  })}
                </div>

                <p>
                  Uppdaterades:{' '}
                  {selectedChange?.created ? dayjs(selectedChange?.created).format('YYYY-MM-DD HH:mm:ss') : 'okänt'}
                </p>
              </div>
            </Modal.Content>
            <Modal.Footer>
              <div className="flex justify-end w-full">
                <Button
                  data-cy="history-table-details-close-button"
                  className="w-full"
                  variant="primary"
                  color="primary"
                  onClick={() => {
                    setIsOpen(false);
                    setSelectedIndex(undefined);
                    setSelectedChange(undefined);
                  }}
                >
                  Stäng
                </Button>
              </div>
            </Modal.Footer>
          </Modal>
        </>
      )}
    </div>
  );
};
