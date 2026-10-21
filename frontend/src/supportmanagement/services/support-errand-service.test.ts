import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService } from '@common/services/api-service';
import { Priority } from '@supportmanagement/interfaces/priority';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ApiSupportErrand,
  isSupportErrandOpenToHandover,
  mapApiSupportErrandToSupportErrand,
  setSupportErrandAdmin,
  Status,
  SupportErrand,
  updateSupportErrand,
} from './support-errand-service';

vi.mock('@common/services/api-service', () => ({
  apiService: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  withRequestGroup: <T>(action: () => Promise<T>) => action(),
}));
vi.mock('@sk-web-gui/react', () => ({ useSnackbar: vi.fn() }));
vi.mock('@stores/index', () => ({ useConfigStore: vi.fn(), useSupportStore: vi.fn() }));
vi.mock('@stores/ui-settings-store', () => ({ useUiSettingsStore: vi.fn() }));
vi.mock('./support-message-service', () => ({ sendMessage: vi.fn() }));
vi.mock('./support-attachment-service', () => ({ saveSupportAttachments: vi.fn() }));

const supportErrand = {
  id: 'errand-1',
  errandNumber: 'VOF-1',
  assignedUserId: 'handler',
  stakeholders: [],
} as unknown as SupportErrand;

beforeEach(() => {
  vi.mocked(apiService.get).mockReset();
  vi.mocked(apiService.post).mockReset();
  vi.mocked(apiService.patch)
    .mockReset()
    .mockResolvedValue({ data: {} } as never);
});

const label = (classification: string, resourcePath: string, labels?: Label[]): Label => ({
  classification,
  resourcePath,
  resourceName: resourcePath,
  displayName: resourcePath,
  ...(labels && { labels }),
});
const apiErrand = (overrides: Partial<ApiSupportErrand>): ApiSupportErrand =>
  ({ id: 'errand-1', stakeholders: [], ...overrides } as ApiSupportErrand);
// The errand as the handler saw it: the facts the BFF handed out with it, and the status it shows. Every errand-level
// command sends the facts back, and the BFF checks the ones it depends on against the errand as it is now.
const seenFacts = { title: 'title-fingerprint', status: 'status-fingerprint', assignedUserId: 'assignee-fingerprint' };
const seenErrand = { facts: seenFacts, status: Status.ONGOING };
const patchedBody = () => vi.mocked(apiService.patch).mock.calls[0][1] as Record<string, unknown>;

describe('classification', () => {
  test('fills the form fields from the classification, blanking NONE, and keeps the labels on the errand', () => {
    const errand = mapApiSupportErrandToSupportErrand(
      apiErrand({ classification: { category: 'BOU', type: 'NONE' }, labels: [label('CATEGORY', 'SALARY')] })
    );

    expect(errand).toMatchObject({ category: 'BOU', type: '', subType: '', labels: [label('CATEGORY', 'SALARY')] });
  });

  // The classification is the investigation's to write; Grundinformation never sends it back.
  test('never sends the classification or the labels with the errand', async () => {
    await updateSupportErrand(
      { id: 'errand-1', title: 'Titel', category: 'BOU', type: 'OTHER' },
      seenErrand,
      undefined,
      { title: true }
    );

    expect(patchedBody().classification).toBeUndefined();
    expect(patchedBody().labels).toBeUndefined();
  });
});

// Only what changed is written: a PATCH of fields nobody touched is still an update to Support Management, logged and
// told to whoever follows the errand as one.
describe('updateSupportErrand', () => {
  test('writes the errand when one of its own fields changed', async () => {
    const result = await updateSupportErrand({ id: 'errand-1', title: 'Ny titel' }, seenErrand, undefined, {
      title: true,
    });

    expect(apiService.patch).toHaveBeenCalledOnce();
    expect(result.wrote).toBe(true);
  });

  // The BFF checks each field written against what the handler saw of it, so a field the draft left alone is never
  // sent: somebody else may have changed it meanwhile, and that is no reason to stop this save or to write over it.
  test('writes only the fields the draft changed, with what the handler saw of the errand', async () => {
    await updateSupportErrand(
      {
        id: 'errand-1',
        title: 'Ny titel',
        description: 'Beskrivning',
        priority: Priority.HIGH,
        businessRelated: false,
      },
      seenErrand,
      undefined,
      { title: true }
    );

    expect(patchedBody()).toEqual({ title: 'Ny titel', seenFacts });
    expect(vi.mocked(apiService.patch).mock.calls[0][2]).toBeUndefined();
  });

  test('refuses to write an errand loaded without its facts', async () => {
    await expect(
      updateSupportErrand({ id: 'errand-1', title: 'Ny titel' }, { status: Status.ONGOING }, undefined, { title: true })
    ).rejects.toThrow('facts');
    expect(apiService.patch).not.toHaveBeenCalled();
  });

  test('writes nothing of the errand when only fields it does not carry changed', async () => {
    const result = await updateSupportErrand(
      { id: 'errand-1', title: 'Titel', category: 'BOU' },
      seenErrand,
      undefined,
      { admin: true, category: true, contacts: [{}] }
    );

    expect(apiService.patch).not.toHaveBeenCalled();
    expect(result.wrote).toBe(false);
  });
});

describe('isSupportErrandOpenToHandover', () => {
  const errandIn = (status: Status, limitedAccess = false) =>
    ({ ...supportErrand, status, limitedAccess } as SupportErrand);

  test('hands on an errand that only waits to be resumed, as well as one being handled', () => {
    expect(isSupportErrandOpenToHandover(errandIn(Status.ASSIGNED))).toBe(true);
    expect(isSupportErrandOpenToHandover(errandIn(Status.ONGOING))).toBe(true);
  });

  test('never hands on a closed, parked or reopened errand, or one read only in part', () => {
    expect(isSupportErrandOpenToHandover(errandIn(Status.SOLVED))).toBe(false);
    expect(isSupportErrandOpenToHandover(errandIn(Status.SUSPENDED))).toBe(false);
    expect(isSupportErrandOpenToHandover(errandIn(Status.REOPENED))).toBe(false);
    expect(isSupportErrandOpenToHandover(errandIn(Status.ASSIGNED, true))).toBe(false);
  });
});

describe('setSupportErrandAdmin', () => {
  const statusWrites = () =>
    vi.mocked(apiService.patch).mock.calls.filter(([url]) => String(url).endsWith('/status')).length;

  // The assignment moves neither the status nor the phase, so both writes start from the errand as the handler saw it,
  // and nothing is read between them.
  test('moves the errand to the status the assignment leaves it in, from the errand as the handler saw it', async () => {
    await setSupportErrandAdmin('errand-1', 'lex.utredare', seenErrand, Status.ASSIGNED);

    expect(vi.mocked(apiService.patch).mock.calls.map(([url, body]) => [url, body])).toEqual([
      ['supporterrands/errand-1/admin', { assignedUserId: 'lex.utredare', seenFacts }],
      ['supporterrands/errand-1/status', { seenFacts, status: Status.ASSIGNED }],
    ]);
    expect(apiService.get).not.toHaveBeenCalled();
  });

  // Only what changed is written: an errand already in that status has no status to change.
  test('writes no status for an errand already in the status the assignment leaves it in', async () => {
    await setSupportErrandAdmin(
      'errand-1',
      'lex.utredare',
      { ...seenErrand, status: Status.ASSIGNED },
      Status.ASSIGNED
    );

    expect(apiService.patch).toHaveBeenCalledOnce();
    expect(statusWrites()).toBe(0);
  });
});
