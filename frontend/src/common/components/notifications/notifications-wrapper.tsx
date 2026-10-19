import { sortBy } from '@common/services/helper-service';
import { Button, Checkbox, cx, Divider, useSnackbar } from '@sk-web-gui/react';
import { useSupportStore } from '@stores/index';
import { useConfigStore } from '@stores/index';
import { Bell, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { acknowledgeNotifications } from './notification-actions';
import { NotificationGroupItem } from './notification-group-item';
import { getFilteredNotifications } from './notification-utils';
import { NotificationView } from './notification-view';

export const NotificationsWrapper: React.FC<{
  show: boolean;
  setShow: (arg0: boolean) => void;
  refresh?: () => Promise<void>;
}> = ({ show, setShow, refresh }) => {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const notifications = useSupportStore((s) => s.notifications);
  const toastMessage = useSnackbar();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  useEffect(() => {
    if (show) {
      void refresh?.();
    } else {
      setSelectedKeys(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // One row per notification, never merged in the client. Supportmanagement aggregates upstream, so
  // a row can still cover several events. Sorted here because the API guarantees no order.
  const { newNotifications, acknowledgedNotifications } = useMemo(() => {
    const filtered = getFilteredNotifications(notifications);
    return {
      newNotifications: sortBy(
        filtered.filter((n) => !n.acknowledged),
        'created'
      ).reverse(),
      acknowledgedNotifications: sortBy(
        filtered.filter((n) => n.acknowledged),
        'created'
      ).reverse(),
    };
  }, [notifications]);

  const handleToggleSelect = (notificationId: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      return next;
    });
  };

  const handleSelectAllNew = () => {
    const allIds = newNotifications.map((notification) => notification.id);
    const allSelected = allIds.every((id) => selectedKeys.has(id));

    setSelectedKeys((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const selectedNotifications = newNotifications.filter((notification) => selectedKeys.has(notification.id));

  const handleAcknowledgeSelected = async () => {
    if (!selectedNotifications.length) return;

    const count = selectedNotifications.length;
    setIsAcknowledging(true);
    try {
      const { failed } = await acknowledgeNotifications(municipalityId, selectedNotifications);
      await refresh?.();
      // Keep the failed ones selected so a retry does not mean re-ticking them.
      setSelectedKeys(new Set(failed));

      if (failed.length) {
        toastMessage({
          position: 'bottom',
          closeable: false,
          message:
            failed.length === count
              ? 'Något gick fel när notifieringarna skulle kvitteras'
              : `${count - failed.length} av ${count} notiser kvitterades`,
          status: 'error',
        });
        return;
      }

      toastMessage({
        position: 'bottom',
        closeable: true,
        message: `${count} notis${count > 1 ? 'er' : ''} kvitterad${count > 1 ? 'e' : ''}`,
        status: 'success',
      });
    } catch (error) {
      toastMessage({
        position: 'bottom',
        closeable: false,
        message: 'Något gick fel när notifieringarna skulle kvitteras',
        status: 'error',
      });
    } finally {
      setIsAcknowledging(false);
    }
  };

  const allNewSelected =
    newNotifications.length > 0 && newNotifications.every((notification) => selectedKeys.has(notification.id));
  const someNewSelected = newNotifications.some((notification) => selectedKeys.has(notification.id));

  const renderNotifications = (list: NotificationView[], selectable: boolean) => (
    <ul>
      {list.map((notification) => (
        <li key={notification.id}>
          <NotificationGroupItem
            notification={notification}
            isSelected={selectedKeys.has(notification.id)}
            onToggleSelect={() => handleToggleSelect(notification.id)}
            showCheckbox={selectable}
            refresh={refresh}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="static">
      {show && (
        <>
          <div className="w-[calc(100vw-32rem)] ml-[32rem] top-0 bottom-0 h-full absolute bg-primitives-overlay-darken-6"></div>
          <div
            className={cx(
              `border-1 border-t-0 absolute top-0 bottom-0 -right-[52rem] bg-background-content h-auto transition-all ease-in-out duration-150 z-[20]`,
              show ? 'w-[52rem]' : 'w-0 px-0'
            )}
          >
            <div className="py-16 px-40 w-full flex justify-between items-center shadow-lg h-[8rem]">
              <div className="text-h4-sm flex items-center gap-12">
                <Bell /> Notiser
              </div>
              <Button
                tabIndex={show ? 0 : -1}
                aria-label="Stäng notiser"
                iconButton
                variant="tertiary"
                onClick={() => {
                  setShow(false);
                }}
              >
                <X />
              </Button>
            </div>
          </div>
          <section
            className={cx(
              `border-1 border-t-0 mt-md absolute top-[9rem] bottom-0 -right-[52rem] transition-all ease-in-out duration-150 z-[20] flex flex-col shadow-lg`,
              show ? 'w-[52rem]' : 'w-0 px-0'
            )}
          >
            <div className="flex-grow mt-sm mb-0 p-24 pt-5 flex flex-col gap-24 overflow-auto">
              <div className="flex flex-col gap-4">
                <div className="relative">
                  <Divider.Section>
                    <div className="flex gap-sm items-center">
                      {newNotifications.length > 0 && (
                        <Checkbox
                          checked={allNewSelected}
                          indeterminate={someNewSelected && !allNewSelected}
                          onChange={handleSelectAllNew}
                        />
                      )}
                      <h2 className="text-h4-sm">Nya</h2>
                    </div>
                  </Divider.Section>
                  {selectedNotifications.length > 0 && (
                    <Button
                      size="sm"
                      variant="primary"
                      color="vattjom"
                      onClick={handleAcknowledgeSelected}
                      loading={isAcknowledging}
                      disabled={isAcknowledging}
                      data-cy="acknowledge-selected-notifications"
                      className="absolute right-0 top-1/2 -translate-y-1/2"
                    >
                      Markera som läst ({selectedNotifications.length})
                    </Button>
                  )}
                </div>
                {newNotifications.length > 0 ? (
                  renderNotifications(newNotifications, true)
                ) : (
                  <div className="m-md">Inga nya notifieringar</div>
                )}
              </div>
              <div>
                <Divider.Section>
                  <div className="flex gap-sm items-center">
                    <h2 className="text-h4-sm">Tidigare</h2>
                  </div>
                </Divider.Section>

                {acknowledgedNotifications.length > 0 ? (
                  renderNotifications(acknowledgedNotifications, false)
                ) : (
                  <div className="m-md">Inga notifieringar</div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
