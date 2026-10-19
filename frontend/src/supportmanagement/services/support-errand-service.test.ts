import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService } from '@common/services/api-service';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ApiSupportErrand,
  isSupportErrandOpenToHandover,
  mapApiSupportErrandToSupportErrand,
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
// The version of the errand the form was loaded from; every errand write is conditioned on it.
const loadedErrandVersion = 3;
const patchedBody = () => vi.mocked(apiService.patch).mock.calls[0][1] as Partial<ApiSupportErrand>;

describe('classification', () => {
  test('fills the form fields from the classification, blanking NONE, and keeps the labels on the errand', () => {
    const errand = mapApiSupportErrandToSupportErrand(
      apiErrand({ classification: { category: 'BOU', type: 'NONE' }, labels: [label('CATEGORY', 'SALARY')] })
    );

    expect(errand).toMatchObject({ category: 'BOU', type: '', subType: '', labels: [label('CATEGORY', 'SALARY')] });
  });

  // The classification is the investigation's to write; Grundinformation never sends it back.
  test('never sends the classification or the labels with the errand', async () => {
    await updateSupportErrand({ id: 'errand-1', category: 'BOU', type: 'OTHER' }, loadedErrandVersion);

    expect(patchedBody().classification).toBeUndefined();
    expect(patchedBody().labels).toBeUndefined();
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
