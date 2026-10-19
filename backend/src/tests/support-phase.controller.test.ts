import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { resolveIafVofInvestigationClassificationPolicy } from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE } from '@/config/support-investigation-profile';
import { SupportPhaseController, UpdateSupportErrandPhaseDto } from '@/controllers/supportmanagement/support-phase.controller';
import type { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import type { SupportJsonParameterService } from '@/services/support-json-parameter.service';

import { mockReq, mockRes, mockUser } from './helpers/http';
import { mockMunicipalityId, mockSupportErrandId, mockSupportNamespace } from './helpers/mock-data';

const MUNICIPALITY_ID = mockMunicipalityId;
const NAMESPACE = mockSupportNamespace;

interface ApiStub {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
}

const makeController = () => {
  const controller = new SupportPhaseController();
  const api: ApiStub = {
    get: vi.fn(async () => ({ data: { version: 7, status: 'ONGOING' }, headers: { etag: '"7"' }, message: 'success' })),
    patch: vi.fn(async () => ({ data: {}, message: 'success' })),
  };
  (controller as unknown as { apiService: ApiStub }).apiService = api;
  return { controller, api };
};

describe('UpdateSupportErrandPhaseDto', () => {
  it('accepts the phase the client saw and an explicit transition id, and nothing that names a target', async () => {
    const valid = plainToInstance(UpdateSupportErrandPhaseDto, { expectedActivePhaseId: 'received', transitionId: 'start-investigation' });
    const entering = plainToInstance(UpdateSupportErrandPhaseDto, { expectedActivePhaseId: null });
    const invalid = plainToInstance(UpdateSupportErrandPhaseDto, {
      expectedActivePhaseId: '',
      transitionId: '',
      activePhaseId: 'client-selected-target-is-not-accepted',
    });

    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    await expect(validate(entering, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    const serializedErrors = JSON.stringify(await validate(invalid, { whitelist: true, forbidNonWhitelisted: true }));
    expect(serializedErrors).toMatch(/expectedActivePhaseId/);
    expect(serializedErrors).toMatch(/transitionId/);
    expect(serializedErrors).toMatch(/activePhaseId/);
  });
});

describe('updateSupportErrandPhase', () => {
  const errandUrl = `${MUNICIPALITY_ID}/${NAMESPACE}/errands/${mockSupportErrandId}`;
  const metadataUrl = `${MUNICIPALITY_ID}/${NAMESPACE}/metadata`;
  const phases = [
    {
      id: 'received',
      name: 'RECEIVED',
      transitions: [
        { id: 'start-investigation', targetPhaseId: 'investigation' },
        { id: 'close-directly', targetPhaseId: 'closed' },
      ],
    },
    { id: 'investigation', name: 'INVESTIGATION' },
    { id: 'closed', name: 'CLOSED' },
  ];

  /** The errand as upstream holds it at the first read, and after the transition. */
  const stubErrand = (api: ApiStub, before: { phaseId: string; version: number }) => {
    let errandRead = 0;
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url === metadataUrl) return { data: { phases }, message: 'success' };
      errandRead += 1;
      return errandRead === 1
        ? {
            data: { id: mockSupportErrandId, phases: [{ phaseId: before.phaseId }], status: 'ONGOING', version: before.version },
            message: 'success',
            headers: { etag: `"${before.version}"` },
          }
        : {
            data: { id: mockSupportErrandId, phases: [{ phaseId: 'closed' }], status: 'ONGOING', version: before.version + 1 },
            message: 'success',
            headers: { etag: `"${before.version + 1}"` },
          };
    });
  };

  /**
   * A phase carries its status, so a move into a phase that closes the errand is a close. The rule
   * about handled measures cannot live on the close button alone, or the phase strip walks past it.
   */
  it('refuses a phase move that would close the errand while a measure is unhandled', async () => {
    const { controller, api } = makeController();
    const closingPhases = [
      { id: 'received', name: 'RECEIVED', transitions: [{ id: 'close-directly', targetPhaseId: 'closed' }] },
      { id: 'closed', name: 'CLOSED', allowedStatuses: ['SOLVED'] },
    ];
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url === metadataUrl) return { data: { phases: closingPhases }, message: 'success' };
      if (config.url === `${errandUrl}/measures`) return { data: [{ id: 'a' }], message: 'success' };
      return {
        data: { id: mockSupportErrandId, phases: [{ phaseId: 'received' }], status: 'ONGOING', version: 7 },
        message: 'success',
        headers: { etag: '"7"' },
      };
    });

    await expect(
      controller.updateSupportErrandPhase(
        mockReq(),
        mockSupportErrandId,
        { expectedActivePhaseId: 'received', transitionId: 'close-directly' },
        mockRes(),
      ),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('väntar på beslut') });
    expect(api.patch).not.toHaveBeenCalled();
  });

  /**
   * The rule itself is covered with `assertInvestigationCompletedBeforeDecision`; this proves the
   * phase write asks it with the name of the phase it is moving into, and stops before writing.
   */
  it('refuses to move an IAF/VOF errand into the decision before its investigation is completed', async () => {
    const policyService = {
      iafVofClassificationPolicy: resolveIafVofInvestigationClassificationPolicy(AVVIKELSE_INVESTIGATION_PROFILE),
      profile: AVVIKELSE_INVESTIGATION_PROFILE,
      getState: vi.fn(async () => 'active'),
    };
    const documentService = { readBoundSchema: vi.fn() };
    const controller = new SupportPhaseController(
      policyService as unknown as SupportInvestigationPolicyService,
      documentService as unknown as SupportJsonParameterService,
    );
    const { api } = makeController();
    (controller as unknown as { apiService: ApiStub }).apiService = api;
    const decisionPhases = [
      { id: 'investigation', name: 'INVESTIGATION', transitions: [{ id: 'to-decision', targetPhaseId: 'decision' }] },
      { id: 'decision', name: 'DECISION' },
    ];
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url === metadataUrl) return { data: { phases: decisionPhases }, message: 'success' };
      return {
        data: { id: mockSupportErrandId, phases: [{ phaseId: 'investigation' }], status: 'INQUIRY', version: 7, jsonParameters: [] },
        message: 'success',
        headers: { etag: '"7"' },
      };
    });

    await expect(
      controller.updateSupportErrandPhase(
        mockReq(),
        mockSupportErrandId,
        { expectedActivePhaseId: 'investigation', transitionId: 'to-decision' },
        mockRes(),
      ),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('Utredning enhetschef') });
    expect(api.patch).not.toHaveBeenCalled();
  });

  // Following up the measures is the unit's work: a LEX handler hands the decided errand back instead.
  it('refuses a LEX handler who would move an IAF/VOF errand into the follow-up, before writing', async () => {
    const policyService = {
      iafVofClassificationPolicy: resolveIafVofInvestigationClassificationPolicy(AVVIKELSE_INVESTIGATION_PROFILE),
      profile: AVVIKELSE_INVESTIGATION_PROFILE,
      getState: vi.fn(async () => 'active'),
    };
    const controller = new SupportPhaseController(
      policyService as unknown as SupportInvestigationPolicyService,
      { readBoundSchema: vi.fn() } as unknown as SupportJsonParameterService,
    );
    const { api } = makeController();
    (controller as unknown as { apiService: ApiStub }).apiService = api;
    (controller as unknown as { handlerRoles: unknown }).handlerRoles = [{ key: 'lex-ansvarig', label: 'LEX-ansvarig', group: 'MOCK_LEX_MANAGERS' }];
    const followUpPhases = [
      { id: 'decision', name: 'DECISION', transitions: [{ id: 'to-follow-up', targetPhaseId: 'follow-up' }] },
      { id: 'follow-up', name: 'FOLLOW_UP' },
    ];
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url === metadataUrl) return { data: { phases: followUpPhases }, message: 'success' };
      return {
        data: { id: mockSupportErrandId, phases: [{ phaseId: 'decision' }], status: 'DECISION', version: 7, jsonParameters: [] },
        message: 'success',
        headers: { etag: '"7"' },
      };
    });

    await expect(
      controller.updateSupportErrandPhase(
        mockReq(mockUser({ groups: ['MOCK_LEX_MANAGERS'] })),
        mockSupportErrandId,
        { expectedActivePhaseId: 'decision', transitionId: 'to-follow-up' },
        mockRes(),
      ),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('Uppföljningen görs av enheten') });
    expect(api.patch).not.toHaveBeenCalled();
  });

  // Ä13. The unit decides on every proposal before the errand goes on to the follow-up.
  describe('a move into the follow-up', () => {
    const followUpPhases = [
      { id: 'decision', name: 'DECISION', transitions: [{ id: 'start-follow-up', targetPhaseId: 'follow-up' }] },
      { id: 'follow-up', name: 'FOLLOW_UP' },
    ];
    const moveIntoFollowUp = (measures: unknown[]) => {
      const { controller, api } = makeController();
      api.get.mockImplementation(async (config: { url?: string }) => {
        if (config.url === metadataUrl) return { data: { phases: followUpPhases }, message: 'success' };
        if (config.url === `${errandUrl}/measures`) return { data: measures, message: 'success' };
        return {
          data: { id: mockSupportErrandId, phases: [{ phaseId: 'decision' }], status: 'ONGOING', version: 7 },
          message: 'success',
          headers: { etag: '"7"' },
        };
      });
      const move = controller.updateSupportErrandPhase(
        mockReq(),
        mockSupportErrandId,
        { expectedActivePhaseId: 'decision', transitionId: 'start-follow-up' },
        mockRes(),
      );
      return { api, move };
    };

    it('is refused while a proposal waits for its decision, before anything is written', async () => {
      const { api, move } = moveIntoFollowUp([{ id: 'proposal' }, { id: 'approved', accept: 'TRUE', plannedComplete: '2026-09-30T00:00:00Z' }]);
      await expect(move).rejects.toMatchObject({
        status: 422,
        message:
          'Ärendet kan inte gå vidare till uppföljning förrän alla åtgärdsförslag är bedömda: 1 förslag väntar på att godkännas, delvis godkännas eller avslås.',
      });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('goes through once every proposal is decided, with measures still to follow up', async () => {
      const { api, move } = moveIntoFollowUp([
        { id: 'approved', accept: 'TRUE', plannedComplete: '2026-09-30T00:00:00Z' },
        { id: 'rejected', accept: 'FALSE' },
      ]);
      await move;
      expect(api.patch).toHaveBeenCalled();
    });
  });

  // A move that carries no closing status is an ordinary step and never reads the measures.
  it('does not consult the measures for a phase move that does not close the errand', async () => {
    const { controller, api } = makeController();
    stubErrand(api, { phaseId: 'received', version: 7 });

    await controller.updateSupportErrandPhase(
      mockReq(),
      mockSupportErrandId,
      { expectedActivePhaseId: 'received', transitionId: 'start-investigation' },
      mockRes(),
    );

    expect(api.get).not.toHaveBeenCalledWith(expect.objectContaining({ url: `${errandUrl}/measures` }), expect.anything());
    expect(api.patch).toHaveBeenCalled();
  });

  it('applies the selected transition with If-Match on the version it read and returns the fresh errand version', async () => {
    const { controller, api } = makeController();
    stubErrand(api, { phaseId: 'received', version: 7 });
    const req = mockReq();
    const res = mockRes();

    await controller.updateSupportErrandPhase(req, mockSupportErrandId, { expectedActivePhaseId: 'received', transitionId: 'close-directly' }, res);

    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: errandUrl,
        data: { activePhaseId: 'closed' },
        headers: { 'If-Match': '"7"' },
        followLocation: false,
        propagateClientError: true,
      }),
      req.user,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ phases: [{ phaseId: 'closed' }], version: 8 });
  });

  // A measure, document or label written since the page loaded moves the errand's version, not its phase.
  it('moves an errand whose version has moved on while its phase has not', async () => {
    const { controller, api } = makeController();
    stubErrand(api, { phaseId: 'received', version: 14 });

    await controller.updateSupportErrandPhase(
      mockReq(),
      mockSupportErrandId,
      { expectedActivePhaseId: 'received', transitionId: 'close-directly' },
      mockRes(),
    );

    expect(api.patch).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'If-Match': '"14"' } }), expect.anything());
  });

  it.each([
    ['another phase', 'investigation'],
    ['no phase', undefined],
  ])('rejects a transition chosen from %s than the errand is in, before applying it', async (_seen, expectedActivePhaseId) => {
    const { controller, api } = makeController();
    stubErrand(api, { phaseId: 'received', version: 7 });

    await expect(
      controller.updateSupportErrandPhase(mockReq(), mockSupportErrandId, { expectedActivePhaseId, transitionId: 'start-investigation' }, mockRes()),
    ).rejects.toMatchObject({ status: 409, message: 'Support errand phase has changed since it was loaded' });
    expect(api.patch).not.toHaveBeenCalled();
  });
});
