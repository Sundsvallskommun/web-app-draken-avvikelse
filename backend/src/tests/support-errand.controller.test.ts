import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NextFunction, Response } from 'express';
import { getMetadataArgsStorage } from 'routing-controllers';

import { apiServiceName } from '@/config/api-config';
import { resolveIafVofInvestigationClassificationPolicy } from '@/config/iaf-vof-investigation-classification';
import { AVVIKELSE_INVESTIGATION_PROFILE } from '@/config/support-investigation-profile';
import {
  AssignSupportErrandDto,
  SupportErrandController,
  SupportErrandDto,
  UpdateSupportErrandClassificationDto,
  UpdateSupportErrandStatusDto,
} from '@/controllers/supportmanagement/support-errand.controller';
import { Errand as SupportErrand, Label, Priority } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { ExternalIdType } from '@/interfaces/externalIdType.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportErrandClassificationOwner, SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { SupportJsonParameterService } from '@/services/support-json-parameter.service';

import { ABSENT_HEADER, mockReq, mockRes, mockUser } from './helpers/http';
import {
  mockAdUsername,
  mockCitizenPartyId,
  mockFirstName,
  mockInvalidOrganizationNumber,
  mockMunicipalityId,
  mockOrganizationNumber,
  mockOrganizationNumberDigits,
  mockOrganizationPartyId,
  mockPersonNumber,
  mockSecondaryCitizenPartyId,
  mockSupportErrandId,
  mockSupportErrandNumber,
  mockSupportNamespace,
} from './helpers/mock-data';

const SUPPORT_SERVICE = apiServiceName('supportmanagement');
const CITIZEN_SERVICE = apiServiceName('citizen');
const MUNICIPALITY_ID = mockMunicipalityId;
const NAMESPACE = mockSupportNamespace;

interface ApiStub {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface OrgStub {
  getOrganizationNumberByPartyId: ReturnType<typeof vi.fn>;
  getPartyIdByOrganizationNumber: ReturnType<typeof vi.fn>;
}

/**
 * `apiService` and `organizationService` are plain instance properties (the `private` keyword is
 * erased at runtime), so they can be replaced directly instead of mocking the modules.
 */
const makeController = (classificationOwner: SupportErrandClassificationOwner = 'investigation') => {
  const controller = new SupportErrandController();
  const api: ApiStub = {
    get: vi.fn(async () => ({ data: { version: 7, status: 'ONGOING' }, headers: { etag: '"7"' }, message: 'success' })),
    post: vi.fn(async () => ({ data: {}, message: 'success' })),
    patch: vi.fn(async () => ({ data: {}, message: 'success' })),
    delete: vi.fn(async () => ({ data: {}, message: 'success' })),
  };
  const organization: OrgStub = {
    getOrganizationNumberByPartyId: vi.fn(async () => ''),
    getPartyIdByOrganizationNumber: vi.fn(async () => ''),
  };
  const configuredProfile = AVVIKELSE_INVESTIGATION_PROFILE;
  const investigationPolicy = {
    getClassificationOwner: vi.fn(async () => classificationOwner),
    getRegistrationState: vi.fn(async () => (classificationOwner === 'unavailable' ? 'unavailable' : 'enabled')),
    getState: vi.fn(async () => (classificationOwner === 'unavailable' ? 'unavailable' : 'active')),
    profile: configuredProfile,
    labelFilter: configuredProfile.labelFilter,
    iafVofClassificationPolicy: resolveIafVofInvestigationClassificationPolicy(configuredProfile),
  };
  const investigationDocument = {
    readJsonParameter: vi.fn(async () => ({
      document: {
        key: 'utredning-enhetschef',
        schemaId: '2281_utredning-enhetschef_1.0',
        value: { legalBases: ['HSL'] },
        version: 3,
      },
      etag: '"3"',
      status: 200,
    })),
  };
  const accessMapper = { findAccountLabelPatterns: vi.fn(async (): Promise<string[]> => []) };
  const employment = { readEmployments: vi.fn(async (): Promise<Array<{ orgId?: number; isMainEmployment?: boolean }>> => []) };
  (controller as unknown as { apiService: ApiStub }).apiService = api;
  (controller as unknown as { employmentService: typeof employment }).employmentService = employment;
  (controller as unknown as { accessMapperService: typeof accessMapper }).accessMapperService = accessMapper;
  (controller as unknown as { organizationService: OrgStub }).organizationService = organization;
  (controller as unknown as { investigationPolicyService: SupportInvestigationPolicyService }).investigationPolicyService =
    investigationPolicy as unknown as SupportInvestigationPolicyService;
  (controller as unknown as { jsonParameterService: SupportJsonParameterService }).jsonParameterService =
    investigationDocument as unknown as SupportJsonParameterService;
  return { controller, api, organization, investigationPolicy, investigationDocument, accessMapper, employment };
};

/**
 * Metadata for registration: the two report types it offers, and one place under a department, which is
 * the shape AccessMapper's patterns are written against.
 */
const registrationMetadata = {
  labels: {
    labelStructure: [
      {
        id: 'report-type-root',
        classification: 'REPORT_TYPE_ROOT',
        resourceName: 'REPORT_TYPE',
        resourcePath: 'REPORT_TYPE',
        labels: [
          {
            id: 'deviation',
            classification: 'REPORT_TYPE',
            resourceName: 'DEVIATION',
            resourcePath: 'REPORT_TYPE/DEVIATION',
            displayName: 'Avvikelse',
          },
          { id: 'abuse', classification: 'REPORT_TYPE', resourceName: 'ABUSE', resourcePath: 'REPORT_TYPE/ABUSE', displayName: 'Missförhållande' },
        ],
      },
      {
        id: 'location-root',
        classification: 'LOCATION_ROOT',
        resourceName: 'LOCATION',
        resourcePath: 'LOCATION',
        labels: [
          {
            id: 'department',
            classification: 'DEPARTMENT',
            resourceName: 'VOF',
            resourcePath: 'LOCATION/VOF',
            labels: [
              {
                id: 'unit',
                classification: 'LOCATION',
                resourceName: 'HEMTJANST_NORR',
                resourcePath: 'LOCATION/VOF/HEMTJANST_NORR',
                displayName: 'Hemtjänst Norr',
              },
            ],
          },
        ],
      },
    ],
  },
};

const HANDLER_LOCATION_PATTERN = 'LOCATION/VOF/HEMTJANST_NORR/**';

/** An organization unit id, as the location tree names its units. Invented; no real unit has it. */
const EMPLOYMENT_ORGANIZATION_ID = 900001;

/**
 * The registration metadata with a second unit named, as the real location tree names its units, by
 * its organization id - the unit the handler in these tests is employed at.
 */
const employmentRegistrationMetadata = {
  labels: {
    labelStructure: registrationMetadata.labels.labelStructure.map(root =>
      root.id !== 'location-root'
        ? root
        : {
            ...root,
            labels: (root.labels as Label[]).map((department: Label) => ({
              ...department,
              labels: [
                ...(department.labels ?? []),
                {
                  id: 'employment-unit',
                  classification: 'LOCATION',
                  resourceName: String(EMPLOYMENT_ORGANIZATION_ID),
                  resourcePath: `LOCATION/VOF/${EMPLOYMENT_ORGANIZATION_ID}`,
                  displayName: 'Hemtjänst Syd',
                },
              ],
            })),
          },
    ),
  },
};

/** A registering handler employed at the unit above, which is a place in the location tree. */
const makeEmployedRegistrationController = () => {
  const made = makeRegistrationController();
  made.api.get.mockResolvedValue({ data: employmentRegistrationMetadata, message: 'success' });
  made.employment.readEmployments.mockResolvedValue([{ orgId: EMPLOYMENT_ORGANIZATION_ID, isMainEmployment: true }]);
  return made;
};

/** A controller ready to register: registration asks what happened and where before the errand exists. */
const makeRegistrationController = () => {
  const made = makeController();
  made.api.get.mockResolvedValue({ data: registrationMetadata, message: 'success' });
  made.api.post.mockResolvedValue({ data: { id: mockSupportErrandId }, message: 'success' });
  made.accessMapper.findAccountLabelPatterns.mockResolvedValue([HANDLER_LOCATION_PATTERN]);
  return made;
};

/** All query params of `errands`, in declaration order, so tests can override just one. */
const errandsArgs = (overrides: Partial<Record<string, unknown>> = {}) => {
  const q = {
    page: undefined,
    size: undefined,
    query: undefined,
    stakeholders: undefined,
    priority: undefined,
    category: undefined,
    type: undefined,
    labelCategory: undefined,
    labelType: undefined,
    labelSubType: undefined,
    labelFilter: undefined,
    channel: undefined,
    status: undefined,
    resolution: undefined,
    start: undefined,
    end: undefined,
    sort: undefined,
    ...overrides,
  } as Record<string, any>;
  return [
    q.page,
    q.size,
    q.query,
    q.stakeholders,
    q.priority,
    q.category,
    q.type,
    q.labelCategory,
    q.labelType,
    q.labelSubType,
    q.labelFilter,
    q.channel,
    q.status,
    q.resolution,
    q.start,
    q.end,
    q.sort,
  ] as [any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any, any];
};

/** The status groups, then the list's filter params minus `status`, matching `countErrandsByStatusGroups`. */
const statusGroupCountArgs = (statusGroups: unknown, overrides: Partial<Record<string, unknown>> = {}) => {
  const [, , query, stakeholders, priority, category, type, labelCategory, labelType, labelSubType, labelFilter, channel, , resolution, start, end] =
    errandsArgs(overrides);
  const groups = typeof statusGroups === 'string' ? statusGroups : JSON.stringify(statusGroups);
  return [
    groups,
    query,
    stakeholders,
    priority,
    category,
    type,
    labelCategory,
    labelType,
    labelSubType,
    labelFilter,
    channel,
    resolution,
    start,
    end,
  ] as [any, any, any, any, any, any, any, any, any, any, any, any, any, any];
};

const upstreamSearchQuery = (url: string): string => new URL(url, 'http://draken.local').searchParams.get('query') ?? '';

/** Puts the controller on the sprint target, whose index answers the status counts whatever lists the errands. */
const onSprintTarget = (controller: SupportErrandController): void => {
  (controller as unknown as { countSearch: boolean }).countSearch = true;
};

/** Points the controller at the search index, as a sprint deployment with SUPPORTMANAGEMENT_ERRAND_SEARCH=true does. */
const enableErrandSearch = (controller: SupportErrandController): void => {
  onSprintTarget(controller);
  (controller as unknown as { errandSearch: boolean }).errandSearch = true;
};

const upstreamFilter = (url: string): string => new URL(url, 'http://draken.local').searchParams.get('filter') ?? '';

const routeMiddlewares = (method: 'updateSupportErrand' | 'becomeAdminForSupportErrand') =>
  getMetadataArgsStorage().uses.filter(candidate => candidate.target === SupportErrandController && candidate.method === method);

const runMiddleware = async (
  middleware: (req: RequestWithUser & { body?: unknown }, response: Response, next: NextFunction) => unknown,
  req: RequestWithUser & { body?: unknown },
): Promise<unknown> =>
  new Promise(resolve => {
    const next: NextFunction = error => resolve(error);
    Promise.resolve(middleware(req, {} as Response, next)).catch(resolve);
  });

/**
 * A CATEGORY tree shaped like the SupportManagement metadata: one CATEGORY root, an owning
 * PROVISION_CATEGORY, one CATEGORY under it and two TYPE leaves, plus an unrelated REPORT_TYPE root
 * that must never be treated as part of the classification.
 */
const classificationLabelStructure: Label[] = [
  {
    id: 'category-root-id',
    classification: 'CATEGORY_ROOT',
    resourceName: 'CATEGORY',
    resourcePath: 'CATEGORY',
    labels: [
      {
        id: 'category-owner-id',
        classification: 'PROVISION_CATEGORY',
        resourceName: 'HSL',
        resourcePath: 'CATEGORY/HSL',
        labels: [
          {
            id: 'category-label-id',
            classification: 'CATEGORY',
            resourceName: 'REHAB',
            resourcePath: 'CATEGORY/HSL/REHAB',
            labels: [
              { id: 'type-label-id', classification: 'TYPE', resourceName: 'MISSED', resourcePath: 'CATEGORY/HSL/REHAB/MISSED' },
              { id: 'other-type-label-id', classification: 'TYPE', resourceName: 'OTHER', resourcePath: 'CATEGORY/HSL/REHAB/OTHER' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'report-type-id',
    classification: 'REPORT_TYPE_ROOT',
    resourceName: 'REPORT_TYPE',
    resourcePath: 'REPORT_TYPE',
    labels: [{ id: 'deviation-id', classification: 'REPORT_TYPE', resourceName: 'DEVIATION', resourcePath: 'REPORT_TYPE/DEVIATION' }],
  },
];

const labelFilterLabelStructure: Label[] = [
  {
    id: 'provision-root-id',
    classification: 'PROVISION_ROOT',
    resourceName: 'PROVISION',
    resourcePath: 'PROVISION',
    labels: [
      {
        id: 'provision-hsl-id',
        classification: 'PROVISION',
        resourceName: 'HSL',
        resourcePath: 'PROVISION/HSL',
      },
    ],
  },
  {
    id: 'risk-root-id',
    classification: 'risk-root',
    resourceName: 'RISK',
    resourcePath: 'RISK',
    labels: [{ id: 'risk-high-hsl-id', classification: 'risk', resourceName: 'HIGH_HSL', resourcePath: 'RISK/HIGH_HSL' }],
  },
  ...classificationLabelStructure,
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SupportErrandController', () => {
  describe.each([
    ['updateSupportErrand', { title: 'Updated' }],
    ['becomeAdminForSupportErrand', { assignedUserId: mockAdUsername }],
  ] as const)('%s route contract', (method, body) => {
    it('requires authentication and Support Management edit permission', async () => {
      const middlewares = routeMiddlewares(method);
      expect(middlewares.some(use => use.middleware === authMiddleware && use.afterAction === false)).toBe(true);

      const req = Object.assign(mockReq(mockUser({ permissions: { canEditSupportManagement: false } } as never)), { body });
      const errors = await Promise.all(
        middlewares.filter(use => use.middleware !== authMiddleware).map(use => runMiddleware(use.middleware as never, req)),
      );

      expect(errors).toContainEqual(expect.objectContaining({ status: 403, message: 'Missing permissions' }));
    });
  });

  describe('errand', () => {
    it('fetches the errand by id from the namespaced errands endpoint', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { id: mockSupportErrandId }, message: 'success' });
      const res = mockRes();

      await controller.errand(mockReq(), mockSupportErrandId, res);

      expect(api.get).toHaveBeenCalledWith(
        { url: `${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands/${mockSupportErrandId}` },
        expect.anything(),
      );
      expect(res.body).toEqual({ id: mockSupportErrandId });
    });
  });

  describe('getSupportErrandByErrandNumber', () => {
    it('filters on errandNumber and returns the first hit', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { content: [{ id: mockSupportErrandId }, { id: `${mockSupportErrandId}-second` }] }, message: 'success' });
      const res = mockRes();

      await controller.getSupportErrandByErrandNumber(mockReq(), mockSupportErrandNumber, res);

      expect(api.get).toHaveBeenCalledWith(
        { url: `${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands?filter=errandNumber:'${mockSupportErrandNumber}'` },
        expect.anything(),
      );
      expect(res.body).toEqual({ id: mockSupportErrandId });
    });
  });

  describe('errands', () => {
    it('defaults to the first page of 8 and appends no filter or sort', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { content: [] }, message: 'success' });

      await controller.errands(mockReq(), ...errandsArgs(), mockRes());

      expect(api.get).toHaveBeenCalledWith({ url: `${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands?page=0&size=8` }, expect.anything());
    });

    it('passes through page, size, sort and the built filter', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { content: [] }, message: 'success' });

      await controller.errands(mockReq(), ...errandsArgs({ page: 2, size: 25, status: 'NEW', sort: 'created,desc' }), mockRes());

      expect(api.get).toHaveBeenCalledWith(
        {
          url: `${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands?page=2&size=25&filter=%28status%3A%27NEW%27%29&sort=created%2Cdesc`,
        },
        expect.anything(),
      );
    });

    it('validates generic label selections against the runtime profile and live metadata', async () => {
      const { controller, api } = makeController();
      api.get.mockImplementation(async ({ url }: { url: string }) =>
        url.includes('/metadata/labels')
          ? { data: { labelStructure: labelFilterLabelStructure }, message: 'success' }
          : { data: { content: [] }, message: 'success' },
      );
      const labelFilter = JSON.stringify([
        { groupKey: 'classification', fieldKey: 'category', resourcePath: 'CATEGORY/HSL/REHAB' },
        { groupKey: 'classification', fieldKey: 'type', resourcePath: 'CATEGORY/HSL/REHAB/MISSED' },
      ]);

      await controller.errands(mockReq(), ...errandsArgs({ status: 'NEW', labelFilter }), mockRes());

      expect(api.get.mock.calls[0][0]).toMatchObject({
        url: `${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/metadata/labels`,
        propagateClientError: true,
      });
      const filter = upstreamFilter(api.get.mock.calls[1][0].url);
      expect(filter).toContain("status:'NEW'");
      expect(filter).toContain("exists(labels.metadataLabel.resourcePath:'CATEGORY/HSL/REHAB/MISSED')");
      expect(filter).not.toContain("resourcePath:'CATEGORY/HSL/REHAB') or");
      expect(filter).toContain(' and ');
    });

    // MAS/MAR-ärenden in the overview asks for the errands with a high HSL risk, beside any other label selection.
    it('narrows the errands to a high HSL risk through the profile risk group', async () => {
      const { controller, api } = makeController();
      api.get.mockImplementation(async ({ url }: { url: string }) =>
        url.includes('/metadata/labels')
          ? { data: { labelStructure: labelFilterLabelStructure }, message: 'success' }
          : { data: { content: [] }, message: 'success' },
      );
      const labelFilter = JSON.stringify([
        { groupKey: 'provision', fieldKey: 'provision', resourcePath: 'PROVISION/HSL' },
        { groupKey: 'risk', fieldKey: 'risk', resourcePath: 'RISK/HIGH_HSL' },
      ]);

      await controller.errands(mockReq(), ...errandsArgs({ labelFilter }), mockRes());

      const filter = upstreamFilter(api.get.mock.calls[1][0].url);
      expect(filter).toContain(
        "(exists(labels.metadataLabel.resourcePath:'PROVISION/HSL')) and (exists(labels.metadataLabel.resourcePath:'RISK/HIGH_HSL'))",
      );
    });

    it('rejects malformed or crafted generic label selections before searching errands', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { labelStructure: labelFilterLabelStructure }, message: 'success' });

      await expect(
        controller.errands(
          mockReq(),
          ...errandsArgs({
            labelFilter: JSON.stringify([{ groupKey: 'classification', fieldKey: 'type', resourcePath: 'REPORT_TYPE/DEVIATION' }]),
          }),
          mockRes(),
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(controller.errands(mockReq(), ...errandsArgs({ labelFilter: '{invalid' }), mockRes())).rejects.toMatchObject({
        status: 400,
        message: 'Support Management labelFilter must be a valid JSON array',
      });
    });

    it('responds with 200 and the page payload', async () => {
      const { controller, api } = makeController();
      const page = { content: [{ id: mockSupportErrandId }], totalElements: 1 };
      api.get.mockResolvedValue({ data: page, message: 'success' });
      const res = mockRes();

      await controller.errands(mockReq(), ...errandsArgs(), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(page);
    });

    it('resolves an organization number in the query into a party id filter', async () => {
      const { controller, api, organization } = makeController();
      organization.getPartyIdByOrganizationNumber.mockResolvedValue(mockOrganizationPartyId);
      api.get.mockResolvedValue({ data: { content: [] }, message: 'success' });

      // The mock organization number is Luhn-valid and its third digit is > 1, which is what
      // marks it as an organization number rather than a personal number.
      await controller.errands(mockReq(), ...errandsArgs({ query: mockOrganizationNumber }), mockRes());

      expect(organization.getPartyIdByOrganizationNumber).toHaveBeenCalledWith(MUNICIPALITY_ID, mockOrganizationNumberDigits, expect.anything());
      expect(upstreamFilter(api.get.mock.calls[0][0].url)).toContain(`or exists(stakeholders.externalId~'*${mockOrganizationPartyId}*')`);
    });

    it('resolves a personal number in the query through the citizen service', async () => {
      const { controller, api } = makeController();
      api.get.mockImplementation(async ({ url }: { url: string }) =>
        url.includes('/guid') ? { data: mockCitizenPartyId, message: 'success' } : { data: { content: [] }, message: 'success' },
      );

      await controller.errands(mockReq(), ...errandsArgs({ query: mockPersonNumber }), mockRes());

      expect(api.get).toHaveBeenCalledWith({ url: `${CITIZEN_SERVICE}/${MUNICIPALITY_ID}/${mockPersonNumber}/guid` }, expect.anything());
      expect(upstreamFilter(api.get.mock.calls[1][0].url)).toContain(`or exists(stakeholders.externalId~'*${mockCitizenPartyId}*')`);
    });

    it('still searches when the party id lookup fails', async () => {
      const { controller, api } = makeController();
      api.get.mockImplementation(async ({ url }: { url: string }) =>
        url.includes('/guid') ? Promise.reject(new Error('boom')) : { data: { content: [] }, message: 'success' },
      );

      await controller.errands(mockReq(), ...errandsArgs({ query: mockPersonNumber }), mockRes());

      // Only the clause matching the raw query text remains; no extra party-id clause is added.
      expect(upstreamFilter(api.get.mock.calls[1][0].url).match(/stakeholders\.externalId~/gu)).toHaveLength(1);
    });

    it('does not attempt a party id lookup for a plain text query', async () => {
      const { controller, api, organization } = makeController();
      api.get.mockResolvedValue({ data: { content: [] }, message: 'success' });

      await controller.errands(mockReq(), ...errandsArgs({ query: mockFirstName }), mockRes());

      expect(organization.getPartyIdByOrganizationNumber).not.toHaveBeenCalled();
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('does not attempt a party id lookup for a number that fails the Luhn check', async () => {
      const { controller, api, organization } = makeController();
      api.get.mockResolvedValue({ data: { content: [] }, message: 'success' });

      await controller.errands(mockReq(), ...errandsArgs({ query: mockInvalidOrganizationNumber }), mockRes());

      expect(organization.getPartyIdByOrganizationNumber).not.toHaveBeenCalled();
      expect(api.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('countErrandsByStatusGroups', () => {
    it('counts each group on the filter endpoint on the stable target, the group standing in for the status', async () => {
      const { controller, api } = makeController();
      api.get.mockImplementation(async ({ url }: { url: string }) => ({ data: { count: url.includes('ONGOING') ? 5 : 2 }, message: 'success' }));
      const res = mockRes();

      await controller.countErrandsByStatusGroups(mockReq(), ...statusGroupCountArgs([['NEW'], ['ONGOING', 'PENDING']], { priority: 'HIGH' }), res);

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(
        api.get.mock.calls.every(([config]) => config.url.startsWith(`${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands/count?filter=`)),
      ).toBe(true);
      expect(api.get.mock.calls.map(([config]) => upstreamFilter(config.url))).toEqual([
        "(priority:'HIGH') and (status:'NEW')",
        "(priority:'HIGH') and (status:'ONGOING' or status:'PENDING')",
      ]);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ counts: [2, 5] });
    });

    it.each(['{invalid', '[]', '[[]]', '[["NEW", "NOT A STATUS"]]', '[["NEW"], "SOLVED"]'])(
      'rejects malformed status groups %s before asking Support Management',
      async statusGroups => {
        const { controller, api } = makeController();

        await expect(controller.countErrandsByStatusGroups(mockReq(), ...statusGroupCountArgs(statusGroups), mockRes())).rejects.toMatchObject({
          status: 400,
        });
        expect(api.get).not.toHaveBeenCalled();
      },
    );
  });

  describe('errand search', () => {
    const SEARCH_URL = `${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands/search?`;
    const FILTER_URL = `${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands?`;
    const escapedHyphens = (value: string): string => value.replaceAll('-', '\\-');

    it('lists from the search index with the criteria as a query, passing paging and sort through', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      const page = { content: [{ id: mockSupportErrandId }], totalElements: 1 };
      api.get.mockResolvedValue({ data: page, message: 'success' });
      const res = mockRes();

      await controller.errands(mockReq(), ...errandsArgs({ page: 2, size: 25, status: 'NEW,ONGOING', channel: 'EMAIL', sort: 'touched,desc' }), res);

      expect(api.get).toHaveBeenCalledTimes(1);
      const [config] = api.get.mock.calls[0];
      expect(config.url.startsWith(SEARCH_URL)).toBe(true);
      expect(Object.fromEntries(new URL(config.url, 'http://draken.local').searchParams)).toEqual({
        page: '2',
        size: '25',
        query: 'channel:("EMAIL") AND status:("NEW" OR "ONGOING")',
        sort: 'touched,desc',
      });
      expect(config).toMatchObject({ propagateClientError: true, mapUnauthorizedToForbidden: true, propagateServerErrors: [503, 504] });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(page);
    });

    it('lists every errand without a query when nothing is filtered on', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      api.get.mockResolvedValue({ data: { content: [] }, message: 'success' });

      await controller.errands(mockReq(), ...errandsArgs(), mockRes());

      expect(api.get.mock.calls[0][0].url).toBe(`${SEARCH_URL}page=0&size=8`);
    });

    it('matches the free text and the party id the query names in the fields the filter matched', async () => {
      const { controller, api, organization } = makeController();
      enableErrandSearch(controller);
      organization.getPartyIdByOrganizationNumber.mockResolvedValue(mockOrganizationPartyId);
      api.get.mockResolvedValue({ data: { content: [] }, message: 'success' });

      await controller.errands(mockReq(), ...errandsArgs({ query: mockOrganizationNumber }), mockRes());

      const query = upstreamSearchQuery(api.get.mock.calls[0][0].url);
      expect(query).toContain(`errandNumber:(*${escapedHyphens(mockOrganizationNumber)}*)`);
      expect(query).toContain(`stakeholders.externalId:(*${escapedHyphens(mockOrganizationPartyId)}*)`);
    });

    it('asks for the labels of the generic selections by id', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      api.get.mockImplementation(async ({ url }: { url: string }) =>
        url.includes('/metadata/labels')
          ? { data: { labelStructure: labelFilterLabelStructure }, message: 'success' }
          : { data: { content: [] }, message: 'success' },
      );
      const labelFilter = JSON.stringify([
        { groupKey: 'classification', fieldKey: 'category', resourcePath: 'CATEGORY/HSL/REHAB' },
        { groupKey: 'classification', fieldKey: 'type', resourcePath: 'CATEGORY/HSL/REHAB/MISSED' },
      ]);

      await controller.errands(mockReq(), ...errandsArgs({ status: 'NEW', labelFilter }), mockRes());

      expect(api.get.mock.calls[0][0].url).toBe(`${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/metadata/labels`);
      expect(upstreamSearchQuery(api.get.mock.calls[1][0].url)).toBe('labels.metadataLabelId:("type-label-id") AND status:("NEW")');
    });

    it('resolves the category filters to label ids, which only the index needs', async () => {
      const { controller, api } = makeController();
      api.get.mockImplementation(async ({ url }: { url: string }) =>
        url.includes('/metadata/labels')
          ? { data: { labelStructure: classificationLabelStructure }, message: 'success' }
          : { data: { content: [] }, message: 'success' },
      );
      const categoryFilter = { labelCategory: 'CATEGORY/HSL/REHAB', labelType: 'CATEGORY/HSL/REHAB/MISSED,CATEGORY/HSL/REHAB/OTHER' };

      await controller.errands(mockReq(), ...errandsArgs(categoryFilter), mockRes());
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get.mock.calls[0][0].url.startsWith(FILTER_URL)).toBe(true);

      api.get.mockClear();
      enableErrandSearch(controller);
      await controller.errands(mockReq(), ...errandsArgs(categoryFilter), mockRes());
      expect(upstreamSearchQuery(api.get.mock.calls[1][0].url)).toBe('labels.metadataLabelId:("type-label-id" OR "other-type-label-id")');
    });

    it('asks the filter endpoint when a selected label is missing from the metadata', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      api.get.mockImplementation(async ({ url }: { url: string }) =>
        url.includes('/metadata/labels')
          ? { data: { labelStructure: classificationLabelStructure }, message: 'success' }
          : { data: { content: [] }, message: 'success' },
      );

      await controller.errands(mockReq(), ...errandsArgs({ labelCategory: 'CATEGORY/REMOVED' }), mockRes());

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(api.get.mock.calls[1][0].url.startsWith(FILTER_URL)).toBe(true);
      expect(upstreamFilter(api.get.mock.calls[1][0].url)).toBe("(exists(labels.metadataLabel.resourcePath:'CATEGORY/REMOVED'))");
    });

    it('asks the filter endpoint when the query is too long for the index', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      api.get.mockResolvedValue({ data: { content: [] }, message: 'success' });

      await controller.errands(mockReq(), ...errandsArgs({ query: 'a'.repeat(200) }), mockRes());

      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get.mock.calls[0][0].url.startsWith(FILTER_URL)).toBe(true);
    });

    it('falls back to the filter endpoint while the search cluster is down', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      const page = { content: [{ id: mockSupportErrandId }], totalElements: 1 };
      api.get.mockRejectedValueOnce(new HttpException(503, 'Search not available')).mockResolvedValueOnce({ data: page, message: 'success' });
      const res = mockRes();

      await controller.errands(mockReq(), ...errandsArgs({ status: 'NEW' }), res);

      expect(api.get.mock.calls[0][0].url.startsWith(SEARCH_URL)).toBe(true);
      expect(api.get.mock.calls[1][0]).toEqual({ url: `${FILTER_URL}page=0&size=8&filter=%28status%3A%27NEW%27%29` });
      expect(res.body).toEqual(page);
    });

    it('tells the user to narrow a search the index gave up on', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      api.get.mockRejectedValue(new HttpException(504, 'Gateway Timeout'));

      await expect(controller.errands(mockReq(), ...errandsArgs({ query: mockFirstName }), mockRes())).rejects.toMatchObject({
        status: 504,
        message: 'Sökningen tog för lång tid. Förfina sökningen och försök igen.',
      });
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('passes a refusal of the index on instead of asking the filter endpoint around it', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      api.get.mockRejectedValue(new HttpException(403, 'The query names a resource the user may not read'));

      await expect(controller.errands(mockReq(), ...errandsArgs({ query: mockFirstName }), mockRes())).rejects.toMatchObject({
        status: 403,
      });
      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it('counts from the index on the sprint target while the list still asks the filter endpoint', async () => {
      const { controller, api } = makeController();
      onSprintTarget(controller);
      api.get.mockResolvedValue({
        data: { count: 5, group: { property: 'status', buckets: [{ value: 'NEW', count: 5 }], withoutValue: 0, withheld: 0 } },
        message: 'success',
      });
      const res = mockRes();

      await controller.countErrandsByStatusGroups(mockReq(), ...statusGroupCountArgs([['NEW'], ['SOLVED']]), res);
      await controller.errands(mockReq(), ...errandsArgs({ status: 'NEW' }), mockRes());

      const [countConfig, listConfig] = api.get.mock.calls.map(([config]) => config);
      expect(countConfig.url.startsWith(`${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands/search/count?`)).toBe(true);
      expect(new URL(countConfig.url, 'http://draken.local').searchParams.get('groupBy')).toBe('status');
      expect(res.body).toEqual({ counts: [5, 0] });
      expect(listConfig.url.startsWith(FILTER_URL)).toBe(true);
    });

    it('counts every status group from one breakdown of the index', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      api.get.mockResolvedValue({
        data: {
          count: 9,
          group: {
            property: 'status',
            buckets: [
              { value: 'NEW', count: 3 },
              { value: 'SOLVED', count: 3 },
              { value: 'ONGOING', count: 2 },
              { value: 'PENDING', count: 1 },
            ],
            withoutValue: 0,
            withheld: 0,
          },
        },
        message: 'success',
      });
      const res = mockRes();

      await controller.countErrandsByStatusGroups(
        mockReq(),
        ...statusGroupCountArgs([['NEW'], ['ONGOING', 'PENDING'], ['SUSPENDED']], { priority: 'HIGH' }),
        res,
      );

      expect(api.get).toHaveBeenCalledTimes(1);
      const [config] = api.get.mock.calls[0];
      expect(config.url.startsWith(`${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/errands/search/count?`)).toBe(true);
      expect(Object.fromEntries(new URL(config.url, 'http://draken.local').searchParams)).toEqual({ groupBy: 'status', query: 'priority:("HIGH")' });
      expect(res.body).toEqual({ counts: [3, 3, 0] });
    });

    it('counts each status group on the filter endpoint while the search cluster is down', async () => {
      const { controller, api } = makeController();
      enableErrandSearch(controller);
      api.get.mockRejectedValueOnce(new HttpException(503, 'Search not available')).mockResolvedValue({ data: { count: 4 }, message: 'success' });
      const res = mockRes();

      await controller.countErrandsByStatusGroups(mockReq(), ...statusGroupCountArgs([['NEW'], ['SOLVED']]), res);

      expect(api.get.mock.calls.slice(1).map(([config]) => upstreamFilter(config.url))).toEqual(["(status:'NEW')", "(status:'SOLVED')"]);
      expect(res.body).toEqual({ counts: [4, 4] });
    });
  });

  describe('registerSupportErrand', () => {
    /** What the handler chose in the registration form: an ordinary deviation, at their own place. */
    const deviationAtOwnPlace = { reportTypeLabelId: 'deviation', locationLabelId: 'unit' };

    it('creates the errand owned by the requesting user from what the handler chose', async () => {
      const { controller, api } = makeRegistrationController();
      const res = mockRes();

      await controller.registerSupportErrand(mockReq(mockUser()), deviationAtOwnPlace, res);

      const [config] = api.post.mock.calls[0];
      expect(config.url).toBe(`${MUNICIPALITY_ID}/${NAMESPACE}/errands`);
      expect(config.data).toEqual({
        reporterUserId: mockAdUsername,
        assignedUserId: mockAdUsername,
        labels: [
          expect.objectContaining({ resourcePath: 'REPORT_TYPE' }),
          expect.objectContaining({ resourcePath: 'REPORT_TYPE/DEVIATION' }),
          expect.objectContaining({ resourcePath: 'LOCATION/VOF' }),
          expect.objectContaining({ resourcePath: 'LOCATION/VOF/HEMTJANST_NORR' }),
        ],
        parameters: [{ key: 'eventType', displayName: 'Rapporttyp', values: ['AVVIKELSE'] }],
        priority: 'MEDIUM',
        status: 'NEW',
        channel: 'WEB_UI',
        title: 'Empty errand',
      });
      // A registration is the handler's own act, so the subscribers hear of it.
      expect(config).not.toHaveProperty('notifySubscribers');
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({ id: mockSupportErrandId });
    });

    it('does not create an investigation-owned errand while its registration policy is unavailable', async () => {
      const { controller, api } = makeController('unavailable');

      await expect(controller.registerSupportErrand(mockReq(), deviationAtOwnPlace, mockRes())).rejects.toMatchObject({
        status: 503,
        message: 'Support errand registration policy is temporarily unavailable',
      });
      expect(api.get).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('fetches the namespace metadata before creating the errand', async () => {
      const { controller, api } = makeRegistrationController();

      await controller.registerSupportErrand(mockReq(), deviationAtOwnPlace, mockRes());

      expect(api.get).toHaveBeenCalledWith({ url: `${SUPPORT_SERVICE}/${MUNICIPALITY_ID}/${NAMESPACE}/metadata` }, expect.anything());
    });

    // An errand created without a phase stands outside the workflow: the phase strip has nothing to
    // advance from, and no transition can reach it either.
    it('starts the errand in the first phase, with the status that phase allows', async () => {
      const { controller, api } = makeRegistrationController();
      api.get.mockResolvedValue({
        data: {
          ...registrationMetadata,
          phases: [
            { id: 'review', name: 'REVIEW', phaseOrder: 1, allowedStatuses: ['REVIEW'] },
            { id: 'actualization', name: 'ACTUALIZATION', phaseOrder: 0, allowedStatuses: ['NEW'] },
          ],
        },
        message: 'success',
      });

      await controller.registerSupportErrand(mockReq(mockUser()), deviationAtOwnPlace, mockRes());

      expect(api.post.mock.calls[0][0].data).toMatchObject({ activePhaseId: 'actualization', status: 'NEW' });
    });

    it('creates the errand without a phase when the namespace has no workflow', async () => {
      const { controller, api } = makeRegistrationController();

      await controller.registerSupportErrand(mockReq(mockUser()), deviationAtOwnPlace, mockRes());

      expect(api.post.mock.calls[0][0].data).not.toHaveProperty('activePhaseId');
    });

    it('responds 500 when the API returns an empty body', async () => {
      const { controller, api } = makeRegistrationController();
      api.post.mockResolvedValue({ data: '', message: 'success' });
      const res = mockRes();

      await controller.registerSupportErrand(mockReq(), deviationAtOwnPlace, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toBe('Something went wrong when initiating support errand');
    });

    it('rethrows when the API call fails', async () => {
      const { controller, api } = makeRegistrationController();
      api.post.mockRejectedValue(new Error('upstream down'));

      await expect(controller.registerSupportErrand(mockReq(), deviationAtOwnPlace, mockRes())).rejects.toThrow('upstream down');
    });
  });

  describe('updateSupportErrand channel', () => {
    // The channel decides whether the avvikelse report may be filled in, so it stays as it came in.
    it('refuses to change the channel where the profile has a report', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { version: 7, status: 'ONGOING', channel: 'ESERVICE' }, headers: { etag: '"7"' }, message: 'success' });

      await expect(controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { channel: 'WEB_UI' }, mockRes())).rejects.toMatchObject({
        status: 409,
      });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('lets the unchanged channel through, as the errand form always sends it', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { version: 7, status: 'ONGOING', channel: 'ESERVICE' }, headers: { etag: '"7"' }, message: 'success' });

      await controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { channel: 'ESERVICE', title: 'Ny rubrik' }, mockRes());

      expect(api.patch).toHaveBeenCalledTimes(1);
    });

    it('leaves the channel editable where the profile has no report', async () => {
      const { controller, api, investigationPolicy } = makeController();
      (investigationPolicy as { profile: unknown }).profile = { documents: [] };
      api.get.mockResolvedValue({ data: { version: 7, status: 'ONGOING', channel: 'PHONE' }, headers: { etag: '"7"' }, message: 'success' });

      await controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { channel: 'EMAIL' }, mockRes());

      expect(api.patch.mock.calls[0][0].data).toEqual({ channel: 'EMAIL' });
    });
  });

  describe('updateSupportErrand', () => {
    it('patches the errand with the supplied body and responds 200', async () => {
      const { controller, api } = makeController();
      api.patch.mockResolvedValue({ data: { id: mockSupportErrandId }, message: 'success' });
      const res = mockRes();

      await controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { title: 'Ny titel' }, res);

      const [config] = api.patch.mock.calls[0];
      expect(config.url).toBe(`${MUNICIPALITY_ID}/${NAMESPACE}/errands/${mockSupportErrandId}`);
      expect(config.data).toEqual({ title: 'Ny titel' });
      expect(config.headers).toEqual({ 'If-Match': '"7"' });
      expect(config.followLocation).toBe(false);
      expect(config.propagateClientError).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('rethrows when the patch fails', async () => {
      const { controller, api } = makeController();
      api.patch.mockRejectedValue(new Error('upstream down'));

      await expect(controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { title: 'x' }, mockRes())).rejects.toThrow('upstream down');
    });

    it.each([
      [ABSENT_HEADER, 428, 'If-Match is required when updating a support errand'],
      ['7', 400, 'If-Match must contain one strong numeric ETag'],
      ['W/"7"', 400, 'If-Match must contain one strong numeric ETag'],
      ['"07"', 400, 'If-Match must contain one strong numeric ETag'],
      ['"7", "8"', 400, 'If-Match must contain one strong numeric ETag'],
    ] as const)('rejects a missing or malformed generic mutation precondition %s', async (ifMatch, status, message) => {
      const { controller, api } = makeController();

      await expect(controller.updateSupportErrand(mockReq(), mockSupportErrandId, ifMatch, { title: 'x' }, mockRes())).rejects.toMatchObject({
        status,
        message,
      });
      expect(api.get).not.toHaveBeenCalled();
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('rejects a stale generic mutation before patching upstream', async () => {
      const { controller, api } = makeController();

      await expect(controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"6"', { title: 'x' }, mockRes())).rejects.toMatchObject({
        status: 412,
        message: 'If-Match does not match the current support errand version',
      });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('rejects generic changes to a locked errand', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { version: 7, status: 'SOLVED' }, headers: { etag: '"7"' }, message: 'success' });

      await expect(controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { title: 'x' }, mockRes())).rejects.toMatchObject({
        status: 409,
        message: 'Support errand status does not allow generic changes',
      });
      expect(api.patch).not.toHaveBeenCalled();
    });

    // RISK/HIGH_HSL and the ANALYSIS labels decide who reaches the errand and who is told about it, so they stay once
    // set. Where the investigation does not own the classification, Spara ärende sends the labels the page loaded.
    describe('the permanent labels', () => {
      const deviation: Label = { id: 'deviation', classification: 'report-type', resourceName: 'DEVIATION', resourcePath: 'REPORT_TYPE/DEVIATION' };
      const riskRoot: Label = { id: 'risk-root', classification: 'risk-root', resourceName: 'RISK', resourcePath: 'RISK' };
      const highHslRisk: Label = { id: 'high-hsl', classification: 'risk', resourceName: 'HIGH_HSL', resourcePath: 'RISK/HIGH_HSL' };
      const labelStructure: Label[] = [{ ...riskRoot, labels: [highHslRisk] }, deviation];

      const patchLabels = (errandLabels: Label[], sentLabels: Label[]) => {
        const { controller, api } = makeController('generic-errand');
        api.get.mockImplementation(async (config: { url: string }) =>
          config.url.endsWith('/metadata/labels')
            ? { data: { labelStructure }, message: 'success' }
            : { data: { version: 7, status: 'ONGOING', labels: errandLabels }, headers: { etag: '"7"' }, message: 'success' },
        );
        const patched = controller
          .updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { labels: sentLabels }, mockRes())
          .then(() => api.patch.mock.calls[0][0].data.labels);
        return { api, patched };
      };

      it('puts back a permanent label the write leaves out, with its root', async () => {
        const { patched } = patchLabels([deviation, riskRoot, highHslRisk], [deviation]);

        await expect(patched).resolves.toEqual([deviation, riskRoot, highHslRisk]);
      });

      it('reads no label metadata when the write keeps every label the errand carries', async () => {
        const { api, patched } = patchLabels([deviation, riskRoot, highHslRisk], [riskRoot, highHslRisk, deviation]);

        await expect(patched).resolves.toEqual([riskRoot, highHslRisk, deviation]);
        expect(api.get).toHaveBeenCalledTimes(1);
      });

      it('lets the write take off a label that is not permanent', async () => {
        const { patched } = patchLabels([deviation, riskRoot, highHslRisk], [riskRoot, highHslRisk]);

        await expect(patched).resolves.toEqual([riskRoot, highHslRisk]);
      });
    });

    it('rejects a malformed upstream ETag instead of falling back to the body version', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { version: 7, status: 'ONGOING' }, headers: { etag: 'W/"7"' }, message: 'success' });

      await expect(controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { title: 'x' }, mockRes())).rejects.toMatchObject({
        status: 502,
        message: 'Support Management response contains an invalid errand ETag',
      });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('rejects direct activePhaseId writes so transitions cannot bypass workflow validation', async () => {
      const { controller, api } = makeController();

      await expect(
        controller.updateSupportErrand(mockReq(), mockSupportErrandId, ABSENT_HEADER, { activePhaseId: 'unvalidated-target' }, mockRes()),
      ).rejects.toMatchObject({ status: 400, message: 'Use the phase transition endpoint to change the active phase' });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it.each([
      [{ status: 'SOLVED' }, 'status'],
      [{ resolution: 'CLOSED' }, 'resolution'],
      [{ suspension: { suspendedFrom: '2029-12-01T00:00:00Z', suspendedTo: '2030-01-01T00:00:00Z' } }, 'suspension'],
    ])('rejects direct %s writes so workflow commands cannot bypass current-state validation', async (data, _field) => {
      const { controller, api } = makeController();

      await expect(controller.updateSupportErrand(mockReq(), mockSupportErrandId, ABSENT_HEADER, data, mockRes())).rejects.toMatchObject({
        status: 400,
        message: 'Use the status transition endpoint to change status, resolution or suspension',
      });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('rejects direct assigned-user writes so the narrow administrator command cannot be bypassed', async () => {
      const { controller, api } = makeController();

      await expect(
        controller.updateSupportErrand(mockReq(), mockSupportErrandId, ABSENT_HEADER, { assignedUserId: mockAdUsername }, mockRes()),
      ).rejects.toMatchObject({ status: 400, message: 'Use the administrator endpoint to change the assigned user' });
      expect(api.get).not.toHaveBeenCalled();
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('rejects protected classification fields when an active investigation owns them', async () => {
      const { controller, api } = makeController('investigation');

      await expect(
        controller.updateSupportErrand(
          mockReq(),
          mockSupportErrandId,
          '"7"',
          { classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/TYPE' }, labels: [] },
          mockRes(),
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Use the investigation classification endpoint to update classification and labels',
      });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('rejects changing the parameter that selects the investigation classification owner', async () => {
      const { controller, api } = makeController('investigation');
      api.get.mockResolvedValue({
        data: { version: 7, status: 'ONGOING', parameters: [{ key: 'eventType', values: ['AVVIKELSE'] }] },
        headers: { etag: '"7"' },
        message: 'success',
      });

      await expect(
        controller.updateSupportErrand(
          mockReq(),
          mockSupportErrandId,
          '"7"',
          { parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }] },
          mockRes(),
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'The investigation classification owner parameter cannot be changed through the generic errand endpoint',
      });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('allows unrelated parameter updates when the investigation owner selector is unchanged', async () => {
      const { controller, api } = makeController('investigation');
      api.get.mockResolvedValue({
        data: {
          version: 7,
          status: 'ONGOING',
          parameters: [
            { key: 'eventType', values: ['AVVIKELSE'] },
            { key: 'other', values: ['before'] },
          ],
        },
        headers: { etag: '"7"' },
        message: 'success',
      });

      await controller.updateSupportErrand(
        mockReq(),
        mockSupportErrandId,
        '"7"',
        {
          parameters: [
            { key: 'eventType', values: ['AVVIKELSE'], version: 7 },
            { key: 'other', values: ['after'], version: 8 },
          ],
        },
        mockRes(),
      );

      expect(api.patch.mock.calls[0][0].data).toEqual({
        parameters: [
          { key: 'eventType', values: ['AVVIKELSE'] },
          { key: 'other', values: ['after'] },
        ],
      });
    });

    it('keeps generic classification writes where the investigation does not own classification, and strips server versions', async () => {
      const { controller, api } = makeController('generic-errand');
      const res = mockRes();

      await controller.updateSupportErrand(
        mockReq(),
        mockSupportErrandId,
        '"7"',
        {
          version: 9,
          classification: { category: 'LEGACY', type: 'LEGACY/TYPE' },
          labels: [],
          parameters: [{ key: 'legacy', values: ['value'], version: 3 }],
          stakeholders: [{ role: 'PRIMARY', contactChannels: [], parameters: [{ key: 'nested', values: [], version: 2 }] }],
        },
        res,
      );

      expect(api.patch.mock.calls[0][0].data).toEqual({
        classification: { category: 'LEGACY', type: 'LEGACY/TYPE' },
        labels: [],
        parameters: [{ key: 'legacy', values: ['value'] }],
        stakeholders: [{ role: 'PRIMARY', contactChannels: [], parameters: [{ key: 'nested', values: [] }] }],
      });
    });

    // IAF and VOF ask the unit manager what happened and where before the errand exists. The errand
    // still carries no classification: which legal bases apply is the investigation's answer, not
    // the reporter's.
    it('creates IAF/VOF errands from the chosen report type and place', async () => {
      const { controller, api } = makeRegistrationController();

      await controller.registerSupportErrand(mockReq(mockUser()), { reportTypeLabelId: 'abuse', locationLabelId: 'unit' }, mockRes());

      const body = api.post.mock.calls[0][0].data;
      expect(body).not.toHaveProperty('classification');
      expect(body.parameters).toEqual([{ key: 'eventType', displayName: 'Rapporttyp', values: ['AVVIKELSE'] }]);
      expect(body.labels.map(({ resourcePath }: Label) => resourcePath)).toEqual([
        'REPORT_TYPE',
        'REPORT_TYPE/ABUSE',
        'LOCATION/VOF',
        'LOCATION/VOF/HEMTJANST_NORR',
      ]);
      // The handler is not asked for a priority; every errand starts at Medel.
      expect(body.priority).toBe(Priority.MEDIUM);
      // Registered in Draken rather than reported through Katla, which is what opens its report.
      expect(body.channel).toBe('WEB_UI');
    });

    it('refuses to create the errand before the handler has said what is being reported', async () => {
      const { controller, api } = makeRegistrationController();

      await expect(controller.registerSupportErrand(mockReq(mockUser()), { locationLabelId: 'unit' }, mockRes())).rejects.toMatchObject({
        status: 400,
      });
      expect(api.post).not.toHaveBeenCalled();
    });

    // The form only ever offers the handler's own places, so a request naming another one is not a
    // handler who changed their mind - it is a client deciding something the configuration decides.
    it('refuses a place the handler is not configured for', async () => {
      const { controller, api, accessMapper } = makeRegistrationController();
      accessMapper.findAccountLabelPatterns.mockResolvedValue(['LOCATION/VOF/ANNAN_ENHET/**']);

      await expect(
        controller.registerSupportErrand(mockReq(mockUser()), { reportTypeLabelId: 'abuse', locationLabelId: 'unit' }, mockRes()),
      ).rejects.toMatchObject({ status: 400 });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('offers the handler the configured report types and their own places', async () => {
      const { controller, accessMapper } = makeRegistrationController();

      const options = await controller.getNewErrandOptions(mockReq(mockUser()));

      expect(options.reportTypes.map(({ resourcePath }) => resourcePath)).toEqual(['REPORT_TYPE/DEVIATION', 'REPORT_TYPE/ABUSE']);
      expect(options.locations).toEqual([{ labelId: 'unit', displayName: 'Hemtjänst Norr', resourcePath: 'LOCATION/VOF/HEMTJANST_NORR' }]);
      expect(options.priorities).toEqual([]);
      expect(accessMapper.findAccountLabelPatterns).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, expect.any(String), mockUser().username);
    });

    // A department is not a place: AccessMapper's patterns are matched against the units beneath it,
    // and an errand filed on the department would have no manager to resolve.
    it('leaves out a configured pattern that is not a place', async () => {
      const { controller, accessMapper } = makeRegistrationController();
      accessMapper.findAccountLabelPatterns.mockResolvedValue(['LOCATION/VOF/**', 'LOCATION/**']);

      const options = await controller.getNewErrandOptions(mockReq(mockUser()));

      expect(options.locations).toEqual([]);
    });

    it('offers the place the handler is employed at, and nothing AccessMapper configures besides', async () => {
      const { controller, accessMapper } = makeEmployedRegistrationController();

      const options = await controller.getNewErrandOptions(mockReq(mockUser()));

      expect(options.locationSource).toBe('employment');
      expect(options.locations).toEqual([
        { labelId: 'employment-unit', displayName: 'Hemtjänst Syd', resourcePath: `LOCATION/VOF/${EMPLOYMENT_ORGANIZATION_ID}` },
      ]);
      expect(accessMapper.findAccountLabelPatterns).not.toHaveBeenCalled();
    });

    it('offers the configured places when no employment is a place in the location tree', async () => {
      const { controller, employment } = makeEmployedRegistrationController();
      employment.readEmployments.mockResolvedValue([{ orgId: EMPLOYMENT_ORGANIZATION_ID + 1, isMainEmployment: true }]);

      const options = await controller.getNewErrandOptions(mockReq(mockUser()));

      expect(options.locationSource).toBe('access');
      expect(options.locations.map(({ labelId }) => labelId)).toEqual(['unit']);
    });

    it('still offers the configured places when the employments cannot be read', async () => {
      const { controller, employment } = makeEmployedRegistrationController();
      employment.readEmployments.mockRejectedValue(new HttpException(500, 'Internal server error'));

      const options = await controller.getNewErrandOptions(mockReq(mockUser()));

      expect(options.locationSource).toBe('access');
      expect(options.locations.map(({ labelId }) => labelId)).toEqual(['unit']);
    });

    it('registers the errand at the place the handler is employed at', async () => {
      const { controller, api } = makeEmployedRegistrationController();

      await controller.registerSupportErrand(mockReq(mockUser()), { reportTypeLabelId: 'deviation', locationLabelId: 'employment-unit' }, mockRes());

      expect(api.post.mock.calls[0][0].data.labels.map(({ resourcePath }: Label) => resourcePath)).toEqual([
        'REPORT_TYPE',
        'REPORT_TYPE/DEVIATION',
        'LOCATION/VOF',
        `LOCATION/VOF/${EMPLOYMENT_ORGANIZATION_ID}`,
      ]);
    });

    // Once the employment decides the place, a configured place is no longer the handler's to choose.
    it('refuses a configured place once the employment decides the place', async () => {
      const { controller, api } = makeEmployedRegistrationController();

      await expect(
        controller.registerSupportErrand(mockReq(mockUser()), { reportTypeLabelId: 'deviation', locationLabelId: 'unit' }, mockRes()),
      ).rejects.toMatchObject({ status: 400 });
      expect(api.post).not.toHaveBeenCalled();
    });

    it('fails closed for protected fields when ownership cannot be resolved, but not for unrelated updates', async () => {
      const unavailable = makeController('unavailable');

      await expect(
        unavailable.controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { labels: [] }, mockRes()),
      ).rejects.toMatchObject({ status: 503 });
      expect(unavailable.api.patch).not.toHaveBeenCalled();

      await unavailable.controller.updateSupportErrand(mockReq(), mockSupportErrandId, '"7"', { title: 'Unrelated update' }, mockRes());
      expect(unavailable.api.patch).toHaveBeenCalledTimes(1);
    });
  });

  describe('becomeAdminForSupportErrand', () => {
    it('sends only assignedUserId and returns the AccessMapper-filtered upstream response unchanged', async () => {
      const { controller, api } = makeController();
      api.patch.mockResolvedValue({ data: { id: mockSupportErrandId }, message: 'success' });
      const response = mockRes();

      await controller.becomeAdminForSupportErrand(mockReq(), mockSupportErrandId, '"7"', { assignedUserId: mockAdUsername }, response);

      expect(api.patch.mock.calls[0][0]).toEqual({
        url: `${MUNICIPALITY_ID}/${NAMESPACE}/errands/${mockSupportErrandId}`,
        baseURL: expect.any(String),
        data: { assignedUserId: mockAdUsername },
        headers: { 'If-Match': '"7"' },
        followLocation: false,
        propagateClientError: true,
      });
      expect(response.body).toEqual({ id: mockSupportErrandId });
    });

    it('rejects a missing assignment precondition before reading upstream', async () => {
      const { controller, api } = makeController();

      await expect(
        controller.becomeAdminForSupportErrand(mockReq(), mockSupportErrandId, ABSENT_HEADER, { assignedUserId: mockAdUsername }, mockRes()),
      ).rejects.toMatchObject({ status: 428, message: 'If-Match is required when updating a support errand' });
      expect(api.get).not.toHaveBeenCalled();
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('rejects a stale assignment before patching upstream', async () => {
      const { controller, api } = makeController();

      await expect(
        controller.becomeAdminForSupportErrand(mockReq(), mockSupportErrandId, '"6"', { assignedUserId: mockAdUsername }, mockRes()),
      ).rejects.toMatchObject({ status: 412, message: 'If-Match does not match the current support errand version' });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('rejects administrator changes to a locked errand', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { version: 7, status: 'SOLVED' }, headers: { etag: '"7"' }, message: 'success' });

      await expect(
        controller.becomeAdminForSupportErrand(mockReq(), mockSupportErrandId, '"7"', { assignedUserId: mockAdUsername }, mockRes()),
      ).rejects.toMatchObject({ status: 409, message: 'Support errand status does not allow administrator changes' });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it.each(['SUSPENDED', 'ASSIGNED', 'REOPENED'])('allows administrator assignment to resume an errand in %s', async status => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: { version: 7, status }, headers: { etag: '"7"' }, message: 'success' });
      api.patch.mockResolvedValue({ data: { id: mockSupportErrandId, status }, message: 'success' });

      await controller.becomeAdminForSupportErrand(mockReq(), mockSupportErrandId, '"7"', { assignedUserId: mockAdUsername }, mockRes());

      expect(api.patch).toHaveBeenCalledTimes(1);
    });

    /** The errand as Support Management answers it, and the signed-in user's subscriber, which follows it. */
    const followedBySignedInUser = async ({ url }: { url: string }) => {
      if (url.includes('/subscribers?')) {
        return { data: url.includes(mockAdUsername) ? [{ id: 'own-subscriber' }] : [], message: 'success' };
      }
      if (url.endsWith('/own-subscriber/subscriptions')) {
        return { data: [{ id: 'followed', target: { type: 'ERRAND', id: mockSupportErrandId } }], message: 'success' };
      }
      return { data: { version: 7, status: 'ONGOING', assignedUserId: mockAdUsername }, headers: { etag: '"7"' }, message: 'success' };
    };

    it('stops the user following an errand they give to someone else, where the assignee alone follows it', async () => {
      const { controller, api, investigationPolicy } = makeController();
      Object.assign(investigationPolicy, { assigneeFollowsErrand: true });
      api.get.mockImplementation(followedBySignedInUser);

      await controller.becomeAdminForSupportErrand(mockReq(), mockSupportErrandId, '"7"', { assignedUserId: 'next.handler' }, mockRes());

      expect(api.delete.mock.calls.map(([config]) => config.url)).toEqual([expect.stringMatching(/\/own-subscriber\/subscriptions\/followed$/u)]);
      // Support Management subscribes the new assignee itself.
      expect(api.post).not.toHaveBeenCalled();
    });

    it('keeps the following of a user who assigns the errand to themselves', async () => {
      const { controller, api, investigationPolicy } = makeController();
      Object.assign(investigationPolicy, { assigneeFollowsErrand: true });
      api.get.mockImplementation(followedBySignedInUser);

      await controller.becomeAdminForSupportErrand(mockReq(), mockSupportErrandId, '"7"', { assignedUserId: mockAdUsername }, mockRes());

      expect(api.delete).not.toHaveBeenCalled();
    });

    it('leaves the following to Support Management where the profile does not say so', async () => {
      const { controller, api } = makeController();
      api.get.mockImplementation(followedBySignedInUser);

      await controller.becomeAdminForSupportErrand(mockReq(), mockSupportErrandId, '"7"', { assignedUserId: 'next.handler' }, mockRes());

      expect(api.get.mock.calls.some(([config]) => config.url.includes('/subscribers'))).toBe(false);
      expect(api.delete).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('preparedErrandResponse', () => {
    const errandWith = (stakeholders: SupportErrand['stakeholders']): SupportErrand => ({ stakeholders }) as SupportErrand;

    it('resolves the personal number of a PRIVATE primary stakeholder', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: mockPersonNumber, message: 'success' });
      const errand = errandWith([{ role: 'PRIMARY', externalId: mockCitizenPartyId, externalIdType: ExternalIdType.PRIVATE }]);

      const result = await controller.preparedErrandResponse(errand, mockReq());

      expect(api.get).toHaveBeenCalledWith({ url: `${CITIZEN_SERVICE}/${MUNICIPALITY_ID}/${mockCitizenPartyId}/personnumber` }, expect.anything());
      expect((result.data.stakeholders![0] as { personNumber?: string }).personNumber).toBe(mockPersonNumber);
      expect(result.message).toBe('success');
    });

    it('resolves personal numbers for EMPLOYEE stakeholders too', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: mockPersonNumber, message: 'success' });
      const errand = errandWith([{ role: 'PRIMARY', externalId: mockCitizenPartyId, externalIdType: ExternalIdType.EMPLOYEE }]);

      const result = await controller.preparedErrandResponse(errand, mockReq());

      expect(api.get).toHaveBeenCalledWith({ url: `${CITIZEN_SERVICE}/${MUNICIPALITY_ID}/${mockCitizenPartyId}/personnumber` }, expect.anything());
      expect((result.data.stakeholders![0] as { personNumber?: string }).personNumber).toBe(mockPersonNumber);
    });

    it('skips company and enterprise stakeholders', async () => {
      const { controller, api } = makeController();
      const errand = errandWith([
        { role: 'PRIMARY', externalId: mockOrganizationPartyId, externalIdType: ExternalIdType.COMPANY },
        { role: 'CONTACT', externalId: mockOrganizationPartyId, externalIdType: ExternalIdType.ENTERPRISE },
      ]);

      await controller.preparedErrandResponse(errand, mockReq());

      expect(api.get).not.toHaveBeenCalled();
    });

    it('leaves the personal number undefined when the lookup fails', async () => {
      const { controller, api } = makeController();
      api.get.mockRejectedValue(new Error('404'));
      const errand = errandWith([{ role: 'PRIMARY', externalId: mockCitizenPartyId, externalIdType: ExternalIdType.PRIVATE }]);

      const result = await controller.preparedErrandResponse(errand, mockReq());

      expect((result.data.stakeholders![0] as { personNumber?: string }).personNumber).toBeUndefined();
    });

    it('resolves personal numbers for non-primary contacts as well', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: mockPersonNumber, message: 'success' });
      const errand = errandWith([
        { role: 'PRIMARY', externalId: mockCitizenPartyId, externalIdType: ExternalIdType.PRIVATE },
        { role: 'CONTACT', externalId: mockSecondaryCitizenPartyId, externalIdType: ExternalIdType.PRIVATE },
      ]);

      const result = await controller.preparedErrandResponse(errand, mockReq());

      expect(api.get).toHaveBeenCalledTimes(2);
      expect((result.data.stakeholders![1] as { personNumber?: string }).personNumber).toBe(mockPersonNumber);
    });

    it('makes no calls for an errand without stakeholders', async () => {
      const { controller, api } = makeController();

      const result = await controller.preparedErrandResponse({} as SupportErrand, mockReq());

      expect(api.get).not.toHaveBeenCalled();
      expect(result).toEqual({ data: {}, message: 'success' });
    });

    it('does not mutate the errand or its stakeholders', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: mockPersonNumber, message: 'success' });
      const stakeholder = { role: 'PRIMARY', externalId: mockCitizenPartyId, externalIdType: ExternalIdType.PRIVATE };
      const errand = errandWith([stakeholder]);

      const result = await controller.preparedErrandResponse(errand, mockReq());

      expect(stakeholder).not.toHaveProperty('personNumber');
      expect(errand.stakeholders![0]).not.toHaveProperty('personNumber');
      expect(result.data).not.toBe(errand);
      expect((result.data.stakeholders![0] as { personNumber?: string }).personNumber).toBe(mockPersonNumber);
    });

    it('leaves stakeholders that are neither the first PRIMARY nor a contact untouched', async () => {
      const { controller, api } = makeController();
      api.get.mockResolvedValue({ data: mockPersonNumber, message: 'success' });
      const errand = errandWith([
        { role: 'PRIMARY', externalId: mockCitizenPartyId, externalIdType: ExternalIdType.PRIVATE },
        { role: 'PRIMARY', externalId: mockSecondaryCitizenPartyId, externalIdType: ExternalIdType.PRIVATE },
      ]);

      const result = await controller.preparedErrandResponse(errand, mockReq());

      expect(api.get).toHaveBeenCalledTimes(1);
      expect((result.data.stakeholders![1] as { personNumber?: string }).personNumber).toBeUndefined();
    });
  });
});

describe('SupportErrandDto write boundary', () => {
  it('accepts the optimistic locking version returned on existing parameters', async () => {
    const payload = plainToInstance(SupportErrandDto, {
      parameters: [
        { key: 'eventType', values: ['DEVIATION'], version: 1 },
        { key: 'eventConcerns', values: ['PERSON'], version: 2 },
      ],
    });

    await expect(validate(payload, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects jsonParameters so the generic errand PATCH cannot overwrite document arrays', async () => {
    const payload = plainToInstance(SupportErrandDto, {
      title: 'Allowed errand update',
      jsonParameters: [
        {
          key: 'avvikelse-plats-handelse',
          schemaId: '2281_avvikelse-plats-handelse_1.0',
          value: { description: 'Must stay read-only here' },
        },
      ],
    });

    const validationErrors = await validate(payload, { whitelist: true, forbidNonWhitelisted: true });

    expect(validationErrors.some(error => error.property === 'jsonParameters')).toBe(true);
  });
});

describe('AssignSupportErrandDto write boundary', () => {
  it('accepts only an explicit assignee and rejects status changes on the admin route', async () => {
    const valid = plainToInstance(AssignSupportErrandDto, { assignedUserId: mockAdUsername });
    const invalid = plainToInstance(AssignSupportErrandDto, {
      assignedUserId: mockAdUsername,
      status: 'ONGOING',
    });

    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    expect((await validate(invalid, { whitelist: true, forbidNonWhitelisted: true })).some(error => error.property === 'status')).toBe(true);
  });
});

describe('UpdateSupportErrandStatusDto', () => {
  it('requires exact source state and rejects unrelated errand fields', async () => {
    const valid = plainToInstance(UpdateSupportErrandStatusDto, {
      expectedVersion: 7,
      expectedStatus: 'ONGOING',
      status: 'SOLVED',
      resolution: 'CLOSED',
    });
    const invalid = plainToInstance(UpdateSupportErrandStatusDto, {
      expectedVersion: -1,
      expectedStatus: '',
      status: '',
      title: 'not writable here',
    });

    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    const serializedErrors = JSON.stringify(await validate(invalid, { whitelist: true, forbidNonWhitelisted: true }));
    expect(serializedErrors).toMatch(/expectedVersion/u);
    expect(serializedErrors).toMatch(/expectedStatus/u);
    expect(serializedErrors).toMatch(/status/u);
    expect(serializedErrors).toMatch(/title/u);
  });
});

describe('updateSupportErrandStatus', () => {
  const errandUrl = `${MUNICIPALITY_ID}/${NAMESPACE}/errands/${mockSupportErrandId}`;
  const metadataUrl = `${MUNICIPALITY_ID}/${NAMESPACE}/metadata`;
  const statuses = [{ name: 'ONGOING' }, { name: 'SOLVED' }, { name: 'RETIRED', deprecated: true }];

  /**
   * An errand may not be closed while a measure still asks something of somebody. The rule sits on
   * the status transition, so it holds however the errand is being closed.
   */
  describe('the measures before closing', () => {
    const makeClosingController = (measures: unknown[]) => {
      const made = makeController();
      made.api.get.mockImplementation(async (config: { url?: string }) => {
        if (config.url === metadataUrl) return { data: { statuses }, message: 'success' };
        if (config.url === `${errandUrl}/measures`) return { data: measures, message: 'success' };
        return { data: { id: mockSupportErrandId, status: 'ONGOING', version: 7 }, message: 'success', headers: { etag: '"7"' } };
      });
      return made;
    };

    const close = (controller: SupportErrandController) =>
      controller.updateSupportErrandStatus(
        mockReq(),
        mockSupportErrandId,
        { expectedVersion: 7, expectedStatus: 'ONGOING', status: 'SOLVED', resolution: 'CLOSED' },
        mockRes(),
      );

    it('refuses while a measure is still an undecided proposal', async () => {
      const { controller, api } = makeClosingController([{ id: 'a' }]);

      await expect(close(controller)).rejects.toMatchObject({ status: 422, message: expect.stringContaining('väntar på beslut') });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('refuses while an approved planned measure has not been followed up', async () => {
      const { controller, api } = makeClosingController([{ id: 'b', accept: 'TRUE', plannedComplete: '2026-09-30T00:00:00Z' }]);

      await expect(close(controller)).rejects.toMatchObject({ status: 422, message: expect.stringContaining('inte uppföljd') });
      expect(api.patch).not.toHaveBeenCalled();
    });

    it('closes once every measure is handled', async () => {
      const { controller, api } = makeClosingController([
        { id: 'b', accept: 'TRUE', plannedComplete: '2026-09-30T00:00:00Z', executed: '2026-09-29T00:00:00Z', result: 'COMPLETED' },
        { id: 'd', accept: 'FALSE' },
      ]);

      await close(controller);

      expect(api.patch).toHaveBeenCalledWith(
        expect.objectContaining({ url: errandUrl, data: { status: 'SOLVED', resolution: 'CLOSED' } }),
        expect.anything(),
      );
    });

    // A close from an earlier phase writes each phase on the way and reads the errand back after each. Somebody may
    // propose a measure in between - the phases on the way are open - and that read would carry their write along.
    it('stops writing as soon as a measure is proposed while the close steps through the phases', async () => {
      const { controller, api } = makeController();
      const phases = [
        { id: 'review', name: 'REVIEW', allowedStatuses: ['REVIEW'], transitions: [{ id: 't1', targetPhaseId: 'investigation' }] },
        { id: 'investigation', name: 'INVESTIGATION', allowedStatuses: ['INQUIRY'], transitions: [{ id: 't2', targetPhaseId: 'decision' }] },
        { id: 'decision', name: 'DECISION', allowedStatuses: ['DECISION'], transitions: [{ id: 't3', targetPhaseId: 'follow-up' }] },
        { id: 'follow-up', name: 'FOLLOW_UP', allowedStatuses: ['FOLLOW_UP', 'SOLVED'] },
      ];
      let errandRead = 0;
      api.get.mockImplementation(async (config: { url?: string }) => {
        if (config.url === metadataUrl) return { data: { statuses: [{ name: 'REVIEW' }, { name: 'SOLVED' }], phases }, message: 'success' };
        // The proposal lands right after the first phase step.
        if (config.url === `${errandUrl}/measures`) return { data: api.patch.mock.calls.length > 0 ? [{ id: 'proposed' }] : [], message: 'success' };
        errandRead += 1;
        const version = 6 + errandRead;
        return {
          data: { id: mockSupportErrandId, status: 'REVIEW', phases: [{ phaseId: 'review' }], assignedUserId: mockUser().username, version },
          message: 'success',
          headers: { etag: `"${version}"` },
        };
      });

      await expect(
        controller.updateSupportErrandStatus(
          mockReq(),
          mockSupportErrandId,
          { expectedVersion: 7, expectedStatus: 'REVIEW', status: 'SOLVED', closingMotivation: 'Dubblettanmälan.' },
          mockRes(),
        ),
      ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('väntar på beslut') });
      // The first step was written before the proposal; neither the next step nor the close is.
      expect(api.patch.mock.calls.map(([config]) => config.data)).toEqual([{ activePhaseId: 'investigation', status: 'INQUIRY' }]);
    });

    // Any other status is not a close, so the measures are nobody's business here.
    it('does not read the measures for a transition that is not a close', async () => {
      const { controller, api } = makeClosingController([{ id: 'a' }]);

      await controller.updateSupportErrandStatus(
        mockReq(),
        mockSupportErrandId,
        { expectedVersion: 7, expectedStatus: 'ONGOING', status: 'ONGOING' },
        mockRes(),
      );

      expect(api.get).not.toHaveBeenCalledWith(expect.objectContaining({ url: `${errandUrl}/measures` }), expect.anything());
    });
  });

  it('applies one configured transition with If-Match and returns the fresh errand version', async () => {
    const { controller, api } = makeController();
    let errandRead = 0;
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url === metadataUrl) return { data: { statuses }, message: 'success' };
      if (config.url === `${errandUrl}/measures`) return { data: [], message: 'success' };
      errandRead += 1;
      return errandRead === 1
        ? {
            data: { id: mockSupportErrandId, status: 'ONGOING', version: 7 },
            message: 'success',
            headers: { etag: '"7"' },
          }
        : {
            data: { id: mockSupportErrandId, status: 'SOLVED', resolution: 'CLOSED', version: 8 },
            message: 'success',
            headers: { etag: '"8"' },
          };
    });
    const req = mockReq();
    const res = mockRes();

    await controller.updateSupportErrandStatus(
      req,
      mockSupportErrandId,
      { expectedVersion: 7, expectedStatus: 'ONGOING', status: 'SOLVED', resolution: 'CLOSED' },
      res,
    );

    expect(api.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: errandUrl,
        data: { status: 'SOLVED', resolution: 'CLOSED' },
        headers: { 'If-Match': '"7"' },
        followLocation: false,
        propagateClientError: true,
      }),
      req.user,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: 'SOLVED', resolution: 'CLOSED', version: 8 });
  });

  // Support Management refuses a jump between phases, so closing from Granskning walks the chain.
  it('steps an errand closed in an earlier phase through each transition before closing it, its motivation noted first', async () => {
    const { controller, api } = makeController();
    const phases = [
      { id: 'review', name: 'REVIEW', allowedStatuses: ['REVIEW'], transitions: [{ id: 't1', targetPhaseId: 'investigation' }] },
      { id: 'investigation', name: 'INVESTIGATION', allowedStatuses: ['INQUIRY'], transitions: [{ id: 't2', targetPhaseId: 'decision' }] },
      { id: 'decision', name: 'DECISION', allowedStatuses: ['DECISION'], transitions: [{ id: 't3', targetPhaseId: 'follow-up' }] },
      { id: 'follow-up', name: 'FOLLOW_UP', allowedStatuses: ['FOLLOW_UP', 'SOLVED'] },
    ];
    let errandRead = 0;
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url === metadataUrl) return { data: { statuses: [{ name: 'REVIEW' }, { name: 'SOLVED' }], phases }, message: 'success' };
      if (config.url === `${errandUrl}/measures`) return { data: [], message: 'success' };
      errandRead += 1;
      const version = 6 + errandRead;
      return {
        data: { id: mockSupportErrandId, status: 'REVIEW', phases: [{ phaseId: 'review' }], assignedUserId: mockUser().username, version },
        message: 'success',
        headers: { etag: `"${version}"` },
      };
    });
    const req = mockReq();

    await controller.updateSupportErrandStatus(
      req,
      mockSupportErrandId,
      { expectedVersion: 7, expectedStatus: 'REVIEW', status: 'SOLVED', closingMotivation: ' Dubblettanmälan. ' },
      mockRes(),
    );

    // The motivation is kept as the handler's service note, written before anything moves.
    expect(api.post.mock.calls.map(([config]) => [config.url, config.data.context, config.data.body])).toEqual([
      [`${errandUrl}/notes`, 'SERVICE_NOTE', 'Ärendet avslutades innan hela processen var klar. Orsak: Dubblettanmälan.'],
    ]);
    // The note moved the version by one, its own write; each step is conditioned on the version before it.
    expect(api.patch.mock.calls.map(([config]) => [config.data, config.headers])).toEqual([
      [{ activePhaseId: 'investigation', status: 'INQUIRY' }, { 'If-Match': '"8"' }],
      [{ activePhaseId: 'decision', status: 'DECISION' }, { 'If-Match': '"9"' }],
      [{ status: 'SOLVED', activePhaseId: 'follow-up' }, { 'If-Match': '"10"' }],
    ]);
    // Only the close is news to the errand's subscribers; the steps on the way are silent.
    expect(api.patch.mock.calls.map(([config]) => config.notifySubscribers)).toEqual([false, false, undefined]);
  });

  /** An IAF/VOF deviation in the given phase of the workflow, assigned to the closer. */
  const deviationIn = (activePhaseId: string) => {
    const { controller, api } = makeController();
    const phases = [
      { id: 'actualization', name: 'ACTUALIZATION', phaseOrder: 1, allowedStatuses: ['NEW'], transitions: [{ id: 't0', targetPhaseId: 'review' }] },
      { id: 'review', name: 'REVIEW', phaseOrder: 2, allowedStatuses: ['REVIEW'], transitions: [{ id: 't1', targetPhaseId: 'follow-up' }] },
      { id: 'follow-up', name: 'FOLLOW_UP', phaseOrder: 5, allowedStatuses: ['FOLLOW_UP', 'SOLVED'] },
    ];
    const status = activePhaseId === 'actualization' ? 'NEW' : 'REVIEW';
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url === metadataUrl) return { data: { statuses: [{ name: status }, { name: 'SOLVED' }], phases }, message: 'success' };
      if (config.url === `${errandUrl}/measures`) return { data: [], message: 'success' };
      return {
        data: { id: mockSupportErrandId, status, phases: [{ phaseId: activePhaseId }], assignedUserId: mockUser().username, version: 7 },
        message: 'success',
        headers: { etag: '"7"' },
      };
    });
    const close = (closingMotivation?: string) =>
      controller.updateSupportErrandStatus(
        mockReq(),
        mockSupportErrandId,
        { expectedVersion: 7, expectedStatus: status, status: 'SOLVED', ...(closingMotivation ? { closingMotivation } : {}) },
        mockRes(),
      );
    return { api, close };
  };

  // Handling starts in the review: an errand still registered is not closed early.
  it('refuses closing a deviation early before its handling has started', async () => {
    const { api, close } = deviationIn('actualization');

    await expect(close('Dubblettanmälan.')).rejects.toMatchObject({
      status: 422,
      message: 'Ärendet kan avslutas i förtid tidigast under granskning.',
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('refuses closing a deviation early without saying why', async () => {
    const { api, close } = deviationIn('review');

    await expect(close('   ')).rejects.toMatchObject({ status: 422, message: expect.stringContaining('Beskriv orsak till avslut') });
    await expect(close()).rejects.toMatchObject({ status: 422 });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  // Closing from the decision steps into the follow-up, which is the unit's to start, not LEX's.
  it('refuses a LEX handler closing through the follow-up phase before anything is written', async () => {
    const { controller, api } = makeController();
    (controller as unknown as { handlerRoles: unknown }).handlerRoles = [{ key: 'lex-ansvarig', label: 'LEX-ansvarig', group: 'MOCK_LEX_MANAGERS' }];
    const phases = [
      { id: 'decision', name: 'DECISION', allowedStatuses: ['DECISION'], transitions: [{ id: 't3', targetPhaseId: 'follow-up' }] },
      { id: 'follow-up', name: 'FOLLOW_UP', allowedStatuses: ['FOLLOW_UP', 'SOLVED'] },
    ];
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url === metadataUrl) return { data: { statuses: [{ name: 'DECISION' }, { name: 'SOLVED' }], phases }, message: 'success' };
      if (config.url === `${errandUrl}/measures`) return { data: [], message: 'success' };
      return {
        data: { id: mockSupportErrandId, status: 'DECISION', phases: [{ phaseId: 'decision' }], version: 7 },
        message: 'success',
        headers: { etag: '"7"' },
      };
    });

    await expect(
      controller.updateSupportErrandStatus(
        mockReq(mockUser({ groups: ['MOCK_LEX_MANAGERS'] })),
        mockSupportErrandId,
        { expectedVersion: 7, expectedStatus: 'DECISION', status: 'SOLVED' },
        mockRes(),
      ),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('Uppföljningen görs av enheten') });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'stale version',
      current: { status: 'ONGOING', version: 8 },
      command: { expectedVersion: 7, expectedStatus: 'ONGOING', status: 'SOLVED' },
      expected: { status: 409 },
    },
    {
      name: 'stale source status',
      current: { status: 'SOLVED', version: 7 },
      command: { expectedVersion: 7, expectedStatus: 'ONGOING', status: 'ONGOING' },
      expected: { status: 409 },
    },
    {
      name: 'unconfigured target',
      current: { status: 'ONGOING', version: 7 },
      command: { expectedVersion: 7, expectedStatus: 'ONGOING', status: 'UNKNOWN' },
      expected: { status: 400 },
    },
  ])('rejects $name before patching', async ({ current, command, expected }) => {
    const { controller, api } = makeController();
    api.get.mockImplementation(async (config: { url?: string }) =>
      config.url === metadataUrl ? { data: { statuses }, message: 'success' } : { data: current, message: 'success' },
    );

    await expect(controller.updateSupportErrandStatus(mockReq(), mockSupportErrandId, command, mockRes())).rejects.toMatchObject(expected);
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe('UpdateSupportErrandClassificationDto', () => {
  it('accepts only classification and label id references', async () => {
    const validPayload = plainToInstance(UpdateSupportErrandClassificationDto, {
      expectedVersion: 7,
      classifications: [
        { classification: { category: 'HSL', type: 'REHAB' }, categoryLabels: [{ id: 'label-id' }] },
        { classification: { category: 'SOL_LSS', type: 'LEGAL_CERTAINTY' }, categoryLabels: [{ id: 'other-label-id' }] },
      ],
      documentKey: 'utredning-enhetschef',
      documentETag: '"3"',
    });
    const invalidPayload = plainToInstance(UpdateSupportErrandClassificationDto, {
      expectedVersion: -1,
      classifications: [
        {
          classification: { category: 'HSL', type: 'REHAB', displayName: 'Not writable' },
          categoryLabels: [{ id: 'label-id', displayName: 'Not writable' }],
        },
      ],
      labels: [{ id: 'stale-full-label-list-is-not-writable' }],
      title: 'Not writable',
      documentKey: 'utredning-enhetschef',
      documentETag: '*',
    });

    await expect(validate(validPayload, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);

    const serializedErrors = JSON.stringify(await validate(invalidPayload, { whitelist: true, forbidNonWhitelisted: true }));
    expect(serializedErrors).toMatch(/title/);
    expect(serializedErrors).toMatch(/displayName/);
    expect(serializedErrors).toMatch(/documentETag/);
  });

  it('rejects empty classification values and an empty label selection', async () => {
    const payload = plainToInstance(UpdateSupportErrandClassificationDto, {
      expectedVersion: -1,
      classifications: [{ classification: { category: '', type: '' }, categoryLabels: [] }],
      documentKey: '',
      documentETag: 'W/"3"',
    });

    const serializedErrors = JSON.stringify(await validate(payload, { whitelist: true, forbidNonWhitelisted: true }));

    expect(serializedErrors).toMatch(/category/);
    expect(serializedErrors).toMatch(/type/);
    expect(serializedErrors).toMatch(/categoryLabels/);
    expect(serializedErrors).toMatch(/expectedVersion/);
    expect(serializedErrors).toMatch(/documentKey/);
    expect(serializedErrors).toMatch(/documentETag/);
  });

  it('rejects a command without any classification', async () => {
    const payload = plainToInstance(UpdateSupportErrandClassificationDto, {
      expectedVersion: 7,
      classifications: [],
      documentKey: 'utredning-enhetschef',
      documentETag: '"3"',
    });

    expect(JSON.stringify(await validate(payload, { whitelist: true, forbidNonWhitelisted: true }))).toMatch(/classifications/);
  });
});

describe('updateSupportErrandClassification', () => {
  beforeEach(() => {
    vi.spyOn(SupportInvestigationAccessService.prototype, 'assertCanWriteDocument').mockResolvedValue();
  });
  const errandUrl = `${MUNICIPALITY_ID}/${NAMESPACE}/errands/${mockSupportErrandId}`;

  const hslClassification = () => ({
    classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/REHAB' },
    categoryLabels: [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }],
  });
  const update = (): UpdateSupportErrandClassificationDto => ({
    expectedVersion: 7,
    classifications: [hslClassification()],
    documentKey: 'utredning-enhetschef',
    documentETag: '"3"',
  });

  /** Routes the metadata GET to the label tree and successive errand GETs to `errandReads`. */
  const routeClassificationGets = (api: ApiStub, errandReads: unknown[]) => {
    let read = 0;
    api.get.mockImplementation(async (config: { url?: string }) => {
      if (config.url?.endsWith('/metadata/labels')) {
        return { data: { labelStructure: classificationLabelStructure }, message: 'success' };
      }
      const next = errandReads[Math.min(read++, errandReads.length - 1)];
      if (next instanceof Error) throw next;
      return next;
    });
  };

  it.each([
    ['generic-errand', 409, 'Investigation does not own classification for this application'],
    ['unavailable', 503, 'Investigation classification ownership is temporarily unavailable'],
  ] as const)('rejects the narrow command when ownership is %s', async (owner, status, message) => {
    const { controller, api } = makeController(owner);

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status,
      message,
    });
    expect(api.get).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('rejects stale classification document context before reading or patching the errand', async () => {
    const { controller, api, investigationDocument } = makeController();
    routeClassificationGets(api, [{ data: { id: mockSupportErrandId, version: 7, labels: [] }, message: 'success' }]);
    investigationDocument.readJsonParameter.mockResolvedValue({
      document: {
        key: 'utredning-enhetschef',
        schemaId: '2281_utredning-enhetschef_1.0',
        value: { legalBases: ['HSL'] },
        version: 4,
      },
      etag: '"4"',
      status: 200,
    });

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 409,
      message: 'Investigation document has changed since classification was edited',
    });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('rejects a classification that conflicts with the versioned document legal bases', async () => {
    const { controller, api, investigationDocument } = makeController();
    routeClassificationGets(api, [{ data: { id: mockSupportErrandId, version: 7, labels: [] }, message: 'success' }]);
    investigationDocument.readJsonParameter.mockResolvedValue({
      document: {
        key: 'utredning-enhetschef',
        schemaId: '2281_utredning-enhetschef_1.0',
        value: { legalBases: ['SOL'] },
        version: 3,
      },
      etag: '"3"',
      status: 200,
    });

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 409,
      message: 'The requested classification is incompatible with the investigation legal bases',
    });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('rejects the manager document when the current errand requires the reported-misconduct owner', async () => {
    const { controller, api } = makeController();
    routeClassificationGets(api, [
      {
        data: {
          id: mockSupportErrandId,
          version: 7,
          parameters: [{ key: 'eventType', values: ['MISSFORHALLANDE'] }],
          labels: [],
        },
        message: 'success',
      },
    ]);

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 409,
      message: 'The selected investigation document does not own classification for this errand',
    });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('rejects classification changes on a locked errand at the backend boundary', async () => {
    const { controller, api } = makeController();
    routeClassificationGets(api, [
      {
        data: { id: mockSupportErrandId, version: 7, status: 'SOLVED', labels: [] },
        message: 'success',
      },
    ]);

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 409,
      message: 'Support errand status does not allow investigation classification changes',
    });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('patches only classification and label ids and propagates upstream client errors', async () => {
    const { controller, api, investigationDocument } = makeController();
    const savedErrand = {
      id: mockSupportErrandId,
      version: 8,
      labels: [
        { id: 'report-type-id', classification: 'REPORT-TYPE', resourcePath: 'REPORT_TYPE/DEVIATION' },
        { id: 'category-owner-id', classification: 'PROVISION-CATEGORY', resourcePath: 'CATEGORY/HSL' },
        { id: 'category-label-id', classification: 'CATEGORY', resourcePath: 'CATEGORY/HSL/REHAB' },
        { id: 'type-label-id', classification: 'TYPE', resourcePath: 'CATEGORY/HSL/REHAB/MISSED' },
      ],
    };
    routeClassificationGets(api, [
      {
        data: {
          id: mockSupportErrandId,
          version: 7,
          labels: [
            { id: 'report-type-id', resourcePath: 'REPORT_TYPE/DEVIATION' },
            { id: 'old-category-id', resourcePath: 'CATEGORY/HSL/OLD' },
          ],
        },
        message: 'success',
      },
      { data: savedErrand, message: 'success' },
    ]);
    const req = mockReq();
    const res = mockRes();

    await controller.updateSupportErrandClassification(req, mockSupportErrandId, update(), res);

    expect(investigationDocument.readJsonParameter).toHaveBeenCalledWith({
      definition: expect.objectContaining({ key: update().documentKey }),
      municipalityId: MUNICIPALITY_ID,
      errandId: mockSupportErrandId,
      user: req.user,
    });

    expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.patch).toHaveBeenCalledTimes(1);

    const [patchConfig, forwardedUser] = api.patch.mock.calls[0];
    expect(patchConfig.url).toBe(errandUrl);
    expect(patchConfig.data).toEqual({
      classification: hslClassification().classification,
      labels: [{ id: 'report-type-id' }, { id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }],
    });
    expect(patchConfig.headers).toEqual({ 'If-Match': '"7"' });
    expect(patchConfig.propagateClientError).toBe(true);
    expect(forwardedUser).toBe(req.user);

    // Both errand reads must opt into headers so the ETag is available, and into error propagation.
    for (const call of [api.get.mock.calls[0], api.get.mock.calls[2]]) {
      expect(call[0]).toEqual({ url: errandUrl, baseURL: patchConfig.baseURL, includeResponseHeaders: true, propagateClientError: true });
    }
    expect(api.get.mock.calls[1][0].url).toMatch(/\/metadata\/labels$/);
    expect(api.get.mock.calls[1][0].propagateClientError).toBe(true);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(savedErrand);
  });

  describe('an errand under both HSL and SoL', () => {
    const socialOwner: Label = {
      id: 'sol-lss-owner-id',
      classification: 'PROVISION_CATEGORY',
      resourceName: 'SOL_LSS',
      resourcePath: 'CATEGORY/SOL_LSS',
      labels: [
        {
          id: 'legal-certainty-id',
          classification: 'CATEGORY',
          resourceName: 'LEGAL_CERTAINTY',
          resourcePath: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY',
          labels: [
            {
              id: 'documentation-missing-id',
              classification: 'TYPE',
              resourceName: 'DOCUMENTATION_MISSING',
              resourcePath: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY/DOCUMENTATION_MISSING',
            },
          ],
        },
      ],
    };
    const [categoryRoot, ...otherRoots] = classificationLabelStructure;
    const groupedLabelStructure: Label[] = [{ ...categoryRoot, labels: [...(categoryRoot.labels ?? []), socialOwner] }, ...otherRoots];
    const socialClassification = () => ({
      classification: { category: 'CATEGORY/SOL_LSS', type: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY' },
      categoryLabels: [{ id: 'sol-lss-owner-id' }, { id: 'legal-certainty-id' }, { id: 'documentation-missing-id' }],
    });

    const setup = () => {
      const context = makeController();
      let errandRead = 0;
      context.api.get.mockImplementation(async (config: { url?: string }) => {
        if (config.url?.endsWith('/metadata/labels')) return { data: { labelStructure: groupedLabelStructure }, message: 'success' };
        errandRead++;
        return errandRead === 1
          ? {
              data: { id: mockSupportErrandId, version: 7, labels: [{ id: 'report-type-id', resourcePath: 'REPORT_TYPE/DEVIATION' }] },
              message: 'success',
            }
          : { data: { id: mockSupportErrandId, version: 8, labels: [] }, message: 'success' };
      });
      context.investigationDocument.readJsonParameter.mockResolvedValue({
        document: { key: 'utredning-enhetschef', schemaId: '2281_utredning-enhetschef_1.2', value: { legalBases: ['HSL', 'SOL'] }, version: 3 },
        etag: '"3"',
        status: 200,
      });
      return context;
    };

    it('keeps both classifications as labels and gives the errand classification field to the SoL/LSS one', async () => {
      const { controller, api } = setup();

      await controller.updateSupportErrandClassification(
        mockReq(),
        mockSupportErrandId,
        { ...update(), classifications: [hslClassification(), socialClassification()] },
        mockRes(),
      );

      expect(api.patch).toHaveBeenCalledTimes(1);
      expect(api.patch.mock.calls[0][0].data).toEqual({
        classification: socialClassification().classification,
        labels: [
          { id: 'report-type-id' },
          { id: 'category-owner-id' },
          { id: 'category-label-id' },
          { id: 'type-label-id' },
          { id: 'sol-lss-owner-id' },
          { id: 'legal-certainty-id' },
          { id: 'documentation-missing-id' },
        ],
      });
    });

    it('refuses to classify only one of the two groups', async () => {
      const { controller, api } = setup();

      await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
        status: 409,
        message: 'The investigation legal bases require a classification in every legal base group',
      });
      expect(api.patch).not.toHaveBeenCalled();
    });
  });

  it('rejects a classification based on an older errand version before patching', async () => {
    const { controller, api } = makeController();
    routeClassificationGets(api, [{ data: { id: mockSupportErrandId, version: 8, labels: [] }, message: 'success' }]);

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 409,
      message: 'Support errand classification has changed since it was loaded',
    });

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('stops before patching when Support Management omits concurrency metadata', async () => {
    const { controller, api } = makeController();
    routeClassificationGets(api, [{ data: { id: mockSupportErrandId, labels: [] }, message: 'success' }]);

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 502,
      message: 'Support Management response is missing a valid errand version',
    });

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('stops before patching when Support Management classification metadata is unavailable', async () => {
    const { controller, api } = makeController();
    api.get.mockImplementation(async (config: { url?: string }) =>
      config.url?.endsWith('/metadata/labels')
        ? { data: null, message: 'success' }
        : { data: { id: mockSupportErrandId, version: 7, labels: [] }, message: 'success' },
    );

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 502,
      message: 'Support Management classification metadata is unavailable',
    });

    expect(api.patch).not.toHaveBeenCalled();
  });

  it.each(['W/"7"', '', '"07"'])('rejects the malformed upstream ETag %j instead of falling back to the body version', async invalidETag => {
    const { controller, api } = makeController();
    routeClassificationGets(api, [{ data: { id: mockSupportErrandId, version: 7, labels: [] }, message: 'success', headers: { etag: invalidETag } }]);

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 502,
      message: 'Support Management response contains an invalid errand ETag',
    });
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('uses a strong errand ETag when the response body omits its version', async () => {
    const { controller, api } = makeController();
    routeClassificationGets(api, [
      { data: { id: mockSupportErrandId, labels: [] }, message: 'success', headers: { etag: '"7"' } },
      { data: { id: mockSupportErrandId, version: 8 }, message: 'success', headers: { etag: '"8"' } },
    ]);

    await controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes());

    expect(api.patch.mock.calls[0][0].headers).toEqual({ 'If-Match': '"7"' });
  });

  it('stops when the strong errand ETag disagrees with the response body version', async () => {
    const { controller, api } = makeController();
    routeClassificationGets(api, [{ data: { id: mockSupportErrandId, version: 7, labels: [] }, message: 'success', headers: { etag: '"8"' } }]);

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toMatchObject({
      status: 502,
      message: 'Support Management response contains inconsistent errand versions',
    });

    expect(api.patch).not.toHaveBeenCalled();
  });

  it('propagates a readback client error after the classification patch has succeeded', async () => {
    const { controller, api } = makeController();
    const readbackError = new HttpException(403, 'Readback forbidden');
    routeClassificationGets(api, [{ data: { id: mockSupportErrandId, version: 7, labels: [] }, message: 'success' }, readbackError]);

    await expect(controller.updateSupportErrandClassification(mockReq(), mockSupportErrandId, update(), mockRes())).rejects.toBe(readbackError);

    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.get.mock.calls[2][0].propagateClientError).toBe(true);
  });
});

describe('Mina ärenden for a MAS/MAR handler', () => {
  const masMarUser = () => mockUser({ groups: ['MOCK_MAS_MAR'] });
  const ownClause = `(assignedUserId:'${mockAdUsername}' or (assignedUserId is null and reporterUserId:'${mockAdUsername}' ))`;
  const masMarClause = `exists(parameters.key:'masMarHandler' and parameters.values:'${mockAdUsername}')`;

  const makeMasMarController = () => {
    const made = makeController();
    (made.controller as unknown as { handlerRoles: unknown }).handlerRoles = [{ key: 'mas-mar', label: 'MAS/MAR', group: 'MOCK_MAS_MAR' }];
    (made.investigationPolicy as Record<string, unknown>).handlerParameters = [{ key: 'masMarHandler', roleKey: 'mas-mar' }];
    made.api.get.mockResolvedValue({ data: { content: [], count: 0 }, message: 'success' });
    return made;
  };
  const firstUrl = (api: ApiStub): string => (api.get.mock.calls[0] as unknown as [{ url: string }])[0].url;

  it('lists the errands they are recorded on as MAS/MAR beside the ones assigned to them', async () => {
    const { controller, api } = makeMasMarController();

    await controller.errands(mockReq(masMarUser()), ...errandsArgs({ stakeholders: mockAdUsername }), mockRes());

    expect(upstreamFilter(firstUrl(api))).toBe(`${ownClause.slice(0, -1)} or ${masMarClause})`);
  });

  it('counts them the same way', async () => {
    const { controller, api } = makeMasMarController();

    await controller.countErrandsByStatusGroups(
      mockReq(masMarUser()),
      ...statusGroupCountArgs([['NEW']], { stakeholders: mockAdUsername }),
      mockRes(),
    );

    expect(upstreamFilter(firstUrl(api))).toContain(masMarClause);
  });

  it('counts them on the filter endpoint, which can match the parameter, on the sprint target too', async () => {
    const { controller, api } = makeMasMarController();
    onSprintTarget(controller);

    await controller.countErrandsByStatusGroups(
      mockReq(masMarUser()),
      ...statusGroupCountArgs([['NEW']], { stakeholders: mockAdUsername }),
      mockRes(),
    );

    expect(firstUrl(api)).not.toContain('/errands/search');
    expect(upstreamFilter(firstUrl(api))).toContain(masMarClause);
  });

  it('asks the filter endpoint, which can match the parameter, where the search index is on', async () => {
    const { controller, api } = makeMasMarController();
    enableErrandSearch(controller);

    await controller.errands(mockReq(masMarUser()), ...errandsArgs({ stakeholders: mockAdUsername }), mockRes());

    expect(firstUrl(api)).not.toContain('/errands/search');
    expect(upstreamFilter(firstUrl(api))).toContain(masMarClause);
  });

  it('leaves Mina ärenden as it was for everybody else, and for a MAS/MAR handler picking another handler', async () => {
    const withoutRole = makeMasMarController();
    await withoutRole.controller.errands(mockReq(), ...errandsArgs({ stakeholders: mockAdUsername }), mockRes());
    expect(upstreamFilter(firstUrl(withoutRole.api))).toBe(ownClause);

    const otherHandler = makeMasMarController();
    await otherHandler.controller.errands(mockReq(masMarUser()), ...errandsArgs({ stakeholders: 'someone.else' }), mockRes());
    expect(upstreamFilter(firstUrl(otherHandler.api))).not.toContain('parameters.key');
  });
});
