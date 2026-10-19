import express from 'express';
import { useExpressServer } from 'routing-controllers';
import request from 'supertest';

import { SupportErrandJsonParameterController } from '@/controllers/supportmanagement/support-errand-json-parameter.controller';
import { SupportInvestigationProfileController } from '@/controllers/supportmanagement/support-investigation-profile.controller';
import errorMiddleware from '@/middlewares/error.middleware';
import ApiService from '@/services/api.service';
import { defaultPermissions } from '@/services/authorization.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { StrongVersionETag, SupportJsonParameterService } from '@/services/support-json-parameter.service';

import { mockUser } from './helpers/http';
import { mockErrandAccess } from './helpers/support-errand-access';

// The controllers are built by routing-controllers, so they take the configured profile. One document without the
// avvikelse workflow around it is enough to exercise the access rules over HTTP.
vi.mock('@/config/support-investigation-profile', async importOriginal => {
  const actual = await importOriginal<typeof import('@/config/support-investigation-profile')>();
  return {
    ...actual,
    AVVIKELSE_INVESTIGATION_PROFILE: actual.createSupportInvestigationProfile({
      documents: [{ key: 'utredning-hsl', schemaName: 'utredning-hsl', tabLabel: 'HSL', ownerLabel: 'Owner' }],
    }),
  };
});

const key = 'utredning-hsl';
const url = `/supporterrands/one/json-parameters/${key}`;
const body = { schemaId: '2281_utredning-hsl_1.0', value: { assessment: 'Saved' } };
let authenticated = true;

const server = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { user: mockUser({ permissions: defaultPermissions() }), isAuthenticated: () => authenticated });
    next();
  });
  useExpressServer(app, {
    controllers: [SupportErrandJsonParameterController, SupportInvestigationProfileController],
    validation: false,
    defaultErrorHandler: false,
  });
  app.use(errorMiddleware);
  return app;
};

beforeEach(() => {
  authenticated = true;
  vi.spyOn(SupportInvestigationPolicyService.prototype, 'getState').mockResolvedValue('active');
  vi.spyOn(ApiService.prototype, 'get').mockResolvedValue({ status: 200, message: 'success', data: mockErrandAccess() });
  vi.spyOn(SupportJsonParameterService.prototype, 'writeJsonParameter').mockResolvedValue({
    document: { key, ...body, version: 1 },
    etag: '"1"' as StrongVersionETag,
    status: 201,
    parentErrandVersion: 2,
  });
});

afterEach(() => vi.restoreAllMocks());

describe('investigation access over HTTP', () => {
  it('allows a document write granted by access even without the old application edit permission', async () => {
    const response = await request(server()).put(url).send(body);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ key, value: body.value });
    expect(response.headers.etag).toBe('"1"');
  });

  it('refuses a read-only key before writing any document', async () => {
    vi.mocked(ApiService.prototype.get).mockResolvedValue({
      status: 200,
      message: 'success',
      data: {
        ...mockErrandAccess(),
        fields: [{ field: 'jsonParameters', allKeys: false, keys: [{ key, level: 'R' }] }],
      },
    });
    const response = await request(server()).put(url).send(body);
    expect(response.status).toBe(403);
    expect(SupportJsonParameterService.prototype.writeJsonParameter).not.toHaveBeenCalled();
  });

  // Every key of an unrestricted jsonParameters field follows the field's level, which may be wider than the errand's.
  it('writes a document under errand level R when the unrestricted field and the document resource are RW', async () => {
    vi.mocked(ApiService.prototype.get).mockResolvedValue({ status: 200, message: 'success', data: { ...mockErrandAccess(), level: 'R' } });
    const response = await request(server()).put(url).send(body);
    expect(response.status).toBe(201);
    expect(SupportJsonParameterService.prototype.writeJsonParameter).toHaveBeenCalledTimes(1);
  });

  it('refuses a document write where the unrestricted field is read-only, before writing anything', async () => {
    vi.mocked(ApiService.prototype.get).mockResolvedValue({
      status: 200,
      message: 'success',
      data: { ...mockErrandAccess(), fields: [{ field: 'jsonParameters', level: 'R', allKeys: true, keys: [] }] },
    });
    const response = await request(server()).put(url).send(body);
    expect(response.status).toBe(403);
    expect(SupportJsonParameterService.prototype.writeJsonParameter).not.toHaveBeenCalled();
  });

  it('retains 401 for a missing BFF login and never asks upstream for access', async () => {
    authenticated = false;
    const response = await request(server()).put(url).send(body);
    expect(response.status).toBe(401);
    expect(ApiService.prototype.get).not.toHaveBeenCalled();
    expect(SupportJsonParameterService.prototype.writeJsonParameter).not.toHaveBeenCalled();
  });

  it('publishes the current errand grants as a non-cacheable response', async () => {
    const response = await request(server()).get('/supporterrands/one/investigation-access');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ municipalityId: '2281', errandId: 'one', documents: [{ key, access: 'edit' }] });
  });
});
