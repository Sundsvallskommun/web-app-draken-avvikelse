import { SupportMetadataController } from '@/controllers/supportmanagement/support-metadata.controller';
import type ApiService from '@/services/api.service';
import { SUPPORT_METADATA_TTL_MS, supportMetadataCache } from '@/services/support-metadata-cache';

import { mockReq, mockRes, mockUser } from './helpers/http';
import { mockMunicipalityId, mockSupportNamespace } from './helpers/mock-data';

const metadataPath = `supportmanagement-sprint/17.1/${mockMunicipalityId}/${mockSupportNamespace}/metadata`;

/** Answers the metadata with a running number, so a test can tell a kept answer from a new one. */
const metadataApi = () => {
  let answered = 0;
  const get = vi.fn(async () => {
    answered += 1;
    return { data: { statuses: [{ name: 'NEW' }], answer: answered }, message: 'success' };
  });
  return { get } as unknown as Pick<ApiService, 'get'> & { get: typeof get };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('supportMetadataCache', () => {
  it('keeps a namespace’s metadata for an hour, and asks Support Management again after it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T08:00:00Z'));
    const api = metadataApi();
    const read = () => supportMetadataCache.read<{ answer: number }>(api, { url: metadataPath }, mockUser());

    await expect(read()).resolves.toMatchObject({ data: { answer: 1 } });
    vi.advanceTimersByTime(SUPPORT_METADATA_TTL_MS - 1);
    await expect(read()).resolves.toMatchObject({ data: { answer: 1 } });
    vi.advanceTimersByTime(1);
    await expect(read()).resolves.toMatchObject({ data: { answer: 2 } });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('shares one entry between a service base URL with a path below it and the whole path', async () => {
    const api = metadataApi();

    await supportMetadataCache.read(api, { url: metadataPath }, mockUser());
    await supportMetadataCache.read(
      api,
      { url: `${mockMunicipalityId}/${mockSupportNamespace}/metadata`, baseURL: 'https://api.test.local/supportmanagement-sprint/17.1/' },
      mockUser(),
    );

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('keeps every namespace and every part of the metadata apart', async () => {
    const api = metadataApi();

    await supportMetadataCache.read(api, { url: metadataPath }, mockUser());
    await supportMetadataCache.read(api, { url: `${metadataPath}/labels` }, mockUser());
    await supportMetadataCache.read(api, { url: metadataPath.replace(mockSupportNamespace, 'OTHERNAMESPACE') }, mockUser());

    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('serves every user from the same answer, since metadata is the namespace’s and nobody’s own', async () => {
    const api = metadataApi();

    await supportMetadataCache.read(api, { url: metadataPath }, mockUser({ username: 'first' }));
    await supportMetadataCache.read(api, { url: metadataPath }, mockUser({ username: 'second' }));

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('keeps no failed read, so the next request asks again', async () => {
    const failure = new Error('Support Management is unavailable');
    const api = metadataApi();
    api.get.mockRejectedValueOnce(failure);

    await expect(supportMetadataCache.read(api, { url: metadataPath }, mockUser())).rejects.toBe(failure);
    await expect(supportMetadataCache.read(api, { url: metadataPath }, mockUser())).resolves.toMatchObject({ data: { answer: 1 } });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('lets concurrent reads share one request', async () => {
    const api = metadataApi();

    await Promise.all([1, 2, 3].map(() => supportMetadataCache.read(api, { url: metadataPath }, mockUser())));

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('gives every caller a copy of its own, so a change one makes never reaches the next', async () => {
    const api = metadataApi();

    const first = await supportMetadataCache.read<{ statuses: { name: string }[] }>(api, { url: metadataPath }, mockUser());
    first.data.statuses.push({ name: 'ADDED BY A CALLER' });
    const second = await supportMetadataCache.read<{ statuses: { name: string }[] }>(api, { url: metadataPath }, mockUser());

    expect(second.data.statuses).toEqual([{ name: 'NEW' }]);
  });
});

describe('GET /supportmetadata/:municipalityId', () => {
  it('answers the overview from the kept metadata instead of asking Support Management for every page', async () => {
    const api = metadataApi();
    const controller = new SupportMetadataController();
    (controller as unknown as { apiService: typeof api }).apiService = api;

    for (let request = 0; request < 3; request += 1) {
      const res = mockRes();
      await controller.fetchSupportMetadata(mockReq(), mockMunicipalityId, res);
      expect(res.body).toMatchObject({ statuses: [{ name: 'NEW' }] });
    }

    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
