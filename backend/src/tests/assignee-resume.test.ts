import { readErrandEventExecutor, readErrandEventVersions, resolveAssignedBy, resolveAssigneeResumedAt } from '@/services/assignee-resume';

const write = (at: string, changes: Record<string, string>, by?: string) => ({
  at,
  operations: Object.entries(changes).map(([field, value]) => ({ op: 'replace', path: `/${field}`, value })),
  ...(by ? { by } : {}),
});

describe('resolveAssigneeResumedAt', () => {
  it('answers the first status change away from ASSIGNED after the latest assignment to the handler', () => {
    const history = [
      write('2026-10-09T10:00:00Z', { status: 'DECISION' }),
      write('2026-10-08T09:00:00Z', { status: 'INQUIRY' }),
      write('2026-10-07T08:00:00Z', { assignedUserId: 'Lex.Utredare', status: 'ASSIGNED' }),
      write('2026-10-06T08:00:00Z', { status: 'INQUIRY' }),
      write('2026-10-05T08:00:00Z', { assignedUserId: 'lex.utredare', status: 'ASSIGNED' }),
    ];

    expect(resolveAssigneeResumedAt(history, 'lex.utredare')).toBe('2026-10-08T09:00:00Z');
  });

  it('answers the assignment itself when the same write took the errand up', () => {
    expect(resolveAssigneeResumedAt([write('2026-10-07T08:00:00Z', { assignedUserId: 'lex.utredare', status: 'INQUIRY' })], 'lex.utredare')).toBe(
      '2026-10-07T08:00:00Z',
    );
  });

  it('answers the assignment while the errand is not taken up yet, and nothing without one', () => {
    const assigned = write('2026-10-07T08:00:00Z', { assignedUserId: 'lex.utredare', status: 'ASSIGNED' });
    expect(resolveAssigneeResumedAt([assigned], 'lex.utredare')).toBe('2026-10-07T08:00:00Z');
    expect(resolveAssigneeResumedAt([write('2026-10-06T08:00:00Z', { status: 'INQUIRY' })], 'lex.utredare')).toBeUndefined();
    expect(resolveAssigneeResumedAt([assigned], 'someone.else')).toBeUndefined();
  });
});

describe('resolveAssignedBy', () => {
  it('answers who made the latest assignment to the handler, not an earlier one', () => {
    const history = [
      write('2026-10-09T10:00:00Z', { status: 'INQUIRY' }, 'Lex.Utredare'),
      write('2026-10-07T08:00:00Z', { assignedUserId: 'Lex.Utredare', status: 'ASSIGNED' }, 'Lex.Ansvarig'),
      write('2026-10-05T08:00:00Z', { assignedUserId: 'lex.utredare' }, 'enhets.chef'),
    ];

    expect(resolveAssignedBy(history, 'lex.utredare')).toBe('Lex.Ansvarig');
  });

  it('answers nothing without an assignment to the handler, or when the event does not say who made it', () => {
    expect(resolveAssignedBy([write('2026-10-06T08:00:00Z', { status: 'INQUIRY' }, 'Lex.Ansvarig')], 'lex.utredare')).toBeUndefined();
    expect(resolveAssignedBy([write('2026-10-07T08:00:00Z', { assignedUserId: 'lex.utredare' })], 'lex.utredare')).toBeUndefined();
  });
});

describe('readErrandEventExecutor', () => {
  it('reads the account Support Management recorded, and nothing for an event without one', () => {
    expect(readErrandEventExecutor({ subType: 'ERRAND', metadata: [{ key: 'ExecutedBy', value: ' Lex.Ansvarig ' }] })).toBe('Lex.Ansvarig');
    expect(readErrandEventExecutor({ subType: 'ERRAND', metadata: [{ key: 'ExecutedBy', value: ' ' }] })).toBeUndefined();
    expect(readErrandEventExecutor({ subType: 'ERRAND', metadata: [] })).toBeUndefined();
  });
});

describe('readErrandEventVersions', () => {
  it('reads the revisions a write to the errand moved between, and nothing for other events', () => {
    const metadata = [
      { key: 'PreviousVersion', value: '2' },
      { key: 'CurrentVersion', value: '3' },
    ];
    expect(readErrandEventVersions({ subType: 'ERRAND', created: '2026-10-07T08:00:00Z', metadata })).toEqual({ previous: '2', current: '3' });
    expect(readErrandEventVersions({ subType: 'NOTE', created: '2026-10-07T08:00:00Z', metadata })).toBeUndefined();
    expect(readErrandEventVersions({ subType: 'ERRAND', created: '2026-10-07T08:00:00Z', metadata: [metadata[1]] })).toBeUndefined();
  });
});
