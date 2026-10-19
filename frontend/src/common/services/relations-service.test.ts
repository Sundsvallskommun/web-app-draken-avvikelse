import type { Relation } from '@common/data-contracts/relations/data-contracts';
import { apiService } from '@common/services/api-service';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { getAllRelatedErrands } from './relations-service';

vi.mock('@common/services/api-service', () => ({ apiService: { get: vi.fn() } }));
vi.mock('@config/appconfig', () => ({ appConfig: {} }));

const resource = (resourceId: string) => ({ resourceId, type: 'case', service: 'supportmanagement' });
const relation = (id: string, type: string, source: string, target: string) =>
  ({ id, type, source: resource(source), target: resource(target) } as Relation);
const status = (caseId: string, errandNumber: string) => ({ caseId, errandNumber });

const givenRelations = (source: Relation[], target: Relation[]) =>
  vi.mocked(apiService.get).mockImplementation(async (url: string) => {
    const relations = url.includes('/resolvedrelations/source/') ? source : target;
    return {
      data: { data: { relations, caseStatuses: [status('ks-errand', 'KS-1'), status('other', 'BOU-2')] } },
    } as never;
  });

beforeEach(() => {
  vi.mocked(apiService.get).mockReset();
});

describe('getAllRelatedErrands', () => {
  test('lists a handed-over errand once even though HANDOVER and HANDOVER_FROM both relate it', async () => {
    givenRelations(
      [relation('handover-from', 'HANDOVER_FROM', 'bou-errand', 'ks-errand')],
      [relation('handover', 'HANDOVER', 'ks-errand', 'bou-errand')]
    );

    const result = await getAllRelatedErrands('2281', 'bou-errand');

    expect(result.map((e) => [e.errandNumber, e.relation.id])).toEqual([['KS-1', 'handover-from']]);
  });

  test('keeps different related errands', async () => {
    givenRelations(
      [relation('link-1', 'LINK', 'bou-errand', 'ks-errand')],
      [relation('link-2', 'LINK', 'other', 'bou-errand')]
    );

    const result = await getAllRelatedErrands('2281', 'bou-errand');

    expect(result.map((e) => e.errandNumber)).toEqual(['BOU-2', 'KS-1']);
  });
});
