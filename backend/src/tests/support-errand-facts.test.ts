import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';
import { assertErrandFactsUnchanged, ERRAND_CHANGED_ELSEWHERE_MESSAGE, errandFacts, withErrandFacts } from '@/services/support-errand-facts';

import { mockAdUsername } from './helpers/mock-data';

const label = (id: string, resourcePath: string) => ({ id, resourcePath });

const errand: Errand = {
  id: 'errand-1',
  title: 'Fall i badrummet',
  status: 'ONGOING',
  assignedUserId: mockAdUsername,
  classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/FALL' },
  labels: [label('location', 'LOCATION/NORTH'), label('access-lex', 'ACCESS/LEX'), label('category', 'CATEGORY/HSL/FALL')],
  phases: [{ phaseId: 'investigation' }],
};

describe('errandFacts', () => {
  it('reads the same however upstream ordered the labels, the keys or the case of the assignee', () => {
    const reordered: Errand = {
      phases: errand.phases,
      labels: [...(errand.labels ?? [])].reverse(),
      classification: { type: 'CATEGORY/HSL/FALL', category: 'CATEGORY/HSL' },
      assignedUserId: ` ${mockAdUsername.toUpperCase()} `,
      status: 'ONGOING',
      title: 'Fall i badrummet',
      id: 'errand-1',
    };

    expect(errandFacts(reordered)).toEqual(errandFacts(errand));
  });

  // The errand's version is bookkeeping: it moves with every write beneath the errand, and says nothing of its facts.
  it('leaves the version out of every fact', () => {
    expect(errandFacts({ ...errand, version: 99 })).toEqual(errandFacts({ ...errand, version: 1 }));
  });

  // A document saved with the classification may add a permanent label; a handover moves the routing labels.
  // Neither is a change of the classification.
  it('keeps the routing and the permanent labels out of the classification', () => {
    const withRisk = { ...errand, labels: [...(errand.labels ?? []), label('high-hsl', 'RISK/HIGH_HSL')] };
    const handedOver = { ...errand, labels: [label('location', 'LOCATION/SOUTH'), label('category', 'CATEGORY/HSL/FALL')] };

    expect(errandFacts(withRisk).classification).toBe(errandFacts(errand).classification);
    expect(errandFacts(handedOver).classification).toBe(errandFacts(errand).classification);
    expect(errandFacts(handedOver).routingLabels).not.toBe(errandFacts(errand).routingLabels);
    expect(errandFacts(withRisk).labels).not.toBe(errandFacts(errand).labels);
  });

  it('reads the active phase off the phase history', () => {
    const moved = { ...errand, phases: [{ phaseId: 'investigation', ended: '2026-10-01T00:00:00Z' }, { phaseId: 'decision' }] };

    expect(errandFacts(moved).activePhase).not.toBe(errandFacts(errand).activePhase);
    expect(errandFacts(moved).status).toBe(errandFacts(errand).status);
  });
});

describe('withErrandFacts', () => {
  it('takes the facts from the errand as upstream answered it, not as the BFF prepared it for the client', () => {
    const prepared = { ...errand, stakeholders: [{ role: 'PRIMARY', personNumber: 'added by the BFF' }] };

    expect(withErrandFacts(prepared, errand).facts).toEqual(errandFacts(errand));
  });
});

describe('assertErrandFactsUnchanged', () => {
  const seen = errandFacts(errand);

  it('lets a command through when the facts it depends on are as the handler saw them', () => {
    const elsewhereChanged = { ...errand, title: 'Ändrad av någon annan', version: 12 };

    expect(() => assertErrandFactsUnchanged(elsewhereChanged, seen, ['assignedUserId', 'status'])).not.toThrow();
  });

  it('refuses a command when a fact it depends on changed since the handler saw it', () => {
    const taken = { ...errand, assignedUserId: 'somebody.else' };

    expect(() => assertErrandFactsUnchanged(taken, seen, ['assignedUserId', 'status'])).toThrow(
      expect.objectContaining({ status: 409, message: ERRAND_CHANGED_ELSEWHERE_MESSAGE }),
    );
  });

  it('refuses a command that does not send what the handler saw of a fact it depends on', () => {
    expect(() => assertErrandFactsUnchanged(errand, { status: seen.status }, ['assignedUserId', 'status'])).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining('assignedUserId') }),
    );
    expect(() => assertErrandFactsUnchanged(errand, undefined, ['status'])).toThrow(expect.objectContaining({ status: 400 }));
  });
});
