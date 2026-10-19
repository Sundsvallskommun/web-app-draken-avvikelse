// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { useConfigStore } from '../../stores/config-store';
import { useSupportStore } from '../../stores/support-store';
import { useUserStore } from '../../stores/user-store';
import { useInvestigationAccess } from './use-investigation-access';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@common/services/api-service', () => ({ apiService: { get } }));
vi.mock('@stores/index', async () => ({
  ...(await import('../../stores/config-store')),
  ...(await import('../../stores/support-store')),
  ...(await import('../../stores/user-store')),
}));

const response = (errandId = 'one', grant = 'edit') => ({
  data: {
    municipalityId: '2281',
    errandId,
    documents: [{ key: 'document', access: grant }],
  },
});
const deferred = () => {
  let resolve!: (value: ReturnType<typeof response>) => void;
  const promise = new Promise<ReturnType<typeof response>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const selectErrand = (id: string, version = 1) =>
  useSupportStore.setState({
    supportErrand: { id, version, category: '', type: '', subType: '', customer: [], contacts: [] },
  });

beforeEach(() => {
  get.mockReset().mockResolvedValue(response());
  useConfigStore.setState({ municipalityId: '2281' });
  useUserStore.setState({ user: { ...useUserStore.getState().user, username: 'handler' } });
  selectErrand('one');
});
afterEach(cleanup);

// A save moves the errand's version and the grants are checked again; emptying the page meanwhile would drop the
// handler to its top. The new grants replace the old ones as soon as they arrive.
test('keeps the grants on screen while the same errand is checked again after its version or labels change', async () => {
  const { result } = renderHook(() => useInvestigationAccess(true));
  await waitFor(() => expect(result.current.access.status).toBe('ready'));
  const next = deferred();
  get.mockReturnValueOnce(next.promise);
  act(() => selectErrand('one', 2));
  expect(result.current.access).toMatchObject({
    status: 'ready',
    access: { documents: new Map([['document', 'edit']]) },
  });
  await act(async () => next.resolve(response('one', 'read')));
  expect(result.current.access).toMatchObject({
    status: 'ready',
    access: { documents: new Map([['document', 'read']]) },
  });
  const afterLabels = deferred();
  get.mockReturnValueOnce(afterLabels.promise);
  act(() =>
    useSupportStore.setState((state) => ({
      supportErrand: {
        ...state.supportErrand!,
        labels: [{ id: 'changed', classification: 'CATEGORY', resourceName: 'changed' }],
      },
    }))
  );
  expect(result.current.access).toMatchObject({
    status: 'ready',
    access: { documents: new Map([['document', 'read']]) },
  });
  await act(async () => afterLabels.resolve(response('one', 'hidden')));
  expect(result.current.access).toMatchObject({
    status: 'ready',
    access: { documents: new Map([['document', 'hidden']]) },
  });
});

test('ignores late answers during A to B to A navigation', async () => {
  const first = deferred();
  const second = deferred();
  const third = deferred();
  get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
  const { result } = renderHook(() => useInvestigationAccess(true));
  act(() => selectErrand('two'));
  act(() => selectErrand('one'));
  await act(async () => first.resolve(response()));
  await act(async () => second.resolve(response('two')));
  expect(result.current.access.status).toBe('loading');
  await act(async () => third.resolve(response('one', 'hidden')));
  expect(result.current.access).toMatchObject({
    status: 'ready',
    access: { documents: new Map([['document', 'hidden']]) },
  });
});

test('rechecks on focus and reconnect, and offers recovery after a failed request', async () => {
  const { result } = renderHook(() => useInvestigationAccess(true));
  await waitFor(() => expect(result.current.access.status).toBe('ready'));
  get.mockRejectedValueOnce(new Error('offline'));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.access.status).toBe('error'));
  act(() => window.dispatchEvent(new Event('online')));
  await waitFor(() => expect(result.current.access.status).toBe('ready'));
  get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 403 } });
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.access.status).toBe('denied'));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.access.status).toBe('ready'));
});

test('a late answer cannot restore another identity or disabled access', async () => {
  const old = deferred();
  get.mockReturnValueOnce(old.promise);
  const { result, rerender } = renderHook(({ enabled }) => useInvestigationAccess(enabled), {
    initialProps: { enabled: true },
  });
  act(() => useUserStore.setState({ user: { ...useUserStore.getState().user, username: '' } }));
  await act(async () => old.resolve(response()));
  expect(result.current.access.status).toBe('loading');
  rerender({ enabled: false });
  expect(result.current.access.status).toBe('disabled');
});
