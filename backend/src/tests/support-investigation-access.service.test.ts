import { HttpException } from '@/exceptions/HttpException';
import ApiService from '@/services/api.service';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';

import { mockUser } from './helpers/http';
import { mockErrandAccess } from './helpers/support-errand-access';

const documentKeys = ['utredning-hsl', 'utredning-sol-lss', 'beslut-sol-lss'];
const setup = (data: unknown = mockErrandAccess()) => {
  const api = new ApiService();
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data, status: 200, message: 'success' });
  const service = new SupportInvestigationAccessService({ apiService: api, namespace: 'IAF', service: 'supportmanagement-sprint/16.0' });
  const read = () => service.getDocumentAccess(mockUser(), '2281', 'errand-1', documentKeys);
  return { get, service, read };
};

afterEach(() => vi.restoreAllMocks());

describe('SupportInvestigationAccessService', () => {
  it("answers the user's level on the errand itself, LR for an errand they only know of", async () => {
    const { service, get } = setup({ level: 'LR', fields: [{ field: 'id', level: 'R' }], resources: [] });

    await expect(service.getErrandLevel(mockUser(), '2281', 'errand-1')).resolves.toBe('LR');
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ url: 'supportmanagement-sprint/16.0/2281/IAF/errands/errand-1/access' }), mockUser());
  });

  it('fails closed on an errand level it does not know', async () => {
    const { service } = setup({ level: 'NONE', fields: [], resources: [] });

    await expect(service.getErrandLevel(mockUser(), '2281', 'errand-1')).rejects.toMatchObject({ status: 502 });
  });

  it('uses the current identity and errand and grants creation for allKeys even when documents do not exist', async () => {
    const { read, get } = setup();
    await expect(read()).resolves.toEqual({
      municipalityId: '2281',
      errandId: 'errand-1',
      documents: documentKeys.map(key => ({ key, access: 'edit' })),
    });
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'supportmanagement-sprint/16.0/2281/IAF/errands/errand-1/access',
        mapUnauthorizedToForbidden: true,
        timeout: 10_000,
      }),
      mockUser(),
    );
  });

  it('projects mixed key grants and hides an unlisted document, including one that has never been saved', async () => {
    const data = mockErrandAccess();
    data.fields = [
      {
        field: 'jsonParameters',
        allKeys: false,
        keys: [
          { key: 'utredning-hsl', level: 'RW' },
          { key: 'utredning-sol-lss', level: 'R' },
        ],
      },
    ];
    const { read } = setup(data);
    expect((await read()).documents.map(document => document.access)).toEqual(['edit', 'read', 'hidden']);
  });

  it.each(['R', 'LR'])("applies the field's level %s to every key when allKeys carries the grant", async level => {
    const { read } = setup({ ...mockErrandAccess(), fields: [{ field: 'jsonParameters', level, allKeys: true, keys: [] }] });
    expect((await read()).documents.map(document => document.access)).toEqual(['read', 'read', 'read']);
  });

  // jsonParameters has a write endpoint of its own, so its level may be wider than the errand's: a role may write
  // every investigation document without being allowed to change the errand.
  it.each(['R', 'LR'])('writes every document under errand level %s when the unrestricted field and the resource are RW', async level => {
    const { service, read } = setup({ ...mockErrandAccess(), level });

    await expect(service.assertCanWriteDocument(mockUser(), '2281', 'errand-1', documentKeys[0])).resolves.toBeUndefined();
    expect((await read()).documents.map(document => document.access)).toEqual(['edit', 'edit', 'edit']);
  });

  it('refuses a document write where the unrestricted field is read-only, whatever the errand level', async () => {
    const { service } = setup({ ...mockErrandAccess(), fields: [{ field: 'jsonParameters', level: 'R', allKeys: true, keys: [] }] });

    await expect(service.assertCanWriteDocument(mockUser(), '2281', 'errand-1', documentKeys[0])).rejects.toMatchObject({ status: 403 });
  });

  it('treats the field subset under errand level LR as the documents that exist for the user', async () => {
    const { read } = setup({
      ...mockErrandAccess(),
      level: 'LR',
      fields: [
        {
          field: 'jsonParameters',
          allKeys: false,
          keys: [
            { key: 'utredning-hsl', level: 'R' },
            { key: 'beslut-sol-lss', level: 'RW' },
          ],
        },
      ],
    });
    // LR narrows which documents are listed, it does not weaken reading of a listed one.
    expect((await read()).documents.map(document => document.access)).toEqual(['read', 'hidden', 'edit']);
  });

  it.each(['R', 'LR'])('writes an explicitly granted key under errand level %s', async level => {
    const { service, read } = setup({
      ...mockErrandAccess(),
      level,
      fields: [{ field: 'jsonParameters', allKeys: false, keys: [{ key: documentKeys[0], level: 'RW' }] }],
    });
    await expect(service.assertCanWriteDocument(mockUser(), '2281', 'one', documentKeys[0])).resolves.toBeUndefined();
    // The refinement reaches only its own key; the rest of the errand stays as the errand level says.
    expect((await read()).documents.map(document => document.access)).toEqual(['edit', 'hidden', 'hidden']);
  });

  it.each(['R', 'LR'])('never writes through the document resource at level %s', async level => {
    const { read } = setup({ ...mockErrandAccess(), resources: [{ resource: 'errand/json-parameter', level }] });
    expect((await read()).documents[0].access).toBe('read');
  });

  it.each([
    { ...mockErrandAccess(), fields: [] },
    { ...mockErrandAccess(), resources: [] },
    { ...mockErrandAccess(), fields: [{ field: 'jsonParameters', allKeys: false, keys: [] }] },
    { ...mockErrandAccess(), fields: [{ field: 'parameters', allKeys: true, keys: [] }] },
  ])('does not infer JSON document access from missing or unrelated grants', async data => {
    expect((await setup(data).read()).documents.every(document => document.access === 'hidden')).toBe(true);
  });

  it.each([
    null,
    {},
    { level: 'RW' },
    { ...mockErrandAccess(), level: 'ADMIN' },
    { ...mockErrandAccess(), resources: [{ resource: 'errand/json-parameter' }] },
    { ...mockErrandAccess(), fields: [{ field: 'jsonParameters', keys: [] }] },
    // Every key follows the level of an unrestricted field, so it has to have one.
    { ...mockErrandAccess(), fields: [{ field: 'jsonParameters', allKeys: true, keys: [] }] },
    { ...mockErrandAccess(), fields: [{ field: 'jsonParameters', level: 'ADMIN', allKeys: true, keys: [] }] },
    { ...mockErrandAccess(), fields: [{ field: 'jsonParameters', allKeys: true, keys: [{ key: 'x', level: 'RW' }] }] },
    { ...mockErrandAccess(), fields: [{ field: 'jsonParameters', allKeys: false, keys: [{ key: 'x', level: 'ADMIN' }] }] },
    { ...mockErrandAccess(), fields: [...mockErrandAccess().fields, ...mockErrandAccess().fields] },
    { ...mockErrandAccess(), resources: [...mockErrandAccess().resources, ...mockErrandAccess().resources] },
    {
      ...mockErrandAccess(),
      fields: [
        {
          field: 'jsonParameters',
          allKeys: false,
          keys: [
            { key: 'x', level: 'R' },
            { key: 'x', level: 'RW' },
          ],
        },
      ],
    },
  ])('fails closed for invalid or ambiguous responses (%j)', async data => {
    await expect(setup(data).read()).rejects.toMatchObject({ status: 502 });
  });

  it('accepts additional fields without interpreting them as document grants', async () => {
    const data = { ...mockErrandAccess(), fields: [...mockErrandAccess().fields, { field: 'futureField' }] };
    expect((await setup(data).read()).documents[0].access).toBe('edit');
  });

  it('rechecks a revoked grant instead of caching an earlier write decision', async () => {
    const { service, get } = setup();
    await expect(service.assertCanWriteDocument(mockUser(), '2281', 'one', documentKeys[0])).resolves.toBeUndefined();
    get.mockResolvedValue({ data: { ...mockErrandAccess(), fields: [] }, status: 200, message: 'success' });
    await expect(service.assertCanWriteDocument(mockUser(), '2281', 'one', documentKeys[0])).rejects.toMatchObject({ status: 403 });
    await expect(service.assertCanReadDocument(mockUser(), '2281', 'two', documentKeys[0])).rejects.toMatchObject({ status: 403 });
    expect(get.mock.calls[2][0].url).toContain('/errands/two/access');
  });

  it.each([403, 404, 500])('handles upstream status %s without falling back to env grants', async status => {
    const { read, get } = setup();
    get.mockRejectedValue(new HttpException(status, 'upstream'));
    await expect(read()).rejects.toMatchObject({ status: status === 500 ? 503 : status });
  });

  it('fails closed on a timeout or an unexpected successful status', async () => {
    const { read, get } = setup();
    get.mockRejectedValueOnce(new Error('timeout'));
    await expect(read()).rejects.toMatchObject({ status: 503 });
    get.mockResolvedValueOnce({ data: mockErrandAccess(), status: 204, message: 'success' });
    await expect(read()).rejects.toMatchObject({ status: 502 });
  });
});
