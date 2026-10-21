import type { Errand, Label } from '@/data-contracts/supportmanagement/data-contracts';
import { assertErrandFactsUnchanged, ERRAND_CHANGED_ELSEWHERE_MESSAGE, errandFacts, withErrandFacts } from '@/services/support-errand-facts';
import { indexLabelPathsById, resolveLabelPath } from '@/services/support-errand-label-paths';

import { mockAdUsername } from './helpers/mock-data';

const node = (id: string, resourcePath: string, labels?: Label[]): Label => ({
  id,
  resourcePath,
  classification: resourcePath.split('/')[0],
  resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
  ...(labels ? { labels } : {}),
});

// The namespace's label tree, as `metadata/labels` answers it.
const labelStructure: Label[] = [
  node('category', 'CATEGORY', [node('category-hsl', 'CATEGORY/HSL', [node('category-fall', 'CATEGORY/HSL/FALL')])]),
  node('location', 'LOCATION', [node('location-north', 'LOCATION/NORTH'), node('location-south', 'LOCATION/SOUTH')]),
  node('access', 'ACCESS', [node('access-lex', 'ACCESS/LEX')]),
  node('risk', 'RISK', [node('risk-high-hsl', 'RISK/HIGH_HSL')]),
];
const labelPaths = indexLabelPathsById(labelStructure);
const noLabelTree = indexLabelPathsById(undefined);

const label = (id: string, resourcePath: string) => ({ id, resourcePath });
// Support Management may leave a label's own path out on the errand; the id is its identity.
const bare = (id: string | undefined) => ({ id });

const errand: Errand = {
  id: 'errand-1',
  title: 'Fall i badrummet',
  status: 'ONGOING',
  assignedUserId: mockAdUsername,
  classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/FALL' },
  labels: [
    label('location-north', 'LOCATION/NORTH'),
    label('access-lex', 'ACCESS/LEX'),
    label('category-hsl', 'CATEGORY/HSL'),
    label('category-fall', 'CATEGORY/HSL/FALL'),
  ],
  phases: [{ phaseId: 'investigation' }],
};

describe('indexLabelPathsById', () => {
  it('reads every label of the tree by its id, and an errand label by its own path where the tree has none', () => {
    expect(resolveLabelPath(bare('risk-high-hsl'), labelPaths)).toBe('RISK/HIGH_HSL');
    expect(resolveLabelPath(label('not-in-tree', 'LOCATION/WEST'), labelPaths)).toBe('LOCATION/WEST');
    expect(resolveLabelPath(bare('not-in-tree'), labelPaths)).toBe('');
  });
});

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

    expect(errandFacts(reordered, labelPaths)).toEqual(errandFacts(errand, labelPaths));
  });

  // The errand's version is bookkeeping: it moves with every write beneath the errand, and says nothing of its facts.
  it('leaves the version out of every fact', () => {
    expect(errandFacts({ ...errand, version: 99 }, labelPaths)).toEqual(errandFacts({ ...errand, version: 1 }, labelPaths));
  });

  // What a label is comes from the tree, so the facts read the same whether upstream sent the labels' paths or not.
  it('reads the same whether the errand’s labels carry their own paths or not', () => {
    const withoutPaths = { ...errand, labels: (errand.labels ?? []).map(({ id }) => bare(id)) };

    expect(errandFacts(withoutPaths, labelPaths)).toEqual(errandFacts(errand, labelPaths));
  });

  // A document saved with the classification may add the high HSL risk, with the level above it, as a label is added;
  // a handover moves the routing labels. Neither is a change of the classification.
  it('keeps only the classification’s own labels in the classification', () => {
    const withRisk = { ...errand, labels: [...(errand.labels ?? []), bare('risk'), bare('risk-high-hsl')] };
    const handedOver = {
      ...errand,
      labels: [label('location-south', 'LOCATION/SOUTH'), label('category-hsl', 'CATEGORY/HSL'), label('category-fall', 'CATEGORY/HSL/FALL')],
    };

    expect(errandFacts(withRisk, labelPaths).classification).toBe(errandFacts(errand, labelPaths).classification);
    expect(errandFacts(handedOver, labelPaths).classification).toBe(errandFacts(errand, labelPaths).classification);
    expect(errandFacts(handedOver, labelPaths).routingLabels).not.toBe(errandFacts(errand, labelPaths).routingLabels);
    expect(errandFacts(withRisk, labelPaths).labels).not.toBe(errandFacts(errand, labelPaths).labels);
  });

  it('sees a classification label chosen anew, and a place moved, also where the labels carry no path', () => {
    const bareErrand = { ...errand, labels: (errand.labels ?? []).map(({ id }) => bare(id)) };
    const reclassified = { ...bareErrand, labels: [bare('location-north'), bare('access-lex'), bare('category-hsl')] };
    const moved = { ...bareErrand, labels: [bare('location-south'), bare('access-lex'), bare('category-hsl'), bare('category-fall')] };

    expect(errandFacts(reclassified, labelPaths).classification).not.toBe(errandFacts(bareErrand, labelPaths).classification);
    expect(errandFacts(moved, labelPaths).routingLabels).not.toBe(errandFacts(bareErrand, labelPaths).routingLabels);
    expect(errandFacts(moved, labelPaths).classification).toBe(errandFacts(bareErrand, labelPaths).classification);
  });

  it('reads the active phase off the phase history', () => {
    const moved = { ...errand, phases: [{ phaseId: 'investigation', ended: '2026-10-01T00:00:00Z' }, { phaseId: 'decision' }] };

    expect(errandFacts(moved, labelPaths).activePhase).not.toBe(errandFacts(errand, labelPaths).activePhase);
    expect(errandFacts(moved, labelPaths).status).toBe(errandFacts(errand, labelPaths).status);
  });
});

describe('withErrandFacts', () => {
  it('takes the facts from the errand as upstream answered it, not as the BFF prepared it for the client', () => {
    const prepared = { ...errand, stakeholders: [{ role: 'PRIMARY', personNumber: 'added by the BFF' }] };

    expect(withErrandFacts(prepared, labelPaths, errand).facts).toEqual(errandFacts(errand, labelPaths));
  });
});

describe('assertErrandFactsUnchanged', () => {
  const seen = errandFacts(errand, labelPaths);

  it('lets a command through when the facts it depends on are as the handler saw them', () => {
    const elsewhereChanged = { ...errand, title: 'Ändrad av någon annan', version: 12 };

    expect(() => assertErrandFactsUnchanged(elsewhereChanged, seen, ['assignedUserId', 'status'], labelPaths)).not.toThrow();
  });

  // The save of a unit manager's investigation that assesses a high HSL risk, and the classification saved with it.
  it('lets the classification through after the document saved with it added the high HSL risk', () => {
    const withRisk = { ...errand, labels: [...(errand.labels ?? []), bare('risk'), bare('risk-high-hsl')], version: 9 };

    expect(() => assertErrandFactsUnchanged(withRisk, seen, ['classification'], labelPaths)).not.toThrow();
  });

  it('refuses a command when a fact it depends on changed since the handler saw it', () => {
    const taken = { ...errand, assignedUserId: 'somebody.else' };

    expect(() => assertErrandFactsUnchanged(taken, seen, ['assignedUserId', 'status'], labelPaths)).toThrow(
      expect.objectContaining({ status: 409, message: ERRAND_CHANGED_ELSEWHERE_MESSAGE }),
    );
  });

  it('refuses a command that does not send what the handler saw of a fact it depends on', () => {
    expect(() => assertErrandFactsUnchanged(errand, { status: seen.status }, ['assignedUserId', 'status'], noLabelTree)).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringContaining('assignedUserId') }),
    );
    expect(() => assertErrandFactsUnchanged(errand, undefined, ['status'], noLabelTree)).toThrow(expect.objectContaining({ status: 400 }));
  });
});
