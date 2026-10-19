'use client';

import { fetchNotifications } from '@common/components/notifications/notification-actions';
import { useConfigStore, useSupportStore } from '@stores/index';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect } from 'react';

const POLL_INTERVAL_MS = 60_000;

/**
 * Pull the notification list into the store once.
 *
 * Use this after a mutation that changes what the user should see — acknowledging, opening an errand
 * — so the bell badge updates immediately instead of at the next poll tick. Safe to call from any
 * component: it neither starts nor owns a timer.
 */
export const useRefreshNotifications = (): (() => Promise<void>) => {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const setNotifications = useSupportStore((s) => s.setNotifications);

  return useCallback(async () => {
    if (!municipalityId) return;
    try {
      setNotifications(await fetchNotifications(municipalityId));
    } catch {
      // Fetch failures here are transient by nature; the next poll tick retries. Surfacing a toast on
      // every hiccup would be noisier than the problem.
      console.error('Something went wrong when fetching notifications');
    }
  }, [municipalityId, setNotifications]);
};

/**
 * Keep the notification store fresh on an interval.
 *
 * Notifications used to be fetched only on mount and whenever the panel was toggled, which left the
 * bell badge stale for as long as the user stayed on a page. Polling here means every consumer of
 * the store — badge, panel, errand log — sees the same up to date list.
 *
 * Polling pauses while the tab is hidden and catches up as soon as it becomes visible again. Changing
 * view - opening the overview, say - also refreshes at once rather than waiting for the next tick.
 * Mount this once per app; everything else should use `useRefreshNotifications`.
 */
export const useNotificationPoller = (): { refresh: () => Promise<void> } => {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const refresh = useRefreshNotifications();
  const pathname = usePathname();

  useEffect(() => {
    if (!municipalityId) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer) return;
      timer = setInterval(refresh, POLL_INTERVAL_MS);
    };

    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    void refresh();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // The view is a dependency on purpose: a new view starts a fresh poll that refreshes at once.
  }, [municipalityId, refresh, pathname]);

  return { refresh };
};
