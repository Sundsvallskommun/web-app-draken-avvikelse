import { RelationsController } from '@/controllers/relations.controller';
import { Category, Errand as SupportManagementErrand, MetadataResponse } from '@/data-contracts/supportmanagement/data-contracts';

import { mockReq } from './helpers/http';
import {
  mockFirstName,
  mockHandoverNamespace,
  mockLastName,
  mockMunicipalityId,
  mockSupportErrandId,
  mockSupportErrandNumber,
  mockSupportNamespace,
} from './helpers/mock-data';

interface ApiStub {
  get: ReturnType<typeof vi.fn>;
}

// A labels namespace keeps its classification as resource paths and has no categories in its metadata;
// a classification namespace is the other way around.
const labelCategory = { classification: 'CATEGORY', resourceName: 'BOU', displayName: 'Barn och utbildning', resourcePath: 'BOU' };
const labelType = { classification: 'TYPE', resourceName: 'UNCATEGORIZED', displayName: 'Okategoriserat', resourcePath: 'BOU/UNCATEGORIZED' };
const labelSubType = {
  classification: 'SUBTYPE',
  resourceName: 'SCHOOL_TRANSPORT',
  displayName: 'Skolskjuts',
  resourcePath: 'BOU/UNCATEGORIZED/SCHOOL_TRANSPORT',
};

const categories: Category[] = [
  { name: 'ADMINISTRATION', displayName: 'Administration', types: [{ name: 'GENERAL', displayName: 'Allmän fråga' }] } as Category,
];

const errand = (overrides: Partial<SupportManagementErrand> = {}): SupportManagementErrand =>
  ({
    id: mockSupportErrandId,
    errandNumber: mockSupportErrandNumber,
    priority: 'MEDIUM',
    channel: 'EMAIL',
    stakeholders: [{ role: 'PRIMARY', firstName: mockFirstName, lastName: mockLastName }],
    ...overrides,
  }) as SupportManagementErrand;

/** Routes the three GETs the referred-from flow performs: relations, source errand, source metadata. */
const makeController = (sourceErrand: SupportManagementErrand, metadata: MetadataResponse, namespace = mockHandoverNamespace) => {
  const controller = new RelationsController();
  const api: ApiStub = {
    get: vi.fn(async ({ url }: { url: string }) => {
      if (url.includes('/relations?filter=')) {
        return {
          data: {
            relations: [
              {
                type: 'HANDOVER',
                source: { service: 'supportmanagement', namespace, resourceId: mockSupportErrandId },
                target: { service: 'supportmanagement', namespace: mockSupportNamespace, resourceId: 'target-1' },
              },
            ],
          },
          message: 'success',
        };
      }
      if (url.includes('/metadata')) {
        return { data: metadata, message: 'success' };
      }
      return { data: sourceErrand, message: 'success' };
    }),
  };
  (controller as unknown as { apiService: ApiStub }).apiService = api;
  return { controller, api };
};

const referredFrom = async (sourceErrand: SupportManagementErrand, metadata: MetadataResponse, namespace?: string) => {
  const { controller } = makeController(sourceErrand, metadata, namespace);
  const res = await controller.getReferredFromErrand(mockReq(), mockMunicipalityId, 'target-1');
  return res.data[0];
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RelationsController referred-from classification', () => {
  it('reads the display names off the labels when the source namespace classifies with labels', async () => {
    const result = await referredFrom(
      errand({ classification: { category: 'BOU', type: 'BOU/UNCATEGORIZED' }, labels: [labelCategory, labelType] }),
      { categories: [] } as MetadataResponse,
    );

    expect(result.classificationCategory).toBe('BOU');
    expect(result.classificationCategoryDisplayName).toBe('Barn och utbildning');
    // Without this the raw resource path 'BOU/UNCATEGORIZED' was surfaced as the errand type.
    expect(result.classificationType).toBe('UNCATEGORIZED');
    expect(result.classificationTypeDisplayName).toBe('Okategoriserat');
  });

  it('includes the subtype when the source errand has a third label level', async () => {
    const result = await referredFrom(errand({ labels: [labelCategory, labelType, labelSubType] }), { categories: [] } as MetadataResponse);

    expect(result.classificationSubType).toBe('SCHOOL_TRANSPORT');
    expect(result.classificationSubTypeDisplayName).toBe('Skolskjuts');
  });

  it('leaves the subtype empty when the source errand has only two label levels', async () => {
    const result = await referredFrom(errand({ labels: [labelCategory, labelType] }), { categories: [] } as MetadataResponse);

    expect(result.classificationSubType).toBe('');
    expect(result.classificationSubTypeDisplayName).toBe('');
  });

  it('falls back to the label name when a label carries no display name', async () => {
    const result = await referredFrom(errand({ labels: [{ classification: 'TYPE', resourceName: 'UNCATEGORIZED' }] }), {
      categories: [],
    } as MetadataResponse);

    expect(result.classificationTypeDisplayName).toBe('UNCATEGORIZED');
  });

  it('resolves against the metadata categories when the source namespace has no labels', async () => {
    const result = await referredFrom(
      errand({ classification: { category: 'ADMINISTRATION', type: 'GENERAL' }, labels: [] }),
      { categories } as MetadataResponse,
      mockSupportNamespace,
    );

    expect(result.classificationCategory).toBe('ADMINISTRATION');
    expect(result.classificationCategoryDisplayName).toBe('Administration');
    expect(result.classificationType).toBe('GENERAL');
    expect(result.classificationTypeDisplayName).toBe('Allmän fråga');
    expect(result.classificationSubTypeDisplayName).toBe('');
  });

  it('keeps the raw classification when the categories do not describe it', async () => {
    const result = await referredFrom(errand({ classification: { category: 'UNKNOWN', type: 'MISSING' } }), {
      categories,
    } as MetadataResponse);

    expect(result.classificationCategoryDisplayName).toBe('UNKNOWN');
    expect(result.classificationTypeDisplayName).toBe('MISSING');
  });

  it('returns empty display names when the source errand has neither labels nor a classification', async () => {
    const result = await referredFrom(errand(), { categories } as MetadataResponse);

    expect(result.classificationCategoryDisplayName).toBe('');
    expect(result.classificationTypeDisplayName).toBe('');
  });
});
