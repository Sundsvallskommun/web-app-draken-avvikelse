import { Response } from 'express';
import FormData from 'form-data';

import { SupportMeasureActionPlanController } from '@/controllers/supportmanagement/support-measure-action-plan.controller';
import type { Measure } from '@/data-contracts/supportmanagement/data-contracts';
import { HandlerDirectoryService } from '@/services/handler-directory.service';

import { mockReq, mockRes, MockResponse } from './helpers/http';
import { mockAdUsername, mockAttachmentId, mockMunicipalityId, mockSupportErrandId, mockSupportErrandNumber } from './helpers/mock-data';

const educationId = 'dd000000-0000-4000-8000-000000000100';
const metadata = {
  measureTypes: [{ id: educationId, name: 'EDUCATION', displayName: 'Utbildning' }],
  roles: [{ name: 'MANAGER', displayName: 'Enhetschef' }],
};
const storedMeasures: Measure[] = [
  {
    id: 'm-1',
    type: 'EDUCATION',
    addedByUser: mockAdUsername,
    addedByRole: 'MANAGER',
    accept: 'TRUE',
    description: 'Gemensam utbildning',
    goal: 'Säkrare arbetssätt',
    plannedStart: '2026-09-08T00:00:00+02:00',
    plannedComplete: '2026-09-10T00:00:00+02:00',
  },
  { id: 'm-2', addedByUser: 'someone.else', addedByRole: 'MANAGER', description: 'Ny rutin', goal: 'Färre fall' },
];

interface Scenario {
  measures?: Measure[];
  status?: string;
  attachments?: { fileName?: string }[];
  templatingFailure?: number;
  directoryFails?: boolean;
}

const makeController = ({
  measures = storedMeasures,
  status = 'ONGOING',
  attachments = [],
  templatingFailure,
  directoryFails = false,
}: Scenario = {}) => {
  const apiService = {
    get: vi.fn().mockImplementation(async config => {
      const url = String(config.url);
      if (url.endsWith('/measures')) return { status: 200, message: 'success', data: measures };
      if (url.endsWith('/attachments')) return { status: 200, message: 'success', data: attachments };
      if (url.endsWith('/metadata')) return { status: 200, message: 'success', data: metadata };
      return {
        status: 200,
        message: 'success',
        data: { id: mockSupportErrandId, errandNumber: mockSupportErrandNumber, title: 'Fall i duschen', status },
      };
    }),
    post: vi.fn().mockImplementation(async config => {
      if (String(config.url).includes('/render/direct/pdf')) {
        if (templatingFailure) throw { status: templatingFailure, message: 'Templating said no' };
        return { status: 200, message: 'success', data: { output: 'UERG' } };
      }
      return { status: 201, message: 'success', data: {}, headers: { location: `/errands/${mockSupportErrandId}/attachments/${mockAttachmentId}` } };
    }),
  };
  const handlerDirectory = {
    listHandlers: directoryFails
      ? vi.fn().mockRejectedValue(new Error('Directory unavailable'))
      : vi.fn().mockResolvedValue([{ name: mockAdUsername.toUpperCase(), displayName: 'Anna Andersson', guid: 'g-1' }]),
  } as unknown as Pick<HandlerDirectoryService, 'listHandlers'>;
  const controller = new SupportMeasureActionPlanController({
    apiService,
    handlerDirectory,
    namespace: 'NS',
    supportManagementService: 'supportmanagement/1.0',
    templatingService: 'templating/2.0',
    clock: () => new Date('2026-09-11T12:30:00.000Z'),
  });
  return { controller, apiService };
};

const resDouble = () => mockRes() as unknown as MockResponse & Response;
const create = (controller: SupportMeasureActionPlanController, res: Response) =>
  controller.createActionPlan(mockReq(), mockMunicipalityId, mockSupportErrandId, res);

describe('SupportMeasureActionPlanController', () => {
  it('renders every stored measure as the next numbered plan and attaches it to the errand', async () => {
    const { controller, apiService } = makeController({
      attachments: [{ fileName: `Handlingsplan_${mockSupportErrandNumber}_1.pdf` }, { fileName: 'Utredning_HSL_1.pdf' }],
    });
    const res = resDouble();

    await create(controller, res);

    const base = `supportmanagement/1.0/${mockMunicipalityId}/NS`;
    expect(apiService.get.mock.calls.map(([config]) => config.url)).toEqual([
      `${base}/errands/${mockSupportErrandId}`,
      `${base}/errands/${mockSupportErrandId}/measures`,
      `${base}/metadata`,
      `${base}/errands/${mockSupportErrandId}/attachments`,
    ]);
    expect(apiService.post).toHaveBeenCalledTimes(2);
    const [renderCall, attachCall] = apiService.post.mock.calls.map(([config]) => config);
    expect(renderCall.url).toBe(`templating/2.0/${mockMunicipalityId}/render/direct/pdf`);
    expect(renderCall.propagateClientError).toBe(true);
    expect(Buffer.from(renderCall.data.content, 'base64').toString('utf8')).toContain('{{ plan.title }}');
    expect(renderCall.data.parameters.plan).toMatchObject({
      title: 'Handlingsplan',
      sequence: 2,
      generatedAt: '2026-09-11 14:30',
      generatedBy: mockReq().user.name,
      errand: { errandNumber: mockSupportErrandNumber, title: 'Fall i duschen' },
      counts: { total: 2, planned: 1, unscheduled: 1, executed: 0 },
      measures: [
        {
          number: 1,
          type: 'Utbildning',
          status: 'Planerad',
          dates: '2026-09-08 – 2026-09-10',
          decision: 'Godkänd',
          registeredBy: 'Anna Andersson (Enhetschef)',
        },
        { number: 2, type: 'Typ saknas', status: 'Ej tidsatt', decision: 'Förslag', registeredBy: 'someone.else (Enhetschef)' },
      ],
    });
    expect(attachCall.url).toBe(`${base}/errands/${mockSupportErrandId}/attachments`);
    expect(attachCall.data).toBeInstanceOf(FormData);
    const multipart = (attachCall.data as FormData).getBuffer().toString('utf8');
    expect(multipart).toContain(`name="errandAttachment"; filename="Handlingsplan_${mockSupportErrandNumber}_2.pdf"\r\n`);
    expect(multipart).toContain('Content-Type: application/pdf\r\n');
    expect(multipart).toContain('PDF');

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body).toEqual({
      data: { fileName: `Handlingsplan_${mockSupportErrandNumber}_2.pdf`, attachmentId: mockAttachmentId },
      message: 'Action plan attached',
    });
  });

  it('refuses a plan without measures before rendering anything', async () => {
    const { controller, apiService } = makeController({ measures: [] });

    await expect(create(controller, resDouble())).rejects.toMatchObject({
      status: 409,
      message: 'Det finns inga åtgärder att ta med i handlingsplanen.',
    });
    expect(apiService.post).not.toHaveBeenCalled();
    expect(apiService.get).toHaveBeenCalledTimes(2);
  });

  it('follows the errand status rule for measure writes', async () => {
    const { controller, apiService } = makeController({ status: 'SOLVED' });

    await expect(create(controller, resDouble())).rejects.toMatchObject({ status: 409 });
    expect(apiService.get).toHaveBeenCalledTimes(1);
    expect(apiService.post).not.toHaveBeenCalled();
  });

  it("reports Templating's own denial as a service failure and attaches nothing", async () => {
    const { controller, apiService } = makeController({ templatingFailure: 403 });

    await expect(create(controller, resDouble())).rejects.toMatchObject({
      status: 502,
      message: 'Rapporttjänsten nekade applikationens åtkomst. Kontakta support.',
    });
    expect(apiService.post).toHaveBeenCalledTimes(1);
  });

  it('shows stored accounts when the handler directory cannot be read', async () => {
    const { controller, apiService } = makeController({ directoryFails: true });
    const res = resDouble();

    await create(controller, res);

    const [renderCall] = apiService.post.mock.calls.map(([config]) => config);
    expect(renderCall.data.parameters.plan.measures[0].registeredBy).toBe(`${mockAdUsername} (Enhetschef)`);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
