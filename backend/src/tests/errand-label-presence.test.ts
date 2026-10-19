import type { Errand, Label } from '@/data-contracts/supportmanagement/data-contracts';
import { buildLabelAdditionUpdate, withPermanentLabelsKept } from '@/services/errand-label-presence';

const highHslRisk: Label = { id: 'high-hsl', classification: 'risk', resourceName: 'HIGH_HSL', resourcePath: 'RISK/HIGH_HSL', labels: [] };
const hslStarted: Label = {
  id: 'hsl-started',
  classification: 'analysis',
  resourceName: 'HSL_STARTED',
  resourcePath: 'ANALYSIS/HSL_STARTED',
  labels: [],
};
const labelStructure: Label[] = [
  { id: 'risk-root', classification: 'risk-root', resourceName: 'RISK', resourcePath: 'RISK', labels: [highHslRisk] },
  { id: 'analysis-root', classification: 'analysis-root', resourceName: 'ANALYSIS', resourcePath: 'ANALYSIS', labels: [hslStarted] },
  {
    id: 'report-root',
    classification: 'report-type-root',
    resourceName: 'REPORT_TYPE',
    resourcePath: 'REPORT_TYPE',
    labels: [{ id: 'deviation', classification: 'report-type', resourceName: 'DEVIATION', resourcePath: 'REPORT_TYPE/DEVIATION', labels: [] }],
  },
];

const carried = (...ids: string[]): Errand['labels'] => ids.map(id => ({ id }) as Label);

describe('buildLabelAdditionUpdate', () => {
  const add = (currentLabels: Errand['labels'], structure: Label[] = labelStructure) =>
    buildLabelAdditionUpdate({ currentLabels, labelStructure: structure, resourcePath: 'RISK/HIGH_HSL' });

  it('adds the label with its root and keeps every other label', () => {
    expect(add(carried('report-root', 'deviation'))).toEqual([{ id: 'report-root' }, { id: 'deviation' }, { id: 'risk-root' }, { id: 'high-hsl' }]);
  });

  it('adds the root of a label the errand carries without it', () => {
    expect(add(carried('deviation', 'high-hsl'))).toEqual([{ id: 'deviation' }, { id: 'high-hsl' }, { id: 'risk-root' }]);
  });

  it('writes nothing when the errand already carries the label', () => {
    expect(add(carried('deviation', 'risk-root', 'high-hsl'))).toBeUndefined();
  });

  it('leaves the errand alone when the namespace has not configured the label', () => {
    expect(add(carried('deviation'), labelStructure.slice(2))).toBeUndefined();
  });
});

describe('withPermanentLabelsKept', () => {
  const keep = (labels: Label[], currentLabels: Errand['labels']) =>
    withPermanentLabelsKept({
      labels,
      currentLabels,
      labelStructure,
      permanentResourcePaths: ['RISK/HIGH_HSL', 'ANALYSIS/HSL_STARTED', 'ANALYSIS/VC_COMMENT_HSL'],
    });

  it('puts back a permanent label the write leaves out, with its root, as the metadata describes them', () => {
    const sent = carried('deviation') as Label[];

    expect(keep(sent, carried('deviation', 'risk-root', 'high-hsl', 'analysis-root', 'hsl-started'))).toEqual([
      { id: 'deviation' },
      { ...labelStructure[0], labels: undefined },
      { ...highHslRisk, labels: undefined },
      { ...labelStructure[1], labels: undefined },
      { ...hslStarted, labels: undefined },
    ]);
  });

  it('puts back only what the write leaves out', () => {
    const sent = carried('deviation', 'risk-root') as Label[];

    expect(keep(sent, carried('deviation', 'risk-root', 'high-hsl'))).toEqual([
      { id: 'deviation' },
      { id: 'risk-root' },
      { ...highHslRisk, labels: undefined },
    ]);
  });

  it('lets a write take off any label that is not permanent', () => {
    const sent = carried('risk-root', 'high-hsl') as Label[];

    expect(keep(sent, carried('report-root', 'deviation', 'risk-root', 'high-hsl'))).toEqual(sent);
  });

  // A permanent label is kept, never added: the write decides nothing about one the errand has not been given.
  it('adds no permanent label the errand does not carry, nor one the namespace has not configured', () => {
    const sent = carried('deviation') as Label[];

    expect(keep(sent, carried('deviation'))).toEqual(sent);
  });
});
