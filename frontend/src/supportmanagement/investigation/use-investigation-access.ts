'use client';

import { apiService } from '@common/services/api-service';
import { useConfigStore, useSupportStore, useUserStore } from '@stores/index';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { type InvestigationAccessState, parseInvestigationAccess } from './investigation-access';

interface AccessContext {
  readonly municipalityId: string;
  readonly errandId: string | undefined;
  readonly username: string;
  readonly enabled: boolean;
}

interface ScopedAccess {
  readonly context: AccessContext;
  readonly revision: string;
  readonly attempt: number;
  readonly state: InvestigationAccessState;
}

/**
 * One request for the whole errand, shared by the investigation and decision tabs. Responses from
 * an old errand or identity are never rendered: another errand or user invalidates the previous answer
 * immediately. A recheck of the same errand - after a save moved its version, or on returning to the
 * window - keeps the previous answer on screen until the new one arrives, so the documents are not
 * emptied out from under the handler and the page does not jump to the top. The BFF decides every
 * read and write whichever answer is shown. Document components own their drafts independently of this state.
 */
export function useInvestigationAccess(enabled: boolean): {
  readonly access: InvestigationAccessState;
  readonly refresh: () => void;
} {
  const municipalityId = useConfigStore((state) => state.municipalityId);
  const errandId = useSupportStore((state) => state.supportErrand?.id);
  const username = useUserStore((state) => state.user.username);
  const revision = useSupportStore((state) =>
    JSON.stringify([state.supportErrand?.version, state.supportErrand?.labels, state.supportErrand?.classification])
  );
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((current) => current + 1), []);
  // Identity changes on every navigation, including A → B → A, so an old A response cannot
  // briefly restore old grants before the effect starts the new request.
  const context = useMemo(
    () => ({ municipalityId, errandId, username, enabled }),
    [municipalityId, errandId, username, enabled]
  );
  const [result, setResult] = useState<ScopedAccess>();

  useEffect(() => {
    if (!enabled || !municipalityId || !errandId || !username) return;
    let disposed = false;
    const abort = new AbortController();
    const readAccess = async () => {
      try {
        const response = await apiService.get<unknown>(
          `supporterrands/${encodeURIComponent(municipalityId)}/${encodeURIComponent(errandId)}/investigation-access`,
          { timeout: 10_000, signal: abort.signal }
        );
        const access = parseInvestigationAccess(response.data, municipalityId, errandId);
        if (!disposed) setResult({ context, revision, attempt, state: { status: 'ready', access } });
      } catch (error) {
        if (disposed) return;
        const status = axios.isAxiosError(error) && error.response?.status === 403 ? 'denied' : 'error';
        setResult({ context, revision, attempt, state: { status } });
      }
    };
    void readAccess();
    return () => {
      disposed = true;
      abort.abort();
    };
  }, [context, enabled, errandId, municipalityId, username, revision, attempt]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [enabled, refresh]);

  const answersThisErrand = result?.context === context;
  const access: InvestigationAccessState = !enabled
    ? { status: 'disabled' }
    : answersThisErrand && result.revision === revision && result.attempt === attempt
    ? result.state
    : answersThisErrand && result.state.status === 'ready'
    ? result.state
    : { status: 'loading' };
  return { access, refresh };
}
