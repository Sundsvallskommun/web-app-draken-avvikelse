import { Response } from 'express';

import { createSupportInvestigationProfile } from '@/config/support-investigation-profile';
import { SupportHistoryController } from '@/controllers/supportmanagement/support-history.controller';
import { DifferenceResponse } from '@/data-contracts/supportmanagement/data-contracts';
import ApiService from '@/services/api.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { SupportJsonParameterService } from '@/services/support-json-parameter.service';

import { mockReq, mockRes } from './helpers/http';
import { mockMunicipalityId, mockSupportErrandId, mockSupportNamespace } from './helpers/mock-data';

const profile = createSupportInvestigationProfile({
  documents: [
    { key: 'future-investigation', schemaName: 'future-schema', tabLabel: 'Future', ownerLabel: 'Owner' },
    { key: 'future-review', schemaName: 'future-schema', tabLabel: 'Review', ownerLabel: 'Reviewer' },
  ],
});

const difference: DifferenceResponse = {
  operations: [
    { op: 'replace', path: '/jsonParameters/0/value/assessment', fromValue: 'secret-before', value: 'secret-after' },
    { op: 'replace', path: '/title', fromValue: 'Before', value: 'After' },
  ],
};

const makeController = (verifyReadableDocuments = vi.fn().mockResolvedValue({ existingDocumentKeys: profile.documents.map(({ key }) => key) })) => {
  const policy = { profile } as SupportInvestigationPolicyService;
  const documentService = { verifyReadableDocuments } as unknown as SupportJsonParameterService;
  const controller = new SupportHistoryController(policy, documentService);
  const apiService = { get: vi.fn(async () => ({ data: difference })) };
  (controller as unknown as { apiService: ApiService }).apiService = apiService as unknown as ApiService;
  return { controller, apiService, verifyReadableDocuments };
};

describe('SupportHistoryController investigation document protection', () => {
  it('keeps revision JSON-parameter values when Support Management permits every profile document read', async () => {
    const { controller, verifyReadableDocuments } = makeController();
    const response = mockRes();
    const req = mockReq();

    await controller.fetchErrandRevisionsDiff(req, mockSupportErrandId, 2, 3, response as unknown as Response<DifferenceResponse>);

    expect(response.body).toEqual(difference);
    expect(verifyReadableDocuments).toHaveBeenCalledWith({
      definitions: profile.documents,
      municipalityId: mockMunicipalityId,
      errandId: mockSupportErrandId,
      user: req.user,
    });
  });

  it('removes all JSON-parameter values when Support Management denies a configured document read', async () => {
    const denied = Object.assign(new Error('Forbidden'), { status: 403 });
    const { controller, apiService } = makeController(vi.fn().mockRejectedValue(denied));
    const response = mockRes();
    const req = mockReq();

    await controller.fetchErrandRevisionsDiff(req, mockSupportErrandId, 2, 3, response as unknown as Response<DifferenceResponse>);

    expect(response.body).toEqual({ operations: [difference.operations?.[1]] });
    expect(apiService.get).toHaveBeenCalledWith(
      {
        url: expect.stringContaining(
          `/${mockMunicipalityId}/${mockSupportNamespace}/errands/${mockSupportErrandId}/revisions/difference?source=2&target=3`,
        ),
        propagateClientError: true,
      },
      req.user,
    );
  });

  it('propagates document verification failures that are not authorization decisions', async () => {
    const unavailable = Object.assign(new Error('Unavailable'), { status: 503 });
    const { controller } = makeController(vi.fn().mockRejectedValue(unavailable));

    await expect(
      controller.fetchErrandRevisionsDiff(mockReq(), mockSupportErrandId, 2, 3, mockRes() as unknown as Response<DifferenceResponse>),
    ).rejects.toBe(unavailable);
  });
});

describe('SupportHistoryController assignee resumed', () => {
  const event = (created: string, previous: string, current: string, executedBy?: string) => ({
    subType: 'ERRAND',
    created,
    metadata: [
      { key: 'PreviousVersion', value: previous },
      { key: 'CurrentVersion', value: current },
      ...(executedBy ? [{ key: 'ExecutedBy', value: executedBy }] : []),
    ],
  });
  const differences: Record<string, DifferenceResponse> = {
    '3-4': { operations: [{ op: 'replace', path: '/status', fromValue: 'ASSIGNED', value: 'INQUIRY' }] },
    '2-3': { operations: [{ op: 'replace', path: '/assignedUserId', fromValue: 'lex.manager', value: 'lex.investigator' }] },
    '1-2': { operations: [{ op: 'replace', path: '/status', fromValue: 'NEW', value: 'ONGOING' }] },
  };

  const makeResumeController = (assignedUserId?: string) => {
    const { controller } = makeController();
    const apiService = {
      get: vi.fn(async ({ url }: { url: string }): Promise<{ data: unknown }> => {
        if (url.endsWith(`/errands/${mockSupportErrandId}`)) return { data: { id: mockSupportErrandId, assignedUserId } };
        if (url.includes('/events?')) {
          return {
            data: {
              content: [
                event('2026-10-08T09:00:00Z', '3', '4', 'lex.investigator'),
                { subType: 'NOTE', created: '2026-10-07T12:00:00Z', metadata: [] },
                event('2026-10-07T08:00:00Z', '2', '3', 'Lex.Manager'),
                event('2026-10-01T08:00:00Z', '1', '2', 'unit.manager'),
              ],
            },
          };
        }
        const match = url.match(/source=(\d+)&target=(\d+)/u);
        return { data: differences[`${match?.[1]}-${match?.[2]}`] ?? { operations: [] } };
      }),
    };
    (controller as unknown as { apiService: unknown }).apiService = apiService;
    return { controller, apiService };
  };

  it('answers when the handler took the errand up after it was given to them, reading back no further', async () => {
    const { controller, apiService } = makeResumeController('lex.investigator');

    await expect(controller.fetchAssigneeResumedAt(mockReq(), mockSupportErrandId)).resolves.toEqual({
      resumedAt: '2026-10-08T09:00:00Z',
    });
    const urls = apiService.get.mock.calls.map(([config]) => config.url);
    // The assignment is as far back as it reads: the write before it is never asked for.
    expect(urls.filter(url => url.includes('/revisions/difference'))).toHaveLength(2);
    expect(urls.some(url => url.includes('source=1&target=2'))).toBe(false);
  });

  it('answers nothing for an errand nobody is assigned', async () => {
    const { controller } = makeResumeController(undefined);

    await expect(controller.fetchAssigneeResumedAt(mockReq(), mockSupportErrandId)).resolves.toEqual({ resumedAt: null });
  });

  // A LEX investigator hands the errand back to the LEX manager who gave it to them.
  it('answers who gave the errand to its handler, reading back no further than that assignment', async () => {
    const { controller, apiService } = makeResumeController('lex.investigator');

    await expect(controller.fetchAssignedBy(mockReq(), mockSupportErrandId)).resolves.toEqual({
      assignedBy: 'Lex.Manager',
    });
    const urls = apiService.get.mock.calls.map(([config]) => config.url);
    expect(urls.some(url => url.includes('source=1&target=2'))).toBe(false);
  });

  it('answers nobody for an errand nobody is assigned', async () => {
    const { controller } = makeResumeController(undefined);

    await expect(controller.fetchAssignedBy(mockReq(), mockSupportErrandId)).resolves.toEqual({ assignedBy: null });
  });
});
