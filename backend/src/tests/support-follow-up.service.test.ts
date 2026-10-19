import { resolveIafVofInvestigationClassificationPolicy } from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE } from '@/config/support-investigation-profile';
import { SupportFollowUpService, unitFollowUpFilter } from '@/services/support-follow-up.service';
import type { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';

import { mockUser } from './helpers/http';
import { mockMunicipalityId } from './helpers/mock-data';

const period = { from: '2025-10-05', to: '2026-10-05' };

const page = (ids: string[], last: boolean) => ({
  data: { content: ids.map(id => ({ id, errandNumber: `VOF-${id}`, labels: [], measures: [] })), last },
});

const setup = ({ state = 'active', withPolicy = true }: { state?: 'active' | 'unavailable'; withPolicy?: boolean } = {}) => {
  const api = { get: vi.fn() };
  const policyService = {
    iafVofClassificationPolicy: withPolicy ? resolveIafVofInvestigationClassificationPolicy(AVVIKELSE_INVESTIGATION_PROFILE) : undefined,
    profile: AVVIKELSE_INVESTIGATION_PROFILE,
    getState: vi.fn(async () => state),
  };
  const service = new SupportFollowUpService(api as never, policyService as unknown as SupportInvestigationPolicyService);
  return { api, service };
};

const errandCalls = (api: { get: ReturnType<typeof vi.fn> }) =>
  api.get.mock.calls.map(([config]) => config.url as string).filter(url => url.includes('/errands?'));

describe('SupportFollowUpService', () => {
  it('asks for the errands registered in the period, whole days at both ends', () => {
    const filter = unitFollowUpFilter(period);

    expect(filter).toMatch(/^created>'2025-10-05T00:00:00\.000[+-]\d{2}:\d{2}' and created<'2026-10-05T23:59:59\.999[+-]\d{2}:\d{2}'$/);
  });

  it('reads every page of the period and the measure types, keeping an errand seen twice once', async () => {
    const { api, service } = setup();
    api.get
      .mockResolvedValueOnce(page(['a', 'b'], false))
      .mockResolvedValueOnce(page(['b', 'c'], true))
      .mockResolvedValueOnce({ data: { measureTypes: [{ name: 'TRAINING', displayName: 'Utbildning' }] } });

    const snapshot = await service.read(mockMunicipalityId, period, mockUser());

    expect(snapshot.errands.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(snapshot.measureTypes).toEqual([{ name: 'TRAINING', displayName: 'Utbildning' }]);
    expect(snapshot.truncated).toBe(false);
    const urls = errandCalls(api);
    expect(urls).toHaveLength(2);
    expect(new URL(urls[0], 'http://draken.local').searchParams.get('filter')).toBe(unitFollowUpFilter(period));
    expect(new URL(urls[1], 'http://draken.local').searchParams.get('page')).toBe('1');
  });

  it('stops at its page limit and says the list is incomplete', async () => {
    const { api, service } = setup();
    api.get.mockImplementation(async (config: { url: string }) =>
      config.url.includes('/errands?') ? page([`e${Math.random()}`], false) : { data: { measureTypes: [] } },
    );

    const snapshot = await service.read(mockMunicipalityId, period, mockUser());

    expect(snapshot.truncated).toBe(true);
    expect(errandCalls(api)).toHaveLength(20);
  });

  it('is only offered where the IAF/VOF investigation can be served', async () => {
    await expect(setup({ withPolicy: false }).service.read(mockMunicipalityId, period, mockUser())).rejects.toMatchObject({ status: 409 });
    await expect(setup({ state: 'unavailable' }).service.read(mockMunicipalityId, period, mockUser())).rejects.toMatchObject({ status: 503 });
  });
});
