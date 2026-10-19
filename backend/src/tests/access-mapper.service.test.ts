import { AccessAccessLevelEnum, type AccessUser } from '@/data-contracts/access-mapper/data-contracts';
import { AccessMapperService } from '@/services/access-mapper.service';

import { mockUser } from './helpers/http';
import { mockAdUsername, mockMunicipalityId, mockSupportNamespace } from './helpers/mock-data';

const configUrl = `${mockMunicipalityId}/${mockSupportNamespace}/access-config/user`;
const accessUser: AccessUser = {
  userId: mockAdUsername,
  origin: 'MANUAL',
  accessByType: [{ type: 'label', access: [{ pattern: 'LOCATION/NORTH/HOME/**', accessLevel: AccessAccessLevelEnum.RW }] }],
};

const makeService = () => {
  const service = new AccessMapperService();
  const stubs = {
    get: vi.fn(async () => ({ data: [{ ...accessUser, id: 'entry-1' }], message: 'success' })),
    post: vi.fn(async () => ({ data: undefined, message: 'success' })),
    put: vi.fn(async () => ({ data: undefined, message: 'success' })),
    delete: vi.fn(async () => ({ data: undefined, message: 'success' })),
  };
  (service as unknown as Record<string, unknown>).apiService = stubs;
  return { service, stubs };
};

describe("AccessMapperService, a person's own access configuration", () => {
  it('lists every person in the namespace, unfiltered', async () => {
    const { service, stubs } = makeService();

    const accessUsers = await service.listAccessUsers(mockUser(), mockMunicipalityId, mockSupportNamespace);

    expect(accessUsers).toEqual([{ ...accessUser, id: 'entry-1' }]);
    const [config] = stubs.get.mock.calls[0] as unknown as [{ url: string; params?: unknown }];
    expect(config.url).toBe(configUrl);
    expect(config.params).toBeUndefined();
  });

  it('answers an empty list when AccessMapper sends no body', async () => {
    const { service, stubs } = makeService();
    stubs.get.mockResolvedValueOnce({ data: undefined as never, message: 'success' });

    await expect(service.listAccessUsers(mockUser(), mockMunicipalityId, mockSupportNamespace)).resolves.toEqual([]);
  });

  it('creates an entry without reading it back', async () => {
    const { service, stubs } = makeService();

    await service.createAccessUser(mockUser(), mockMunicipalityId, mockSupportNamespace, accessUser);

    expect(stubs.post).toHaveBeenCalledWith(
      expect.objectContaining({ url: configUrl, data: accessUser, propagateClientError: true, followLocation: false }),
      expect.anything(),
    );
  });

  it('replaces and removes an entry by its id', async () => {
    const { service, stubs } = makeService();

    await service.updateAccessUser(mockUser(), mockMunicipalityId, mockSupportNamespace, 'entry/1', accessUser);
    await service.deleteAccessUser(mockUser(), mockMunicipalityId, mockSupportNamespace, 'entry/1');

    expect(stubs.put).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${configUrl}/entry%2F1`, data: accessUser, propagateClientError: true }),
      expect.anything(),
    );
    expect(stubs.delete).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${configUrl}/entry%2F1`, propagateClientError: true }),
      expect.anything(),
    );
  });
});
