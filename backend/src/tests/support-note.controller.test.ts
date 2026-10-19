import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SupportNoteController } from '@/controllers/supportmanagement/support-note.controller';
import { CreateSupportServiceNoteDto, SUPPORT_NOTE_BODY_MAX_LENGTH } from '@/dtos/support-note.dto';
import { HttpException } from '@/exceptions/HttpException';
import ApiService from '@/services/api.service';

import { mockReq, mockRes, mockUser } from './helpers/http';
import { mockAdUsername, mockMunicipalityId, mockSupportErrandId } from './helpers/mock-data';

const handler = mockUser({ username: mockAdUsername });
const serviceNote = { id: 'note-1', context: 'SERVICE_NOTE', role: 'ERRAND_HANDLER', subject: 'Tjänsteanteckning', body: 'Samtal med anhörig.' };
const comment = { id: 'note-2', context: 'SUPPORT', role: 'FIRST_LINE_SUPPORT', subject: 'Notering', body: 'Intern kommentar.' };

interface Setup {
  errand?: { status: string; assignedUserId?: string };
  note?: object;
}

function setup({ errand = { status: 'ONGOING', assignedUserId: mockAdUsername }, note = comment }: Setup = {}) {
  const controller = new SupportNoteController();
  const api = {
    get: vi.fn(async (config: { url?: string }) => {
      if (config.url?.includes('/notes/')) return { data: note };
      if (config.url?.includes('/notes?')) return { data: { notes: [], _meta: {} } };
      return { data: errand };
    }),
    post: vi.fn(async (config: { data?: unknown }) => ({ data: config.data })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: undefined })),
  };
  (controller as unknown as { apiService: ApiService }).apiService = api as unknown as ApiService;
  return { controller, api };
}

describe('service notes', () => {
  it('lists only the service notes of the errand', async () => {
    const { controller, api } = setup();
    await controller.fetchSupportServiceNotes(mockReq(handler), mockSupportErrandId, mockMunicipalityId, mockRes());
    const query = new URL(`https://api${api.get.mock.calls[0][0].url?.split('/notes')[1]}`).searchParams;
    expect(query.get('context')).toBe('SERVICE_NOTE');
    expect(query.has('role')).toBe(false);
  });

  it('keeps listing comments by the context and role they have always been written with', async () => {
    const { controller, api } = setup();
    await controller.fetchSupportNotes(mockReq(handler), mockSupportErrandId, mockMunicipalityId, mockRes());
    const query = new URL(`https://api${api.get.mock.calls[0][0].url?.split('/notes')[1]}`).searchParams;
    expect(query.get('context')).toBe('SUPPORT');
    expect(query.get('role')).toBe('FIRST_LINE_SUPPORT');
  });

  it('saves a service note written by the errand handler, with kind, subject and author set by Draken', async () => {
    const { controller, api } = setup({ errand: { status: 'ONGOING', assignedUserId: mockAdUsername.toUpperCase() } });
    const response = mockRes();
    await controller.createSupportServiceNote(
      mockReq(handler),
      mockSupportErrandId,
      mockMunicipalityId,
      { body: '  Samtal med anhörig.  ', partyId: 'party-1' },
      response,
    );
    expect(response.statusCode).toBe(201);
    expect(api.post).toHaveBeenCalledOnce();
    expect(api.post.mock.calls[0][0]).toMatchObject({
      url: expect.stringMatching(new RegExp(`/errands/${mockSupportErrandId}/notes$`)),
      data: {
        context: 'SERVICE_NOTE',
        role: 'ERRAND_HANDLER',
        subject: 'Tjänsteanteckning',
        body: 'Samtal med anhörig.',
        partyId: 'party-1',
        createdBy: handler.name,
      },
    });
  });

  it.each([
    ['another handler', { status: 'ONGOING', assignedUserId: 'someone.else' }, 403],
    ['no handler', { status: 'ONGOING', assignedUserId: undefined }, 403],
    ['a solved errand', { status: 'SOLVED', assignedUserId: mockAdUsername }, 409],
  ])('refuses a service note on an errand with %s, without writing', async (_case, errand, status) => {
    const { controller, api } = setup({ errand });
    await expect(
      controller.createSupportServiceNote(mockReq(handler), mockSupportErrandId, mockMunicipalityId, { body: 'Anteckning' }, mockRes()),
    ).rejects.toMatchObject({ status });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('passes a refused errand read on unchanged', async () => {
    const { controller, api } = setup();
    api.get.mockRejectedValueOnce(new HttpException(403, 'Forbidden'));
    await expect(
      controller.createSupportServiceNote(mockReq(handler), mockSupportErrandId, mockMunicipalityId, { body: 'Anteckning' }, mockRes()),
    ).rejects.toMatchObject({ status: 403 });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('never changes or removes a service note', async () => {
    const { controller, api } = setup({ note: serviceNote });
    await expect(
      controller.updateSupportNote(mockReq(handler), mockMunicipalityId, mockSupportErrandId, 'note-1', { body: 'Ändrad' }, mockRes()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(controller.deleteSupportNote(mockReq(handler), mockMunicipalityId, mockSupportErrandId, 'note-1', mockRes())).rejects.toMatchObject({
      status: 403,
    });
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('still lets comments be changed and removed', async () => {
    const { controller, api } = setup({ note: comment });
    await controller.updateSupportNote(mockReq(handler), mockMunicipalityId, mockSupportErrandId, 'note-2', { body: 'Ändrad' }, mockRes());
    await controller.deleteSupportNote(mockReq(handler), mockMunicipalityId, mockSupportErrandId, 'note-2', mockRes());
    expect(api.patch).toHaveBeenCalledOnce();
    expect(api.delete).toHaveBeenCalledOnce();
  });
});

describe('service note contract', () => {
  it.each([
    { body: '' },
    { body: '   ' },
    { body: 'x'.repeat(SUPPORT_NOTE_BODY_MAX_LENGTH + 1) },
    { body: 'Text', context: 'SUPPORT' },
    { body: 'Text', createdBy: 'forged' },
  ])('rejects an empty, oversized or self-attributed service note: %j', async body => {
    const errors = await validate(plainToInstance(CreateSupportServiceNoteDto, body), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a service note with its text and whom it concerns', async () => {
    const errors = await validate(plainToInstance(CreateSupportServiceNoteDto, { body: 'Samtal med anhörig.', partyId: 'party-1' }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors).toEqual([]);
  });
});
