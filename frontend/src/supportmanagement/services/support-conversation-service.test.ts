import { apiService } from '@common/services/api-service';
import type { RelationWithErrandNumber } from '@common/services/relations-service';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { getOrCreateSupportConversationId } from './support-conversation-service';
import type { SupportErrand } from './support-errand-service';

vi.mock('@common/services/api-service', () => ({ apiService: { get: vi.fn(), post: vi.fn() } }));

const supportErrand = { id: 'errand-1', errandNumber: 'KC-1' } as SupportErrand;
const relationErrands = [
  { relation: { id: 'relation-1' }, errandNumber: 'KC-2', otherResourceId: 'errand-2' },
] as RelationWithErrandNumber[];

const givenConversations = (conversations: object[]) =>
  vi.mocked(apiService.get).mockResolvedValue({ data: { data: { data: conversations } } } as never);

const createdBody = () => vi.mocked(apiService.post).mock.calls[0]?.[1];

beforeEach(() => {
  vi.mocked(apiService.get).mockReset();
  vi.mocked(apiService.post)
    .mockReset()
    .mockResolvedValue({ data: { data: { id: 'new-conversation' } } } as never);
});

describe('getOrCreateSupportConversationId', () => {
  test('creates Mina sidor conversation without relation even if a relation is still selected', async () => {
    givenConversations([]);

    const id = await getOrCreateSupportConversationId(
      '2281',
      supportErrand,
      'minasidor',
      'errand-2',
      relationErrands,
      ''
    );

    expect(id).toBe('new-conversation');
    expect(createdBody()).toEqual({ topic: 'Mina sidor', type: 'EXTERNAL' });
  });

  test('creates Draken conversation linked to the selected relation', async () => {
    givenConversations([]);

    await getOrCreateSupportConversationId('2281', supportErrand, 'draken', 'errand-2', relationErrands, '');

    expect(createdBody()).toEqual({ topic: 'KC-1 - KC-2', type: 'INTERNAL', relationIds: ['relation-1'] });
  });

  test('never reuses an external conversation for Draken', async () => {
    givenConversations([{ id: 'external', type: 'EXTERNAL', relationIds: [] }]);

    const id = await getOrCreateSupportConversationId('2281', supportErrand, 'draken', '', [], '');

    expect(id).toBe('new-conversation');
    expect(createdBody()).toEqual({ topic: 'KC-1', type: 'INTERNAL' });
  });

  test('reuses existing internal conversation for the selected relation', async () => {
    givenConversations([
      { id: 'external', type: 'EXTERNAL', relationIds: [] },
      { id: 'internal', type: 'INTERNAL', relationIds: ['relation-1'] },
    ]);

    const id = await getOrCreateSupportConversationId('2281', supportErrand, 'draken', 'errand-2', relationErrands, '');

    expect(id).toBe('internal');
    expect(apiService.post).not.toHaveBeenCalled();
  });
});
