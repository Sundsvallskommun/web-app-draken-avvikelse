import { Response } from 'express';

import { resolveIafVofInvestigationClassificationPolicy } from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE, createSupportInvestigationProfile } from '@/config/support-investigation-profile';
import {
  SupportErrandJsonParameter,
  SupportErrandJsonParameterController,
  UpdateSupportErrandJsonParameterDto,
} from '@/controllers/supportmanagement/support-errand-json-parameter.controller';
import ApiService from '@/services/api.service';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { SupportJsonParameterService } from '@/services/support-json-parameter.service';

import { ABSENT_HEADER, mockReq, mockRes, MockResponse, mockUser } from './helpers/http';
import { MOCK_HSL_INVESTIGATOR_GROUP, MOCK_UNIT_MANAGER_GROUP, mockMunicipalityId, mockSupportErrandId } from './helpers/mock-data';
import { mockErrandAccess } from './helpers/support-errand-access';

interface DocumentServiceStub {
  readJsonParameter: ReturnType<typeof vi.fn>;
  writeJsonParameter: ReturnType<typeof vi.fn>;
  readParentErrandSnapshot: ReturnType<typeof vi.fn>;
}

const makeController = (state: 'active' | 'unavailable' = 'active', documentAccess: 'edit' | 'read' | 'hidden' = 'edit') => {
  const documentService: DocumentServiceStub = {
    readJsonParameter: vi.fn(),
    writeJsonParameter: vi.fn(),
    // An errand that says nothing about itself: an ordinary deviation.
    readParentErrandSnapshot: vi.fn(async () => ({ id: mockSupportErrandId })),
  };
  const profile = AVVIKELSE_INVESTIGATION_PROFILE;
  const policyService = {
    getState: vi.fn(async () => state),
    iafVofClassificationPolicy: resolveIafVofInvestigationClassificationPolicy(profile),
  };
  const accessApi = new ApiService();
  vi.spyOn(accessApi, 'get').mockResolvedValue({
    status: 200,
    message: 'success',
    data: {
      ...mockErrandAccess(),
      fields: documentAccess === 'hidden' ? [] : mockErrandAccess().fields,
      resources: [{ resource: 'errand/json-parameter', level: documentAccess === 'read' ? 'R' : 'RW' }],
    },
  });
  const controller = new SupportErrandJsonParameterController(
    profile,
    documentService as unknown as SupportJsonParameterService,
    policyService as unknown as SupportInvestigationPolicyService,
    new SupportInvestigationAccessService({ apiService: accessApi }),
  );
  return { controller, documentService, policyService };
};

const resDouble = () => mockRes() as unknown as MockResponse & Response;
const UNSUPPORTED_KEY_ERROR = { status: 400, message: 'Unsupported investigation JSON parameter key' };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('SupportErrandJsonParameterController', () => {
  it('reads the profile-selected document and forwards its strong ETag', async () => {
    const parameter: SupportErrandJsonParameter = {
      key: 'utredning-enhetschef',
      schemaId: '2281_utredning-enhetschef_1.0',
      value: { summary: 'Test' },
      version: 3,
    };
    const { controller, documentService } = makeController();
    documentService.readJsonParameter.mockResolvedValue({ document: parameter, etag: '"3"', status: 200 });
    const req = mockReq();
    const res = resDouble();

    await controller.getJsonParameter(req, mockSupportErrandId, parameter.key, res);

    expect(documentService.readJsonParameter).toHaveBeenCalledWith({
      definition: expect.objectContaining({ key: parameter.key, schemaName: 'utredning-enhetschef' }),
      municipalityId: mockMunicipalityId,
      errandId: mockSupportErrandId,
      user: req.user,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers.ETag).toBe('"3"');
    expect(res.body).toEqual(parameter);
  });

  it('fails closed before document reads when the runtime policy is unavailable', async () => {
    const { controller, documentService } = makeController('unavailable');

    await expect(controller.getJsonParameter(mockReq(), mockSupportErrandId, 'utredning-enhetschef', resDouble())).rejects.toMatchObject({
      status: 503,
      message: 'Investigation read policy is temporarily unavailable',
    });

    expect(documentService.readJsonParameter).not.toHaveBeenCalled();
  });

  it('writes through the deep document boundary and returns status, ETag and fresh parent version', async () => {
    const update: UpdateSupportErrandJsonParameterDto = {
      schemaId: '2281_utredning-hsl_1.0',
      value: { assessment: 'Test' },
    };
    const updated: SupportErrandJsonParameter = { key: 'utredning-hsl', ...update, version: 8 };
    const { controller, documentService, policyService } = makeController();
    documentService.writeJsonParameter.mockResolvedValue({
      document: updated,
      etag: '"8"',
      status: 200,
      parentErrandVersion: 13,
    });
    const req = mockReq();
    const res = resDouble();

    await controller.updateJsonParameter(req, mockSupportErrandId, updated.key, '"7"', ABSENT_HEADER, '12', update, res);

    expect(policyService.getState).toHaveBeenCalled();
    expect(documentService.writeJsonParameter).toHaveBeenCalledWith({
      definition: expect.objectContaining({ key: updated.key, schemaName: 'utredning-hsl' }),
      municipalityId: mockMunicipalityId,
      errandId: mockSupportErrandId,
      user: req.user,
      data: update,
      preconditions: { ifMatch: '"7"', ifNoneMatch: undefined, parentErrandVersion: '12' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers.ETag).toBe('"8"');
    expect(res.headers['X-Errand-Version']).toBe('13');
    expect(res.body).toEqual(updated);
  });

  it('preserves create status and forwards the create-only precondition', async () => {
    const update = { schemaId: '2281_utredning-enhetschef_1.0', value: {} };
    const document = { key: 'utredning-enhetschef', ...update, version: 0 };
    const { controller, documentService } = makeController();
    documentService.writeJsonParameter.mockResolvedValue({
      document,
      etag: '"0"',
      status: 201,
      parentErrandVersion: 4,
    });
    const res = resDouble();

    await controller.updateJsonParameter(mockReq(), mockSupportErrandId, document.key, ABSENT_HEADER, '*', '3', update, res);

    expect(documentService.writeJsonParameter.mock.calls[0][0].preconditions).toEqual({
      ifMatch: undefined,
      ifNoneMatch: '*',
      parentErrandVersion: '3',
    });
    expect(res.statusCode).toBe(201);
  });

  it.each([
    ['a reported misconduct', { parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }] }, true],
    ['a deviation', { labels: [{ resourcePath: 'REPORT_TYPE/DEVIATION' }] }, false],
  ])('records on the unit manager investigation that its errand is %s', async (_kind, errand, reportedMisconduct) => {
    const update = { schemaId: '2281_utredning-enhetschef_1.8', value: { reportedMisconduct: !reportedMisconduct } };
    const { controller, documentService } = makeController();
    documentService.readParentErrandSnapshot.mockResolvedValue({ id: mockSupportErrandId, ...errand });
    documentService.writeJsonParameter.mockResolvedValue({
      document: { key: 'utredning-enhetschef', ...update, version: 8 },
      etag: '"8"',
      status: 200,
      parentErrandVersion: 13,
    });

    await controller.updateJsonParameter(mockReq(), mockSupportErrandId, 'utredning-enhetschef', '"7"', ABSENT_HEADER, '12', update, resDouble());

    // The errand answers, whatever the browser sent: the document service writes server-owned values from here.
    expect(documentService.writeJsonParameter.mock.calls[0][0].internal).toEqual({ serverOwnedOverrides: { reportedMisconduct } });
    expect(documentService.readParentErrandSnapshot).toHaveBeenCalledTimes(1);
  });

  it('fails closed before document writes when policy is unavailable', async () => {
    const status = 503;
    const message = 'Investigation write policy is temporarily unavailable';
    const { controller, documentService } = makeController('unavailable');

    await expect(
      controller.updateJsonParameter(
        mockReq(),
        mockSupportErrandId,
        'utredning-enhetschef',
        ABSENT_HEADER,
        '*',
        '10',
        { schemaId: '2281_utredning-enhetschef_1.0', value: {} },
        resDouble(),
      ),
    ).rejects.toMatchObject({ status, message });

    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
  });

  it('refuses both writing and reading a document absent from the errand access', async () => {
    const { controller, documentService } = makeController('active', 'hidden');
    const unitManager = mockReq(mockUser({ groups: [MOCK_UNIT_MANAGER_GROUP] }));

    await expect(
      controller.updateJsonParameter(
        unitManager,
        mockSupportErrandId,
        'utredning-hsl',
        ABSENT_HEADER,
        '*',
        '10',
        { schemaId: '2281_utredning-hsl_1.0', value: {} },
        resDouble(),
      ),
    ).rejects.toMatchObject({ status: 403, message: 'Missing write permissions for this investigation document' });

    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();

    await expect(controller.getJsonParameter(unitManager, mockSupportErrandId, 'utredning-hsl', resDouble())).rejects.toMatchObject({
      status: 403,
      message: 'Missing permissions for this investigation document',
    });

    expect(documentService.readJsonParameter).not.toHaveBeenCalled();
  });

  it('serves a read-only document but refuses its write', async () => {
    const { controller, documentService } = makeController('active', 'read');
    const parameter: SupportErrandJsonParameter = {
      key: 'utredning-hsl',
      schemaId: '2281_utredning-hsl_1.0',
      value: { summary: 'Test' },
      version: 3,
    };
    documentService.readJsonParameter.mockResolvedValue({ document: parameter, etag: '"3"', status: 200 });
    const unitManager = mockReq(mockUser({ groups: [MOCK_UNIT_MANAGER_GROUP] }));

    await controller.getJsonParameter(unitManager, mockSupportErrandId, 'utredning-hsl', resDouble());

    expect(documentService.readJsonParameter).toHaveBeenCalledTimes(1);

    await expect(
      controller.updateJsonParameter(
        unitManager,
        mockSupportErrandId,
        'utredning-hsl',
        '"3"',
        ABSENT_HEADER,
        '10',
        { schemaId: '2281_utredning-hsl_1.0', value: {} },
        resDouble(),
      ),
    ).rejects.toMatchObject({ status: 403, message: 'Missing write permissions for this investigation document' });

    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
  });

  it('lets an upstream-authorized user write without an application edit permission', async () => {
    const { controller, documentService } = makeController('active', 'edit');
    documentService.writeJsonParameter.mockResolvedValue({
      document: { key: 'utredning-hsl', schemaId: '2281_utredning-hsl_1.0', value: {}, version: 2 },
      etag: '"2"',
      status: 200,
      parentErrandVersion: 11,
    });

    await controller.updateJsonParameter(
      mockReq(mockUser({ groups: [MOCK_HSL_INVESTIGATOR_GROUP] })),
      mockSupportErrandId,
      'utredning-hsl',
      ABSENT_HEADER,
      '*',
      '10',
      { schemaId: '2281_utredning-hsl_1.0', value: {} },
      resDouble(),
    );

    expect(documentService.writeJsonParameter).toHaveBeenCalledTimes(1);
  });

  describe('a document declared for reported misconduct only', () => {
    const decisionKey = 'beslut-sol-lss';
    const update = { schemaId: '2281_beslut-sol-lss_1.1', value: { ivoNotification: 'no' } };
    const deviationErrand = { id: mockSupportErrandId, parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }] };
    const savedInvestigation = { key: 'utredning-sol-lss', schemaId: '2281_utredning-sol-lss_1.0', value: {} };
    const misconductErrand = {
      id: mockSupportErrandId,
      parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }],
      jsonParameters: [savedInvestigation],
    };
    const NOT_APPLICABLE_ERROR = { status: 409, message: 'This investigation document applies to reported misconduct errands only' };

    it('is served and written on a reported misconduct errand', async () => {
      const { controller, documentService } = makeController();
      documentService.readParentErrandSnapshot.mockResolvedValue(misconductErrand);
      documentService.readJsonParameter.mockResolvedValue({ document: { key: decisionKey, ...update, version: 1 }, etag: '"1"', status: 200 });
      documentService.writeJsonParameter.mockResolvedValue({
        document: { key: decisionKey, ...update, version: 2 },
        etag: '"2"',
        status: 200,
        parentErrandVersion: 5,
      });
      const req = mockReq();

      await controller.getJsonParameter(req, mockSupportErrandId, decisionKey, resDouble());
      await controller.updateJsonParameter(req, mockSupportErrandId, decisionKey, '"1"', ABSENT_HEADER, '4', update, resDouble());

      // One parent read per call: the prerequisite check reuses the applicability snapshot.
      expect(documentService.readParentErrandSnapshot).toHaveBeenCalledTimes(2);
      expect(documentService.readParentErrandSnapshot).toHaveBeenCalledWith({
        definition: expect.objectContaining({ key: decisionKey, appliesTo: 'reported-misconduct', placement: 'decision' }),
        municipalityId: mockMunicipalityId,
        errandId: mockSupportErrandId,
        user: req.user,
      });
      expect(documentService.readJsonParameter).toHaveBeenCalledTimes(1);
      expect(documentService.writeJsonParameter).toHaveBeenCalledTimes(1);
    });

    it('is refused on an ordinary deviation errand before the document is touched', async () => {
      const { controller, documentService } = makeController();
      documentService.readParentErrandSnapshot.mockResolvedValue(deviationErrand);

      await expect(controller.getJsonParameter(mockReq(), mockSupportErrandId, decisionKey, resDouble())).rejects.toMatchObject(NOT_APPLICABLE_ERROR);
      await expect(
        controller.updateJsonParameter(mockReq(), mockSupportErrandId, decisionKey, ABSENT_HEADER, '*', '4', update, resDouble()),
      ).rejects.toMatchObject(NOT_APPLICABLE_ERROR);

      expect(documentService.readJsonParameter).not.toHaveBeenCalled();
      expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
    });

    it('is read but not written while the SoL/LSS investigation it answers is missing from the errand', async () => {
      const { controller, documentService } = makeController();
      documentService.readParentErrandSnapshot.mockResolvedValue({ ...misconductErrand, jsonParameters: [] });
      documentService.readJsonParameter.mockResolvedValue({ document: { key: decisionKey, ...update, version: 1 }, etag: '"1"', status: 200 });

      await controller.getJsonParameter(mockReq(), mockSupportErrandId, decisionKey, resDouble());
      await expect(
        controller.updateJsonParameter(mockReq(), mockSupportErrandId, decisionKey, ABSENT_HEADER, '*', '4', update, resDouble()),
      ).rejects.toMatchObject({ status: 409, message: 'This investigation document requires utredning-sol-lss to be saved on the errand first' });

      expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
    });

    it('is checked only after document access, so a hidden document reveals nothing about the errand', async () => {
      const { controller, documentService } = makeController('active', 'hidden');

      await expect(
        controller.getJsonParameter(mockReq(mockUser({ groups: [MOCK_UNIT_MANAGER_GROUP] })), mockSupportErrandId, decisionKey, resDouble()),
      ).rejects.toMatchObject({ status: 403 });

      expect(documentService.readParentErrandSnapshot).not.toHaveBeenCalled();
    });

    it('never reads the parent errand for documents that apply to every errand', async () => {
      const { controller, documentService } = makeController();
      documentService.readJsonParameter.mockResolvedValue({
        document: { key: 'utredning-enhetschef', schemaId: '2281_utredning-enhetschef_1.0', value: {}, version: 1 },
        etag: '"1"',
        status: 200,
      });

      await controller.getJsonParameter(mockReq(), mockSupportErrandId, 'utredning-enhetschef', resDouble());

      expect(documentService.readParentErrandSnapshot).not.toHaveBeenCalled();
    });

    it('fails closed when the profile has no classification policy to decide applicability', async () => {
      const profile = createSupportInvestigationProfile({
        documents: [{ key: decisionKey, schemaName: 'beslut-sol-lss', tabLabel: 'Beslut', ownerLabel: 'Owner', appliesTo: 'reported-misconduct' }],
      });
      const documentService = { readJsonParameter: vi.fn(), readParentErrandSnapshot: vi.fn() } as unknown as SupportJsonParameterService;
      const policyService = { getState: vi.fn().mockResolvedValue('active'), iafVofClassificationPolicy: undefined };
      const accessApi = new ApiService();
      vi.spyOn(accessApi, 'get').mockResolvedValue({ status: 200, message: 'success', data: mockErrandAccess() });
      const controller = new SupportErrandJsonParameterController(
        profile,
        documentService,
        policyService as unknown as SupportInvestigationPolicyService,
        new SupportInvestigationAccessService({ apiService: accessApi }),
      );

      await expect(controller.getJsonParameter(mockReq(), mockSupportErrandId, decisionKey, resDouble())).rejects.toMatchObject({
        status: 409,
        message: 'Restricted investigation documents require an investigation classification policy',
      });
      expect(documentService.readParentErrandSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('a document declared for HSL deviations only', () => {
    const decisionKey = 'beslut-hsl';
    const update = { schemaId: '2281_beslut-hsl_1.0', value: { ivoNotification: 'no' } };
    const hslLabel = { classification: 'PROVISION', resourcePath: 'PROVISION/HSL', resourceName: 'HSL' };
    const solLabel = { classification: 'PROVISION', resourcePath: 'PROVISION/SOL', resourceName: 'SOL' };
    const hslDeviation = { id: mockSupportErrandId, parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }], labels: [hslLabel] };
    const solDeviation = { id: mockSupportErrandId, parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }], labels: [solLabel] };
    const hslMisconduct = { id: mockSupportErrandId, parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }], labels: [hslLabel] };
    // What Support Management serves once the unit manager's investigation has assessed a high HSL risk: no legal
    // base was reported, and the errand is marked with the risk.
    const highHslRiskLabel = { classification: 'risk', resourcePath: 'RISK/HIGH_HSL', resourceName: 'HIGH_HSL' };
    const highHslRiskDeviation = { id: mockSupportErrandId, labels: [{ resourcePath: 'REPORT_TYPE/DEVIATION' }, highHslRiskLabel] };
    const highHslRiskMisconduct = { id: mockSupportErrandId, labels: [{ resourcePath: 'REPORT_TYPE/ABUSE' }, highHslRiskLabel] };
    const NOT_APPLICABLE_ERROR = { status: 409, message: 'This investigation document applies to HSL deviation errands only' };

    it.each([
      ['reported under HSL', hslDeviation],
      ['marked with a high HSL risk, with no reported legal base', highHslRiskDeviation],
    ])('is served and written on an ordinary deviation %s', async (_case, errand) => {
      const { controller, documentService } = makeController();
      documentService.readParentErrandSnapshot.mockResolvedValue(errand);
      documentService.readJsonParameter.mockResolvedValue({ document: { key: decisionKey, ...update, version: 1 }, etag: '"1"', status: 200 });
      documentService.writeJsonParameter.mockResolvedValue({
        document: { key: decisionKey, ...update, version: 2 },
        etag: '"2"',
        status: 200,
        parentErrandVersion: 5,
      });
      const req = mockReq();

      await controller.getJsonParameter(req, mockSupportErrandId, decisionKey, resDouble());
      await controller.updateJsonParameter(req, mockSupportErrandId, decisionKey, '"1"', ABSENT_HEADER, '4', update, resDouble());

      expect(documentService.readParentErrandSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ definition: expect.objectContaining({ key: decisionKey, appliesTo: 'hsl-deviation', placement: 'decision' }) }),
      );
      expect(documentService.readJsonParameter).toHaveBeenCalledTimes(1);
      expect(documentService.writeJsonParameter).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a deviation without HSL', solDeviation],
      ['a reported misconduct, even under HSL', hslMisconduct],
      ['a reported misconduct, even with a high HSL risk', highHslRiskMisconduct],
    ])('is refused on %s before the document is touched', async (_case, errand) => {
      const { controller, documentService } = makeController();
      documentService.readParentErrandSnapshot.mockResolvedValue(errand);

      await expect(controller.getJsonParameter(mockReq(), mockSupportErrandId, decisionKey, resDouble())).rejects.toMatchObject(NOT_APPLICABLE_ERROR);
      await expect(
        controller.updateJsonParameter(mockReq(), mockSupportErrandId, decisionKey, ABSENT_HEADER, '*', '4', update, resDouble()),
      ).rejects.toMatchObject(NOT_APPLICABLE_ERROR);

      expect(documentService.readJsonParameter).not.toHaveBeenCalled();
      expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
    });

    it('keeps the lex Sarah decision closed on the same HSL deviation', async () => {
      const { controller, documentService } = makeController();
      documentService.readParentErrandSnapshot.mockResolvedValue(hslDeviation);

      await expect(controller.getJsonParameter(mockReq(), mockSupportErrandId, 'beslut-sol-lss', resDouble())).rejects.toMatchObject({
        status: 409,
        message: 'This investigation document applies to reported misconduct errands only',
      });
    });
  });

  // Ä4: MAS/MAR's event analysis and the comment on it belong to deviations. A misconduct - reported, or suspected and
  // handed to LEX - never has them; an errand LEX hands back is a deviation again and has them back.
  describe('the documents declared for deviations', () => {
    const deviationDocuments = ['utredning-hsl', 'vc-kommentar-hsl'] as const;
    const reportType = (path: string) => ({ classification: 'REPORT_TYPE', resourcePath: path });
    const highHslRiskLabel = { classification: 'risk', resourcePath: 'RISK/HIGH_HSL', resourceName: 'HIGH_HSL' };
    const deviations = [
      ['an ordinary deviation under SoL', { id: mockSupportErrandId, labels: [reportType('REPORT_TYPE/DEVIATION')] }],
      ['a deviation with a high HSL risk', { id: mockSupportErrandId, labels: [reportType('REPORT_TYPE/DEVIATION'), highHslRiskLabel] }],
      ['a deviation LEX has handed back', { id: mockSupportErrandId, parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }] }],
    ] as const;
    const misconducts = [
      ['a reported misconduct', { id: mockSupportErrandId, parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }] }],
      ['a misconduct suspected and handed to LEX', { id: mockSupportErrandId, labels: [reportType('REPORT_TYPE/ABUSE')] }],
    ] as const;
    const NOT_APPLICABLE_ERROR = { status: 409, message: 'This investigation document does not apply to reported misconduct errands' };

    it.each(deviationDocuments.flatMap(key => deviations.map(([situation, errand]) => [key, situation, errand] as const)))(
      'serves %s on %s',
      async (key, _situation, errand) => {
        const { controller, documentService } = makeController();
        documentService.readParentErrandSnapshot.mockResolvedValue(errand);
        documentService.readJsonParameter.mockResolvedValue({
          document: { key, schemaId: `2281_${key}_1.0`, value: {}, version: 1 },
          etag: '"1"',
          status: 200,
        });

        await controller.getJsonParameter(mockReq(), mockSupportErrandId, key, resDouble());

        expect(documentService.readJsonParameter).toHaveBeenCalledTimes(1);
      },
    );

    it.each(deviationDocuments.flatMap(key => misconducts.map(([situation, errand]) => [key, situation, errand] as const)))(
      'refuses %s on %s before the document is touched',
      async (key, _situation, errand) => {
        const { controller, documentService } = makeController();
        documentService.readParentErrandSnapshot.mockResolvedValue(errand);
        const update = { schemaId: `2281_${key}_1.0`, value: {} };

        await expect(controller.getJsonParameter(mockReq(), mockSupportErrandId, key, resDouble())).rejects.toMatchObject(NOT_APPLICABLE_ERROR);
        await expect(
          controller.updateJsonParameter(mockReq(), mockSupportErrandId, key, ABSENT_HEADER, '*', '4', update, resDouble()),
        ).rejects.toMatchObject(NOT_APPLICABLE_ERROR);
        expect(documentService.readJsonParameter).not.toHaveBeenCalled();
        expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
      },
    );
  });

  it('rejects keys outside the configured profile before any upstream or policy call', async () => {
    const { controller, documentService, policyService } = makeController();

    await expect(controller.getJsonParameter(mockReq(), mockSupportErrandId, 'other-document', resDouble())).rejects.toMatchObject(
      UNSUPPORTED_KEY_ERROR,
    );
    await expect(
      controller.updateJsonParameter(
        mockReq(),
        mockSupportErrandId,
        'other-document',
        ABSENT_HEADER,
        '*',
        '10',
        { schemaId: '2281_other-document_1.0', value: {} },
        resDouble(),
      ),
    ).rejects.toMatchObject(UNSUPPORTED_KEY_ERROR);

    expect(documentService.readJsonParameter).not.toHaveBeenCalled();
    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
    expect(policyService.getState).not.toHaveBeenCalled();
  });

  it('passes the complete injected definition of another profile', async () => {
    const profile = createSupportInvestigationProfile({
      documents: [{ key: 'custom-document', schemaName: 'shared-schema', tabLabel: 'Custom', ownerLabel: 'Owner' }],
    });
    const documentService = {
      readJsonParameter: vi.fn(async () => ({
        document: { key: 'custom-document', schemaId: '2281_shared-schema_1.0', value: {} },
        etag: '"1"',
        status: 200,
      })),
    } as unknown as SupportJsonParameterService;
    const policyService = { getState: vi.fn().mockResolvedValue('active') };
    const accessApi = new ApiService();
    vi.spyOn(accessApi, 'get').mockResolvedValue({ status: 200, message: 'success', data: mockErrandAccess() });
    const controller = new SupportErrandJsonParameterController(
      profile,
      documentService,
      policyService as unknown as SupportInvestigationPolicyService,
      new SupportInvestigationAccessService({ apiService: accessApi }),
    );

    await controller.getJsonParameter(mockReq(), mockSupportErrandId, 'custom-document', resDouble());

    expect(documentService.readJsonParameter).toHaveBeenCalledWith(expect.objectContaining({ definition: profile.documents[0] }));
  });
});

describe('SupportErrandJsonParameterController report', () => {
  const REPORT_KEY = 'avvikelse-plats-handelse';
  const workflowPhases = [
    { id: 'phase-received', name: 'ACTUALIZATION', phaseOrder: 0 },
    { id: 'phase-review', name: 'REVIEW', phaseOrder: 1 },
    { id: 'phase-investigation', name: 'INVESTIGATION', phaseOrder: 2 },
  ];
  const report: UpdateSupportErrandJsonParameterDto = {
    schemaId: '2281_avvikelse-plats-handelse_1.5',
    value: { eventDescription: 'Fallolycka i korridoren' },
  };

  /** An errand as Support Management reads it, in one phase of the avvikelse workflow. */
  const errandIn = (channel: string, phaseId: string) => ({ id: mockSupportErrandId, channel, phases: [{ phaseId }] });

  const makeReportController = (errand: Record<string, unknown>, state: 'active' | 'unavailable' = 'active') => {
    const documentService: DocumentServiceStub = {
      readJsonParameter: vi.fn(),
      writeJsonParameter: vi.fn(async () => ({
        document: { key: REPORT_KEY, ...report, version: 1 },
        etag: '"1"',
        status: 201,
        parentErrandVersion: 5,
      })),
      readParentErrandSnapshot: vi.fn(async () => errand),
    };
    const accessService = { assertCanReadDocument: vi.fn(), assertCanWriteDocument: vi.fn() };
    const metadataApi = { get: vi.fn(async () => ({ data: { phases: workflowPhases }, message: 'success' })) };
    const controller = new SupportErrandJsonParameterController(
      AVVIKELSE_INVESTIGATION_PROFILE,
      documentService as unknown as SupportJsonParameterService,
      { getState: vi.fn(async () => state) } as unknown as SupportInvestigationPolicyService,
      accessService as unknown as SupportInvestigationAccessService,
      metadataApi as unknown as ApiService,
    );
    return { controller, documentService, accessService };
  };

  // The report is no investigation document: Support Management alone decides who reads it.
  it('reads the report without the investigation document grants', async () => {
    const { controller, documentService, accessService } = makeReportController(errandIn('ESERVICE', 'phase-investigation'));
    documentService.readJsonParameter.mockResolvedValue({ document: { key: REPORT_KEY, ...report, version: 4 }, etag: '"4"', status: 200 });
    const res = resDouble();

    await controller.getJsonParameter(mockReq(), mockSupportErrandId, REPORT_KEY, res);

    expect(documentService.readJsonParameter).toHaveBeenCalledWith(
      expect.objectContaining({ definition: expect.objectContaining({ key: REPORT_KEY, schemaName: 'avvikelse-plats-handelse' }) }),
    );
    expect(accessService.assertCanReadDocument).not.toHaveBeenCalled();
    expect(res.headers.ETag).toBe('"4"');
  });

  it.each(['phase-received', 'phase-review'])('writes the report of an errand registered in Draken in %s', async phaseId => {
    const { controller, documentService } = makeReportController(errandIn('WEB_UI', phaseId));
    const req = mockReq();
    const res = resDouble();

    await controller.updateJsonParameter(req, mockSupportErrandId, REPORT_KEY, ABSENT_HEADER, '*', ABSENT_HEADER, report, res);

    expect(documentService.writeJsonParameter).toHaveBeenCalledWith({
      definition: expect.objectContaining({ key: REPORT_KEY, schemaName: 'avvikelse-plats-handelse' }),
      municipalityId: mockMunicipalityId,
      errandId: mockSupportErrandId,
      user: req.user,
      data: report,
      preconditions: { ifMatch: undefined, ifNoneMatch: '*', parentErrandVersion: undefined },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.ETag).toBe('"1"');
    expect(res.headers['X-Errand-Version']).toBe('5');
  });

  it('never writes the report Katla brought in', async () => {
    const { controller, documentService } = makeReportController(errandIn('ESERVICE', 'phase-received'));

    await expect(
      controller.updateJsonParameter(mockReq(), mockSupportErrandId, REPORT_KEY, '"1"', ABSENT_HEADER, ABSENT_HEADER, report, resDouble()),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('record of what was reported') });
    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
  });

  it('locks the report once the investigation has started', async () => {
    const { controller, documentService } = makeReportController(errandIn('WEB_UI', 'phase-investigation'));

    await expect(
      controller.updateJsonParameter(mockReq(), mockSupportErrandId, REPORT_KEY, '"1"', ABSENT_HEADER, ABSENT_HEADER, report, resDouble()),
    ).rejects.toMatchObject({ status: 409, message: 'The report can no longer be changed once the investigation has started' });
    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
  });

  it('writes nothing while the investigation policy is unavailable, before reading the errand', async () => {
    const { controller, documentService } = makeReportController(errandIn('WEB_UI', 'phase-received'), 'unavailable');

    await expect(
      controller.updateJsonParameter(mockReq(), mockSupportErrandId, REPORT_KEY, '"1"', ABSENT_HEADER, ABSENT_HEADER, report, resDouble()),
    ).rejects.toMatchObject({ status: 503 });
    expect(documentService.readParentErrandSnapshot).not.toHaveBeenCalled();
    expect(documentService.writeJsonParameter).not.toHaveBeenCalled();
  });
});

describe('the labels a saved investigation document decides', () => {
  const managerSchemaId = '2281_utredning-enhetschef_1.6';

  const makeLabelController = (applied: number | undefined | Error = 14) => {
    const made = makeController();
    const documentService = made.documentService as DocumentServiceStub;
    const labelService = {
      applyDerivedLabel: vi.fn(async (): Promise<number | undefined> => {
        if (applied instanceof Error) throw applied;
        return applied;
      }),
    };
    const accessApi = new ApiService();
    vi.spyOn(accessApi, 'get').mockResolvedValue({
      status: 200,
      message: 'success',
      data: { ...mockErrandAccess(), resources: [{ resource: 'errand/json-parameter', level: 'RW' }] },
    });
    const controller = new SupportErrandJsonParameterController(
      AVVIKELSE_INVESTIGATION_PROFILE,
      documentService as unknown as SupportJsonParameterService,
      made.policyService as unknown as SupportInvestigationPolicyService,
      new SupportInvestigationAccessService({ apiService: accessApi }),
      new ApiService(),
      labelService,
    );
    return { controller, documentService, labelService };
  };

  const save = async (
    controller: SupportErrandJsonParameterController,
    documentService: DocumentServiceStub,
    key: string,
    value: UpdateSupportErrandJsonParameterDto['value'],
  ) => {
    const update: UpdateSupportErrandJsonParameterDto = { schemaId: managerSchemaId, value };
    documentService.writeJsonParameter.mockResolvedValue({
      document: { key, ...update, version: 8 },
      etag: '"8"',
      status: 200,
      parentErrandVersion: 13,
    });
    const req = mockReq();
    const res = resDouble();
    await controller.updateJsonParameter(req, mockSupportErrandId, key, '"7"', ABSENT_HEADER, '12', update, res);
    return { req, res };
  };

  it('sets the label when the investigation is saved as completed with an HSL risk of 4 or more', async () => {
    const { controller, documentService, labelService } = makeLabelController(14);

    const { req, res } = await save(controller, documentService, 'utredning-enhetschef', {
      completed: 'yes',
      riskAssessmentHsl: { calculatedRiskValue: 6 },
    });

    expect(labelService.applyDerivedLabel).toHaveBeenCalledWith({
      municipalityId: mockMunicipalityId,
      errandId: mockSupportErrandId,
      user: req.user,
      resourcePath: 'RISK/HIGH_HSL',
      expectedVersion: 13,
    });
    // Two writes of this request's own: the client advances past both.
    expect(res.headers['X-Errand-Version']).toBe('14');
    expect(res.headers['X-Errand-Writes']).toBe('2');
  });

  // The document write left the errand at 13. The label write is every step from there, as Support Management took
  // them: the client is told all of them are this request's own, or it could not follow the errand past them.
  it('counts every version step the label write took as its own', async () => {
    const { controller, documentService } = makeLabelController(15);

    const { res } = await save(controller, documentService, 'utredning-enhetschef', {
      riskAssessmentHsl: { calculatedRiskValue: 6 },
    });

    expect(res.headers['X-Errand-Version']).toBe('15');
    expect(res.headers['X-Errand-Writes']).toBe('3');
  });

  it('sets the label as soon as a draft assesses an HSL risk of 4 or more, so MAS/MAR reach the errand at once', async () => {
    const { controller, documentService, labelService } = makeLabelController(14);

    const { res } = await save(controller, documentService, 'utredning-enhetschef', {
      completed: 'no',
      riskAssessmentHsl: { calculatedRiskValue: 16 },
    });

    expect(labelService.applyDerivedLabel).toHaveBeenCalledWith(expect.objectContaining({ resourcePath: 'RISK/HIGH_HSL', expectedVersion: 13 }));
    expect(res.headers['X-Errand-Version']).toBe('14');
    expect(res.headers['X-Errand-Writes']).toBe('2');
  });

  it.each([
    ['a lower HSL risk', { completed: 'yes', riskAssessmentHsl: { calculatedRiskValue: 3 } }],
    ['no HSL assessment', { completed: 'no' }],
  ])('never clears the label once set: a save assessing %s writes no label', async (_situation, value) => {
    const { controller, documentService, labelService } = makeLabelController(14);

    const { res } = await save(controller, documentService, 'utredning-enhetschef', value);

    expect(labelService.applyDerivedLabel).not.toHaveBeenCalled();
    expect(res.headers['X-Errand-Version']).toBe('13');
    expect(res.headers['X-Errand-Writes']).toBe('1');
  });

  it('counts one write when the errand already carries the label', async () => {
    const { controller, documentService, labelService } = makeLabelController();
    // No label write was needed.
    labelService.applyDerivedLabel.mockResolvedValue(undefined);

    const { res } = await save(controller, documentService, 'utredning-enhetschef', {
      riskAssessmentHsl: { calculatedRiskValue: 6 },
    });

    expect(res.headers['X-Errand-Version']).toBe('13');
    expect(res.headers['X-Errand-Writes']).toBe('1');
  });

  it('only reads the unit manager investigation for it', async () => {
    const { controller, documentService, labelService } = makeLabelController();

    await save(controller, documentService, 'utredning-hsl', { completed: 'yes' });

    expect(labelService.applyDerivedLabel).not.toHaveBeenCalled();
  });

  it('still saves the investigation when the label cannot be written', async () => {
    const { controller, documentService } = makeLabelController(new Error('upstream down'));

    const { res } = await save(controller, documentService, 'utredning-enhetschef', {
      completed: 'yes',
      riskAssessmentHsl: { calculatedRiskValue: 9 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Errand-Version']).toBe('13');
    expect(res.headers['X-Errand-Writes']).toBe('1');
  });

  // D2. The head of operations is e-mailed when MAS/MAR decides to make an HSL event analysis. Support Management's
  // subscription profile does it from a label, which the saved initial assessment adds once the event is to be
  // analysed. It is permanent: a later decision against the analysis leaves it.
  describe('the HSL analysis label on a saved HSL event analysis', () => {
    it('marks the errand when MAS/MAR decides that the event is analysed', async () => {
      const { controller, documentService, labelService } = makeLabelController(14);

      const { res } = await save(controller, documentService, 'utredning-hsl', { analysisDecision: 'analyze' });

      expect(labelService.applyDerivedLabel).toHaveBeenCalledWith(
        expect.objectContaining({ resourcePath: 'ANALYSIS/HSL_STARTED', expectedVersion: 13 }),
      );
      expect(res.headers['X-Errand-Version']).toBe('14');
      expect(res.headers['X-Errand-Writes']).toBe('2');
    });

    it('never takes the mark off: a decision against the analysis, or none yet, writes no label', async () => {
      const { controller, documentService, labelService } = makeLabelController(14);

      await save(controller, documentService, 'utredning-hsl', { analysisDecision: 'not_analyze', notAnalyzedMotivation: 'Text' });
      await save(controller, documentService, 'utredning-hsl', { methodology: '<p>Utkast</p>' });

      expect(labelService.applyDerivedLabel).not.toHaveBeenCalled();
    });

    it('reads the decision from the HSL event analysis alone', async () => {
      const { controller, documentService, labelService } = makeLabelController(14);

      await save(controller, documentService, 'utredning-sol-lss', { analysisDecision: 'analyze' });

      expect(labelService.applyDerivedLabel).not.toHaveBeenCalled();
    });
  });
});
