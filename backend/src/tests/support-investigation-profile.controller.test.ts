import { Response } from 'express';
import { getMetadataArgsStorage } from 'routing-controllers';

import { createSupportInvestigationProfile } from '@/config/support-investigation-profile';
import { SupportInvestigationProfileController } from '@/controllers/supportmanagement/support-investigation-profile.controller';
import authMiddleware from '@/middlewares/auth.middleware';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';

import { mockReq, mockRes } from './helpers/http';

describe('SupportInvestigationProfileController', () => {
  it('returns the effective runtime profile selected by the backend policy', async () => {
    const runtimeProfile = {
      documents: [],
      state: 'active' as const,
      registration: { mode: 'enabled' as const, form: true },
    };
    const policyService = { getRuntimeProfile: vi.fn(async () => runtimeProfile) } as unknown as SupportInvestigationPolicyService;
    const controller = new SupportInvestigationProfileController(policyService);

    await expect(controller.getInvestigationProfile()).resolves.toEqual(runtimeProfile);
    expect(policyService.getRuntimeProfile).toHaveBeenCalledOnce();
  });

  it('exposes an auth-protected GET endpoint', () => {
    const metadata = getMetadataArgsStorage();
    const action = metadata.actions.find(
      candidate => candidate.target === SupportInvestigationProfileController && candidate.method === 'getInvestigationProfile',
    );
    const uses = metadata.uses.filter(
      candidate => candidate.target === SupportInvestigationProfileController && candidate.method === 'getInvestigationProfile',
    );

    expect(action).toMatchObject({ route: '/supportmanagement/investigation-profile', type: 'get' });
    expect(uses.some(use => use.middleware === authMiddleware && use.afterAction === false)).toBe(true);
  });
});

describe('errand-scoped investigation access', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves grants for the requested errand without allowing them to be cached', async () => {
    const profile = createSupportInvestigationProfile({
      documents: [{ key: 'one', schemaName: 'one', tabLabel: 'One', ownerLabel: 'Owner' }],
    });
    const policy = new SupportInvestigationPolicyService(profile, 'support');
    vi.spyOn(policy, 'getState').mockResolvedValue('active');
    const access = new SupportInvestigationAccessService();
    const grants = { municipalityId: '2281', errandId: 'errand-1', documents: [{ key: 'one', access: 'read' as const }] };
    const get = vi.spyOn(access, 'getDocumentAccess').mockResolvedValue(grants);
    const response = mockRes();
    const req = mockReq();
    await expect(
      new SupportInvestigationProfileController(policy, access).getInvestigationAccess(req, 'errand-1', response as unknown as Response),
    ).resolves.toEqual(grants);
    expect(get).toHaveBeenCalledWith(req.user, '2281', 'errand-1', ['one']);
    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('does not call the sprint access API for a profile without documents', async () => {
    const policy = new SupportInvestigationPolicyService(createSupportInvestigationProfile({ documents: [] }), 'support');
    const access = new SupportInvestigationAccessService();
    const get = vi.spyOn(access, 'getDocumentAccess');
    await expect(
      new SupportInvestigationProfileController(policy, access).getInvestigationAccess(mockReq(), 'one', mockRes() as unknown as Response),
    ).resolves.toEqual({ municipalityId: '2281', errandId: 'one', documents: [] });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('errand access level', () => {
  afterEach(() => vi.restoreAllMocks());

  it("serves the user's level on the errand without allowing it to be cached", async () => {
    const access = new SupportInvestigationAccessService();
    const get = vi.spyOn(access, 'getErrandLevel').mockResolvedValue('LR');
    const response = mockRes();
    const req = mockReq();

    await expect(
      new SupportInvestigationProfileController(undefined, access).getErrandAccess(req, 'errand-1', response as unknown as Response),
    ).resolves.toEqual({ level: 'LR' });
    expect(get).toHaveBeenCalledWith(req.user, '2281', 'errand-1');
    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('exposes an auth-protected GET endpoint', () => {
    const metadata = getMetadataArgsStorage();
    const action = metadata.actions.find(
      candidate => candidate.target === SupportInvestigationProfileController && candidate.method === 'getErrandAccess',
    );
    const uses = metadata.uses.filter(
      candidate => candidate.target === SupportInvestigationProfileController && candidate.method === 'getErrandAccess',
    );

    expect(action).toMatchObject({ route: '/supporterrands/:errandId/errand-access', type: 'get' });
    expect(uses.some(use => use.middleware === authMiddleware && use.afterAction === false)).toBe(true);
  });
});
