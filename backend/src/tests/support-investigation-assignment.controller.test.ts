import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { resolveIafVofInvestigationClassificationPolicy } from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE } from '@/config/support-investigation-profile';
import {
  InvestigationHandoverDto,
  SupportInvestigationAssignmentController,
} from '@/controllers/supportmanagement/support-investigation-assignment.controller';
import { Label } from '@/data-contracts/supportmanagement/data-contracts';

import { mockReq, mockRes } from './helpers/http';
import { mockMunicipalityId, mockSupportErrandId, mockSupportNamespace } from './helpers/mock-data';

const MUNICIPALITY_ID = mockMunicipalityId;
const NAMESPACE = mockSupportNamespace;
const errandUrl = `${MUNICIPALITY_ID}/${NAMESPACE}/errands/${mockSupportErrandId}`;
const metadataUrl = `${MUNICIPALITY_ID}/${NAMESPACE}/metadata`;

const label = (id: string, classification: string, resourcePath: string, displayName: string, labels?: Label[]): Label => ({
  id,
  classification,
  resourcePath,
  resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
  displayName,
  ...(labels ? { labels } : {}),
});

const labelStructure: Label[] = [
  label('location-root', 'LOCATION_ROOT', 'LOCATION', 'Platsstruktur', [
    label('north', 'DEPARTMENT', 'LOCATION/NORTH', 'Norr', [label('north-unit', 'LOCATION', 'LOCATION/NORTH/NORTH_UNIT', 'Norra enheten')]),
    label('south', 'DEPARTMENT', 'LOCATION/SOUTH', 'Söder', [label('south-unit', 'LOCATION', 'LOCATION/SOUTH/SOUTH_UNIT', 'Södra enheten')]),
  ]),
  label('access-root', 'ACCESS_ROOT', 'ACCESS', 'Åtkomst', [label('access-lex', 'ACCESS', 'ACCESS/LEX', 'LEX')]),
  label('category-root', 'CATEGORY_ROOT', 'CATEGORY', 'Kategori', [label('category-hsl', 'CATEGORY', 'CATEGORY/HSL', 'HSL')]),
];

const katlaReport = { key: 'katla-report', schemaId: 'katla_1.0', value: { facility: { orgName: 'Norra enheten', parentOrgName: 'Norr' } } };

interface Stubs {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  findLocationAccessCandidates: ReturnType<typeof vi.fn>;
  assertCanWriteDocument: ReturnType<typeof vi.fn>;
}

/** Errand labels arrive as bare ids; the metadata tree is what names them. */
type ErrandLabel = Pick<Label, 'id'>;

const makeController = ({
  errandLabels = [{ id: 'category-hsl' }, { id: 'north' }, { id: 'north-unit' }],
}: { errandLabels?: ErrandLabel[] } = {}) => {
  const controller = new SupportInvestigationAssignmentController();
  const stubs: Stubs = {
    get: vi.fn(async (config: { url?: string }) => {
      if (config.url === errandUrl) {
        return {
          data: { id: mockSupportErrandId, status: 'ONGOING', version: 7, labels: errandLabels, jsonParameters: [katlaReport] },
          headers: { etag: '"7"' },
          message: 'success',
        };
      }
      if (config.url === metadataUrl) return { data: { labels: { labelStructure }, statuses: [] }, message: 'success' };
      if (config.url?.includes('/access/ad/south.manager')) {
        return { data: [{ accessByType: [{ type: 'role', access: [{ pattern: 'UNIT_MANAGER' }] }] }], message: 'success' };
      }
      if (config.url?.includes('/access/ad/')) return { data: [], message: 'success' };
      throw new Error(`Unexpected GET ${config.url}`);
    }),
    patch: vi.fn(async () => ({ data: {}, message: 'success' })),
    findLocationAccessCandidates: vi.fn(async () => ['south.manager', 'south.nurse']),
    assertCanWriteDocument: vi.fn(async () => undefined),
  };

  const internals = controller as unknown as Record<string, unknown>;
  internals.apiService = { get: stubs.get, patch: stubs.patch };
  internals.accessMapperService = { findLocationAccessCandidates: stubs.findLocationAccessCandidates };
  internals.handlerDirectory = {
    roles: undefined,
    lookupDisplayNames: vi.fn(async () => new Map([['south.manager', 'Sonja Söder']])),
    assertHandlerHoldsRole: vi.fn(),
    listHandlers: vi.fn(async () => []),
  };
  internals.investigationPolicyService = {
    iafVofClassificationPolicy: {},
    profile: { documents: [{ key: 'utredning-enhetschef', schemaName: 'utredning-enhetschef' }] },
    getClassificationOwner: vi.fn(async () => 'investigation'),
  };
  internals.investigationAccessService = { assertCanWriteDocument: stubs.assertCanWriteDocument };

  return { controller, stubs };
};

describe('InvestigationHandoverDto', () => {
  it('accepts the target place as an optional label id', async () => {
    const valid = plainToInstance(InvestigationHandoverDto, { expectedVersion: 7, assignedUserId: 'south.manager', locationLabelId: 'south-unit' });
    const invalid = plainToInstance(InvestigationHandoverDto, { expectedVersion: 7, locationLabelId: '' });

    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    expect(JSON.stringify(await validate(invalid, { whitelist: true, forbidNonWhitelisted: true }))).toMatch(/locationLabelId/);
  });
});

describe('move-location', () => {
  it('rewrites the location chain and assigns a manager of the target place in one conditional PATCH', async () => {
    const { controller, stubs } = makeController();
    const res = mockRes();

    await controller.applyHandover(
      mockReq(),
      MUNICIPALITY_ID,
      mockSupportErrandId,
      'move-location',
      { expectedVersion: 7, assignedUserId: 'south.manager', locationLabelId: 'south-unit' },
      res,
    );

    expect(res.statusCode).toBe(204);
    expect(stubs.assertCanWriteDocument).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, mockSupportErrandId, 'utredning-enhetschef');
    expect(stubs.findLocationAccessCandidates).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, NAMESPACE, 'LOCATION/SOUTH/SOUTH_UNIT');
    expect(stubs.patch).toHaveBeenCalledTimes(1);
    const [config] = stubs.patch.mock.calls[0] as [{ url: string; data: unknown; headers: Record<string, string> }];
    expect(config.url).toBe(errandUrl);
    expect(config.headers).toEqual({ 'If-Match': '"7"' });
    expect(config.data).toEqual({
      assignedUserId: 'south.manager',
      labels: [{ id: 'category-hsl' }, { id: 'south' }, { id: 'south-unit' }],
    });
    // The reported place stays exactly as it arrived: the move never touches the JSON parameters.
    expect(config.data).not.toHaveProperty('jsonParameters');
  });

  // In IAF/VOF the errand is followed by its assignee alone: the manager it leaves stops following it.
  it('moves the following from the manager the errand leaves to the one it goes to', async () => {
    const { controller, stubs } = makeController();
    const readErrandOrMetadata = stubs.get.getMockImplementation() as (config: { url?: string }) => Promise<{ data: object }>;
    stubs.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url?.includes('/subscribers?')) {
        return { data: [{ id: config.url.includes('north.manager') ? 'north-subscriber' : 'south-subscriber' }], message: 'success' };
      }
      if (config.url?.endsWith('/north-subscriber/subscriptions')) {
        return { data: [{ id: 'followed', target: { type: 'ERRAND', id: mockSupportErrandId } }], message: 'success' };
      }
      if (config.url?.endsWith('/south-subscriber/subscriptions')) return { data: [], message: 'success' };
      const answer = await readErrandOrMetadata(config);
      return config.url === errandUrl ? { ...answer, data: { ...answer.data, assignedUserId: 'north.manager' } } : answer;
    });
    const post = vi.fn(async (_config: { url: string; data: unknown }) => ({ data: {}, message: 'success' }));
    const remove = vi.fn(async (_config: { url: string }) => ({ data: {}, message: 'success' }));
    const internals = controller as unknown as Record<string, Record<string, unknown>>;
    internals.apiService = { get: stubs.get, patch: stubs.patch, post, delete: remove };
    internals.investigationPolicyService.assigneeFollowsErrand = true;

    await controller.applyHandover(
      mockReq(),
      MUNICIPALITY_ID,
      mockSupportErrandId,
      'move-location',
      { expectedVersion: 7, assignedUserId: 'south.manager', locationLabelId: 'south-unit' },
      mockRes(),
    );

    expect(remove.mock.calls.map(([config]) => config.url)).toEqual([expect.stringMatching(/\/north-subscriber\/subscriptions\/followed$/u)]);
    expect(post.mock.calls.map(([config]) => config.data)).toEqual([{ target: { type: 'ERRAND', id: mockSupportErrandId } }]);
  });

  it('requires a target place and refuses an assignee who is not a manager there', async () => {
    const { controller, stubs } = makeController();

    await expect(
      controller.applyHandover(
        mockReq(),
        MUNICIPALITY_ID,
        mockSupportErrandId,
        'move-location',
        { expectedVersion: 7, assignedUserId: 'x' },
        mockRes(),
      ),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('target place') });

    await expect(
      controller.applyHandover(
        mockReq(),
        MUNICIPALITY_ID,
        mockSupportErrandId,
        'move-location',
        { expectedVersion: 7, assignedUserId: 'south.nurse', locationLabelId: 'south-unit' },
        mockRes(),
      ),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('not a manager') });

    expect(stubs.patch).not.toHaveBeenCalled();
  });

  it('refuses to move an errand that is with the LEX roles', async () => {
    const { controller, stubs } = makeController({ errandLabels: [{ id: 'north' }, { id: 'north-unit' }, { id: 'access-lex' }] });

    await expect(
      controller.applyHandover(
        mockReq(),
        MUNICIPALITY_ID,
        mockSupportErrandId,
        'move-location',
        { expectedVersion: 7, assignedUserId: 'south.manager', locationLabelId: 'south-unit' },
        mockRes(),
      ),
    ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('LEX') });
    expect(stubs.patch).not.toHaveBeenCalled();
  });

  it('rejects a stale errand version before resolving anybody', async () => {
    const { controller, stubs } = makeController();

    await expect(
      controller.applyHandover(
        mockReq(),
        MUNICIPALITY_ID,
        mockSupportErrandId,
        'move-location',
        { expectedVersion: 6, assignedUserId: 'south.manager', locationLabelId: 'south-unit' },
        mockRes(),
      ),
    ).rejects.toMatchObject({ status: 412 });
    expect(stubs.findLocationAccessCandidates).not.toHaveBeenCalled();
    expect(stubs.patch).not.toHaveBeenCalled();
  });

  it('previews the managers of the target place, grouped by their AccessMapper role', async () => {
    const { controller, stubs } = makeController();

    const response = await controller.getLocationManagers(mockReq(), MUNICIPALITY_ID, mockSupportErrandId, 'south-unit');

    expect(response).toEqual({
      candidates: [{ adAccount: 'south.manager', displayName: 'Sonja Söder', roleKey: 'UNIT_MANAGER' }],
      roles: [
        { key: 'UNIT_MANAGER', label: 'Enhetschef' },
        { key: 'HEAD_OF_OPERATIONS', label: 'Verksamhetschef' },
      ],
      locationResourcePath: 'LOCATION/SOUTH/SOUTH_UNIT',
      locationDisplayName: 'Södra enheten',
    });
    expect(stubs.patch).not.toHaveBeenCalled();
  });

  it('refuses a preview for a level with sub-places', async () => {
    const { controller } = makeController();

    await expect(controller.getLocationManagers(mockReq(), MUNICIPALITY_ID, mockSupportErrandId, 'south')).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('sub-places'),
    });
  });
});

describe('decline-lex', () => {
  const assessmentKey = 'bedomning-sol-lss';
  const motivation = 'Händelsen gäller inte omsorgen om den enskilde.';
  const noteBody = `Ärendet ska inte lex-utredas. Motivering: ${motivation}`;
  const reportTypeStructure = label('report-root', 'REPORT_TYPE_ROOT', 'REPORT_TYPE', 'Rapporttyp', [
    label('deviation', 'REPORT_TYPE', 'REPORT_TYPE/DEVIATION', 'Avvikelse'),
    label('abuse', 'REPORT_TYPE', 'REPORT_TYPE/ABUSE', 'Missförhållande'),
  ]);

  const setup = ({
    decision = 'not_investigate',
    existingNotes = [] as { context: string; body: string }[],
    versionAfterNote = 8,
  }: { decision?: string; existingNotes?: { context: string; body: string }[]; versionAfterNote?: number } = {}) => {
    const { controller, stubs } = makeController();
    let version = 7;
    const errandRead = () => ({
      data: {
        id: mockSupportErrandId,
        status: 'INQUIRY',
        assignedUserId: mockReq().user.username,
        version,
        labels: [{ id: 'report-root' }, { id: 'abuse' }, { id: 'access-root' }, { id: 'access-lex' }, { id: 'north' }, { id: 'north-unit' }],
        jsonParameters: [{ key: assessmentKey, value: { lexInvestigationDecision: decision, notInvestigatedMotivation: motivation } }],
      },
      headers: { etag: `"${version}"` },
      message: 'success',
    });
    const get = vi.fn(async (config: { url?: string }) => {
      if (config.url === errandUrl) return errandRead();
      if (config.url === metadataUrl) {
        return {
          data: { labels: { labelStructure: [...labelStructure, reportTypeStructure] }, statuses: [{ name: 'ASSIGNED' }] },
          message: 'success',
        };
      }
      if (config.url?.startsWith(`${errandUrl}/notes?`)) return { data: { notes: existingNotes }, message: 'success' };
      return (stubs.get as (request: { url?: string }) => Promise<unknown>)(config);
    });
    const post = vi.fn(async () => {
      version = versionAfterNote;
      return { data: {}, message: 'success' };
    });
    const internals = controller as unknown as Record<string, unknown>;
    internals.apiService = { get, post, patch: stubs.patch };
    internals.investigationPolicyService = {
      iafVofClassificationPolicy: {},
      profile: { documents: [{ key: assessmentKey, schemaName: 'bedomning-sol-lss' }] },
      getClassificationOwner: vi.fn(async () => 'investigation'),
    };
    const decline = () =>
      controller.applyHandover(
        mockReq(),
        MUNICIPALITY_ID,
        mockSupportErrandId,
        'decline-lex',
        { expectedVersion: 7, assignedUserId: 'south.manager' },
        mockRes(),
      );
    return { decline, post, stubs };
  };

  it('leaves the reason as a service note, then hands the errand back to its unit as a deviation', async () => {
    const { decline, post, stubs } = setup();

    await decline();

    expect(stubs.assertCanWriteDocument).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, mockSupportErrandId, assessmentKey);
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${errandUrl}/notes`, data: expect.objectContaining({ context: 'SERVICE_NOTE', body: noteBody }) }),
      expect.anything(),
    );
    expect(stubs.patch).toHaveBeenCalledTimes(1);
    const [config] = stubs.patch.mock.calls[0] as [{ data: { labels: { id: string }[] }; headers: Record<string, string> }];
    // Conditioned on the errand as the note left it, the note being this step's own write.
    expect(config.headers).toEqual({ 'If-Match': '"8"' });
    expect(config.data).toMatchObject({ assignedUserId: 'south.manager', status: 'ASSIGNED' });
    const labelIds = config.data.labels.map(({ id }) => id);
    expect(labelIds).toContain('deviation');
    expect(labelIds).not.toContain('abuse');
    expect(labelIds).not.toContain('access-lex');
  });

  it('refuses until the saved assessment declines the lex investigation, and writes nothing', async () => {
    const { decline, post, stubs } = setup({ decision: 'investigate' });

    await expect(decline()).rejects.toMatchObject({ status: 422 });
    expect(post).not.toHaveBeenCalled();
    expect(stubs.patch).not.toHaveBeenCalled();
  });

  it('writes the note once, so a retried handover does not repeat it', async () => {
    const { decline, post, stubs } = setup({ existingNotes: [{ context: 'SERVICE_NOTE', body: noteBody }] });

    await decline();

    expect(post).not.toHaveBeenCalled();
    const [config] = stubs.patch.mock.calls[0] as [{ headers: Record<string, string> }];
    expect(config.headers).toEqual({ 'If-Match': '"7"' });
  });

  it("refuses to hand over an errand somebody else changed beside the note's own write", async () => {
    const { decline, stubs } = setup({ versionAfterNote: 9 });

    await expect(decline()).rejects.toMatchObject({ status: 409 });
    expect(stubs.patch).not.toHaveBeenCalled();
  });
});

// Ä4. MAS/MAR asks the head of operations for their comment on the HSL analysis: the request label is all that is
// written - nobody is assigned and the status stays - and only somebody who may write the analysis may ask.
describe('request-vc-comment', () => {
  const analysisKey = 'utredning-hsl';
  const analysisStructure = label('analysis-root', 'analysis-root', 'ANALYSIS', 'Analys', [
    label('vc-comment', 'analysis', 'ANALYSIS/VC_COMMENT_HSL', 'Yttrande verksamhetschef HSL'),
  ]);

  const setup = ({ errandLabels = [{ id: 'category-hsl' }, { id: 'north' }, { id: 'north-unit' }] }: { errandLabels?: ErrandLabel[] } = {}) => {
    const { controller, stubs } = makeController({ errandLabels });
    const get = vi.fn(async (config: { url?: string }) =>
      config.url === metadataUrl
        ? { data: { labels: { labelStructure: [...labelStructure, analysisStructure] }, statuses: [] }, message: 'success' }
        : (stubs.get as (request: { url?: string }) => Promise<unknown>)(config),
    );
    const internals = controller as unknown as Record<string, unknown>;
    internals.apiService = { get, patch: stubs.patch };
    internals.investigationPolicyService = {
      iafVofClassificationPolicy: {},
      profile: { documents: [{ key: analysisKey, schemaName: 'utredning-hsl' }] },
      getClassificationOwner: vi.fn(async () => 'investigation'),
    };
    const request = () =>
      controller.applyHandover(mockReq(), MUNICIPALITY_ID, mockSupportErrandId, 'request-vc-comment', { expectedVersion: 7 }, mockRes());
    return { request, stubs };
  };

  it('writes the request label alone, conditioned on the errand version, and assigns nobody', async () => {
    const { request, stubs } = setup();

    await request();

    expect(stubs.assertCanWriteDocument).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, mockSupportErrandId, analysisKey);
    expect(stubs.patch).toHaveBeenCalledTimes(1);
    const [config] = stubs.patch.mock.calls[0] as [{ data: Record<string, unknown>; headers: Record<string, string> }];
    expect(config.headers).toEqual({ 'If-Match': '"7"' });
    expect(config.data).toEqual({ labels: [{ id: 'category-hsl' }, { id: 'north' }, { id: 'north-unit' }, { id: 'vc-comment' }] });
    // The head of operations is told by Support Management: the write is the user's own, and is not silenced.
    expect(config).not.toHaveProperty('notifySubscribers');
  });

  it('is refused for somebody who may not write the HSL analysis, before anything is written', async () => {
    const { request, stubs } = setup();
    stubs.assertCanWriteDocument.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));

    await expect(request()).rejects.toMatchObject({ status: 403 });
    expect(stubs.patch).not.toHaveBeenCalled();
  });

  it('writes nothing when the head of operations has already been asked', async () => {
    const { request, stubs } = setup({ errandLabels: [{ id: 'category-hsl' }, { id: 'vc-comment' }] });

    await request();

    expect(stubs.patch).not.toHaveBeenCalled();
  });
});

describe('assignable handlers', () => {
  const policy = resolveIafVofInvestigationClassificationPolicy(AVVIKELSE_INVESTIGATION_PROFILE)!;
  const lexManager = { displayName: 'Lena LEX', name: 'lena.lex', guid: 'lena-guid', roleKeys: ['lex-ansvarig'] };

  const listFor = async (managerInvestigation: Record<string, unknown>) => {
    const { controller, stubs } = makeController();
    const internals = controller as unknown as Record<string, unknown>;
    const errandGet = stubs.get as (request: { url?: string }) => Promise<{ data: Record<string, unknown> }>;
    internals.apiService = {
      get: vi.fn(async (config: { url?: string }) => {
        const response = await errandGet(config);
        if (config.url !== errandUrl) return response;
        return {
          ...response,
          data: { ...response.data, jsonParameters: [{ key: policy.defaultOwnerDocumentKey, value: managerInvestigation }] },
        };
      }),
      patch: stubs.patch,
    };
    internals.investigationPolicyService = {
      iafVofClassificationPolicy: policy,
      profile: AVVIKELSE_INVESTIGATION_PROFILE,
      getClassificationOwner: vi.fn(async () => 'investigation'),
    };
    internals.handlerDirectory = {
      ...(internals.handlerDirectory as Record<string, unknown>),
      roles: [{ key: 'lex-ansvarig', label: 'LEX-ansvarig', group: 'MOCK_LEX_MANAGERS' }],
      listHandlers: vi.fn(async () => [lexManager]),
    };
    return controller.getAssignableHandlers(mockReq(), MUNICIPALITY_ID, mockSupportErrandId);
  };

  it("offers the LEX managers, as the handover to LEX, once the unit manager's completed investigation suspects a misconduct", async () => {
    const result = await listFor({ suspectedMisconduct: 'yes', completed: 'yes' });

    expect(result.data).toContainEqual(expect.objectContaining({ name: 'south.manager' }));
    expect(result.data).toContainEqual({ ...lexManager, handoverStep: 'assign-lex' });
    expect(result.roles).toContainEqual({ key: 'lex-ansvarig', label: 'LEX-ansvarig' });
  });

  it('offers only the managers of the place until the investigation is completed', async () => {
    const result = await listFor({ suspectedMisconduct: 'yes', completed: 'no' });

    expect(result.data.map(({ name }) => name)).toEqual(['south.manager']);
  });
});
