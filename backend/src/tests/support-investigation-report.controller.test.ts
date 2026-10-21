import { Response } from 'express';
import FormData from 'form-data';

import { createSupportInvestigationProfile } from '@/config/support-investigation-profile';
import { SupportInvestigationReportController } from '@/controllers/supportmanagement/support-investigation-report.controller';
import { HttpException } from '@/exceptions/HttpException';
import ApiService from '@/services/api.service';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { SupportJsonParameterService, type WriteJsonParameterRequest } from '@/services/support-json-parameter.service';

import { mockReq, mockRes, MockResponse } from './helpers/http';
import { mockMunicipalityId, mockSupportErrandId } from './helpers/mock-data';
import { mockErrandAccess } from './helpers/support-errand-access';

const OPERATION_ID = 'f0000000-0000-4000-8000-000000000001';
const KEY = 'utredning-hsl';
const profile = createSupportInvestigationProfile({
  documents: [{ key: KEY, schemaName: KEY, tabLabel: 'Händelseanalys HSL', ownerLabel: 'MAS/MAR' }],
});
const schema = {
  id: '2281_utredning-hsl_1.2',
  name: KEY,
  version: '1.2',
  value: {
    title: 'Utredning HSL',
    type: 'object',
    'x-draken-completion': { field: 'completed', reportsField: 'reports' },
    properties: {
      assignment: { title: 'Uppdrag', type: 'string' },
      completed: { title: 'Klar', type: 'string' },
      reports: { title: 'Rapporter', type: 'array', 'x-draken-server-owned': true },
    },
  },
};
const uiSchema = { 'ui:sections': [{ id: 'a', title: 'Uppdrag', fields: ['assignment', 'completed', 'reports'] }] };
const storedDocument = (value: Record<string, unknown>) => ({
  document: { key: KEY, schemaId: schema.id, value, version: 3 },
  etag: '"3"',
  status: 200,
});

const makeController = (value: Record<string, unknown>, state: 'active' | 'unavailable' = 'active') => {
  let current = storedDocument(value);
  const documentService = {
    readJsonParameter: vi.fn().mockImplementation(async () => current),
    readBoundSchema: vi.fn().mockResolvedValue(schema),
    readUiSchema: vi.fn().mockResolvedValue(uiSchema),
    readParentErrandSnapshot: vi.fn().mockResolvedValue({ errandNumber: 'IAF-2026-0001', title: 'Avvikelse', labels: [] }),
    writeJsonParameter: vi.fn().mockImplementation(async (request: WriteJsonParameterRequest) => {
      if (request.preconditions.ifMatch !== current.etag) throw new HttpException(412, 'Document changed');
      const version = current.document.version + 1;
      current = {
        document: { ...current.document, value: { ...request.data.value, ...request.internal?.serverOwnedOverrides }, version },
        etag: `"${version}"`,
        status: 200,
      };
      return current;
    }),
  };
  const policyService = { getState: vi.fn(async () => state) };
  const accessApi = new ApiService();
  vi.spyOn(accessApi, 'get').mockResolvedValue({ status: 200, message: 'success', data: mockErrandAccess() });
  const apiService = {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockImplementation(async config => {
      if (String(config.url).includes('/render/direct/pdf')) return { status: 200, message: 'success', data: { output: 'UERG' } };
      return { status: 201, message: 'success', data: { id: 'attachment-1', fileName: 'x' }, headers: {} };
    }),
  };
  const restart = () =>
    new SupportInvestigationReportController({
      investigationProfile: profile,
      documentService: documentService as unknown as SupportJsonParameterService,
      policyService: policyService as unknown as SupportInvestigationPolicyService,
      accessService: new SupportInvestigationAccessService({ apiService: accessApi }),
      apiService,
      namespace: 'NS',
      supportManagementService: 'supportmanagement/1.0',
      templatingService: 'templating/2.0',
      clock: () => new Date('2026-09-11T12:30:00.000Z'),
    });
  return { controller: restart(), restart, documentService, apiService };
};

const resDouble = () => mockRes() as unknown as MockResponse & Response;

describe('SupportInvestigationReportController', () => {
  it('renders, attaches and records the next numbered report for a completed document', async () => {
    const { controller, documentService, apiService } = makeController({
      assignment: 'Klart',
      completed: 'yes',
      reports: [{ generatedAt: '2026-09-10T10:00:00.000Z', generatedBy: 'earlier', fileName: 'Utredning HSL_1.pdf' }],
    });
    const res = resDouble();

    await controller.createReport(mockReq(), mockSupportErrandId, KEY, { operationId: OPERATION_ID }, res);

    expect(apiService.post).toHaveBeenCalledTimes(2);
    const [renderCall, attachCall] = apiService.post.mock.calls.map(([config]) => config);
    expect(renderCall.url).toBe(`templating/2.0/${mockMunicipalityId}/render/direct/pdf`);
    expect(renderCall.propagateClientError).toBe(true);
    expect(renderCall.data.parameters.report).toMatchObject({
      title: 'Utredning HSL',
      sequence: 2,
      generatedAt: '2026-09-11 12:30',
      errand: { errandNumber: 'IAF-2026-0001' },
      sections: [{ title: 'Uppdrag', fields: [{ label: 'Uppdrag', kind: 'text', text: 'Klart' }] }],
    });
    expect(Buffer.from(renderCall.data.content, 'base64').toString('utf8')).toContain('{{ report.title }}');
    expect(attachCall.url).toBe(`supportmanagement/1.0/${mockMunicipalityId}/NS/errands/${mockSupportErrandId}/attachments`);
    expect(attachCall.data).toBeInstanceOf(FormData);
    const multipart = (attachCall.data as FormData).getBuffer().toString('utf8');
    expect(multipart).toContain('name="errandAttachment"; filename="Handelseanalys_HSL_2_f0000000-0000-4000-8000-000000000001.pdf"\r\n');
    expect(multipart).toContain('Content-Type: application/pdf\r\n');

    expect(documentService.writeJsonParameter).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { schemaId: schema.id, value: expect.objectContaining({ completed: 'yes' }) },
        preconditions: { ifMatch: '"4"' },
        internal: {
          allowLocked: true,
          serverOwnedOverrides: {
            reports: [
              { generatedAt: '2026-09-10T10:00:00.000Z', generatedBy: 'earlier', fileName: 'Utredning HSL_1.pdf' },
              {
                generatedAt: '2026-09-11T12:30:00.000Z',
                generatedBy: mockReq().user.username,
                fileName: 'Handelseanalys_HSL_2_f0000000-0000-4000-8000-000000000001.pdf',
                attachmentId: 'attachment-1',
              },
            ],
          },
          // The report list is bookkeeping; the attachment is what subscribers hear about.
          notifySubscribers: false,
        },
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.setHeader).toHaveBeenCalledWith('ETag', '"5"');
    // The publication moves the errand's version but no fact an errand-level command depends on: the page follows none of it.
    expect(res.setHeader).not.toHaveBeenCalledWith('X-Errand-Version', expect.anything());
    expect(res.setHeader).not.toHaveBeenCalledWith('X-Errand-Writes', expect.anything());
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          report: expect.objectContaining({ fileName: 'Handelseanalys_HSL_2_f0000000-0000-4000-8000-000000000001.pdf' }),
        }),
      }),
    );
  });

  it('previews by rendering only, without attaching or recording anything', async () => {
    const { controller, documentService, apiService } = makeController({ completed: 'yes' });
    const res = resDouble();

    await controller.createReport(mockReq(), mockSupportErrandId, KEY, { preview: true }, res);

    expect(apiService.post).toHaveBeenCalledTimes(1);
    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ data: { fileName: 'Handelseanalys_HSL_1.pdf', pdfBase64: 'UERG' } }));
  });

  it('previews a draft in place of the stored document, even one that was never saved', async () => {
    const { controller, documentService, apiService } = makeController({ completed: 'no', assignment: 'Stored' });
    documentService.readJsonParameter.mockRejectedValueOnce({ status: 404, message: 'Not found' });
    const res = resDouble();

    await controller.createReport(
      mockReq(),
      mockSupportErrandId,
      KEY,
      { preview: true, schemaId: schema.id, value: { assignment: 'Draft', completed: 'no' } },
      res,
    );

    expect(apiService.post).toHaveBeenCalledTimes(1);
    const [renderCall] = apiService.post.mock.calls.map(([config]) => config);
    expect(renderCall.data.parameters.report).toMatchObject({
      sequence: 1,
      sections: [{ title: 'Uppdrag', fields: [{ label: 'Uppdrag', kind: 'text', text: 'Draft' }] }],
    });
    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('makes a real report from the stored document only, whatever draft the client sends', async () => {
    const { controller, apiService } = makeController({ completed: 'yes', assignment: 'Stored' });

    await controller.createReport(
      mockReq(),
      mockSupportErrandId,
      KEY,
      { operationId: OPERATION_ID, schemaId: schema.id, value: { assignment: 'Draft', completed: 'yes' } },
      resDouble(),
    );

    const [renderCall] = apiService.post.mock.calls.map(([config]) => config);
    expect(renderCall.data.parameters.report.sections[0].fields[0]).toEqual({ label: 'Uppdrag', kind: 'text', text: 'Stored' });
  });

  it('refuses a report for a document that is not marked completed', async () => {
    const { controller, documentService, apiService } = makeController({ completed: 'no' });

    await expect(controller.createReport(mockReq(), mockSupportErrandId, KEY, { operationId: OPERATION_ID }, resDouble())).rejects.toMatchObject({
      status: 409,
      message: 'Mark the investigation as completed before generating a report',
    });
    expect(apiService.post).not.toHaveBeenCalled();
    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
  });

  it.each([true, false])('reports a Templating subscription denial without writing anything (preview: %s)', async preview => {
    const { controller, documentService, apiService } = makeController({ completed: 'yes' });
    apiService.post.mockRejectedValueOnce(new HttpException(403, 'API Subscription validation failed.'));

    await expect(
      controller.createReport(mockReq(), mockSupportErrandId, KEY, { preview, operationId: OPERATION_ID }, resDouble()),
    ).rejects.toMatchObject({
      status: 502,
      message: 'Rapporttjänsten nekade applikationens åtkomst. Kontakta support.',
    });
    expect(apiService.post).toHaveBeenCalledTimes(1);
    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
  });

  it('refuses an unknown document key and an unavailable investigation policy', async () => {
    await expect(makeController({}).controller.createReport(mockReq(), mockSupportErrandId, 'unknown', {}, resDouble())).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      makeController({ completed: 'yes' }, 'unavailable').controller.createReport(mockReq(), mockSupportErrandId, KEY, {}, resDouble()),
    ).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe('durable report publication', () => {
  const call = (controller: SupportInvestigationReportController, operationId = OPERATION_ID) =>
    controller.createReport(mockReq(), mockSupportErrandId, KEY, { operationId }, resDouble());
  const uploaded = (api: ReturnType<typeof makeController>['apiService']) =>
    api.post.mock.calls.filter(([config]) => config.url.endsWith('/attachments'));

  it('does not upload when the reservation loses a document version conflict', async () => {
    const { controller, documentService, apiService } = makeController({ completed: 'yes' });
    documentService.writeJsonParameter.mockRejectedValueOnce(new HttpException(412, 'Changed'));
    await expect(call(controller)).rejects.toMatchObject({ status: 412 });
    expect(uploaded(apiService)).toHaveLength(0);
  });

  it('reconciles an uploaded PDF after the final document write fails, without uploading again', async () => {
    const { controller, documentService, apiService, restart } = makeController({ completed: 'yes' });
    const write = documentService.writeJsonParameter.getMockImplementation()!;
    documentService.writeJsonParameter.mockImplementationOnce(write).mockRejectedValueOnce(new HttpException(412, 'Changed'));
    await expect(call(controller)).rejects.toMatchObject({ status: 412 });
    const reserved = (await documentService.readJsonParameter()).document.value.reports;
    expect(reserved).toEqual([expect.not.objectContaining({ attachmentId: expect.any(String) })]);
    const fileName = (reserved as { fileName: string }[])[0].fileName;
    apiService.get.mockResolvedValue({ data: [{ id: 'attachment-1', fileName }] });
    await call(restart());
    expect(uploaded(apiService)).toHaveLength(1);
    expect((await documentService.readJsonParameter()).document.value.reports).toEqual([
      expect.objectContaining({ fileName, attachmentId: 'attachment-1' }),
    ]);
  });

  it('reuses a completed publication when the success response was lost', async () => {
    const { controller, apiService, documentService } = makeController({ completed: 'yes' });
    await call(controller);
    const retry = resDouble();
    await controller.createReport(mockReq(), mockSupportErrandId, KEY, { operationId: OPERATION_ID }, retry);
    expect(uploaded(apiService)).toHaveLength(1);
    expect(documentService.writeJsonParameter).toHaveBeenCalledTimes(2);
  });

  it('serializes concurrent publication attempts on the document ETag', async () => {
    const { controller, apiService } = makeController({ completed: 'yes' });
    const results = await Promise.allSettled([call(controller), call(controller, 'f0000000-0000-4000-8000-000000000002')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(uploaded(apiService)).toHaveLength(1);
  });

  it('stops an uncertain upload instead of creating a second copy on retry, including a different request identity', async () => {
    const { controller, apiService } = makeController({ completed: 'yes' });
    const post = apiService.post.getMockImplementation()!;
    apiService.post.mockImplementationOnce(post).mockRejectedValueOnce(new Error('Upload response lost'));
    await expect(call(controller)).rejects.toMatchObject({ status: 503 });
    await expect(call(controller, 'f0000000-0000-4000-8000-000000000002')).rejects.toMatchObject({ status: 409 });
    expect(uploaded(apiService)).toHaveLength(1);
  });

  it('does not upload after an accepted reservation loses its response', async () => {
    const { controller, apiService, documentService } = makeController({ completed: 'yes' });
    const write = documentService.writeJsonParameter.getMockImplementation()!;
    documentService.writeJsonParameter.mockImplementationOnce(async request => {
      await write(request);
      throw new Error('Reservation response lost');
    });
    await expect(call(controller)).rejects.toThrow('Reservation response lost');
    await expect(call(controller)).rejects.toMatchObject({ status: 409 });
    expect(uploaded(apiService)).toHaveLength(0);
  });

  it('recovers the attachment after an upload response is lost', async () => {
    const { controller, apiService, documentService, restart } = makeController({ completed: 'yes' });
    const post = apiService.post.getMockImplementation()!;
    apiService.post.mockImplementationOnce(post).mockRejectedValueOnce(new Error('Upload response lost'));
    await expect(call(controller)).rejects.toMatchObject({ status: 503 });
    const reports = (await documentService.readJsonParameter()).document.value.reports as { fileName: string }[];
    apiService.get.mockResolvedValue({ data: [{ id: 'accepted-attachment', fileName: reports[0].fileName }] });
    await call(restart());
    expect(uploaded(apiService)).toHaveLength(1);
    expect((await documentService.readJsonParameter()).document.value.reports).toEqual([
      expect.objectContaining({ attachmentId: 'accepted-attachment' }),
    ]);
  });

  it('requires a publication identity before rendering or uploading a real report', async () => {
    const { controller, apiService } = makeController({ completed: 'yes' });
    await expect(controller.createReport(mockReq(), mockSupportErrandId, KEY, {}, resDouble())).rejects.toMatchObject({
      status: 400,
    });
    expect(apiService.post).not.toHaveBeenCalled();
  });
});
