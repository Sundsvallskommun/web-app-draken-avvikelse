import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import type { Errand, Label } from '@/data-contracts/supportmanagement/data-contracts';

type IdentifiedLabel = Label & { id: string };

/**
 * The metadata labels from the top of the tree down to the label at `resourcePath`, or `undefined` when the path
 * is not in the tree exactly once. The path is matched whole, never split into names.
 */
const findLabelChain = (labelStructure: readonly Label[] | undefined, resourcePath: string): IdentifiedLabel[] | undefined => {
  const wanted = normalizeSupportManagementResourcePath(resourcePath);
  const chains: IdentifiedLabel[][] = [];
  const visit = (nodes: readonly Label[] | undefined, ancestors: IdentifiedLabel[]): void => {
    for (const node of nodes ?? []) {
      if (typeof node.id !== 'string' || node.id === '') continue;
      const chain = [...ancestors, node as IdentifiedLabel];
      if (normalizeSupportManagementResourcePath(node.resourcePath) === wanted) chains.push(chain);
      visit(node.labels, chain);
    }
  };
  visit(labelStructure, []);
  return chains.length === 1 ? chains[0] : undefined;
};

const labelIds = (labels: readonly { id?: string }[] | undefined): string[] =>
  (labels ?? []).map(label => label.id).filter((id): id is string => typeof id === 'string' && id !== '');

interface LabelAdditionInput {
  readonly currentLabels: Errand['labels'];
  readonly labelStructure: readonly Label[] | undefined;
  readonly resourcePath: string;
}

/**
 * The complete label id list with one label added, every label the errand carries kept.
 *
 * The label is added with its chain up to the top of the tree, as registration adds them. Support Management
 * replaces the label collection wholesale, so the result repeats every label the errand keeps.
 *
 * Returns `undefined` when there is nothing to write: the errand already carries the label, or the label is not
 * in the metadata, so a namespace that has not configured it is left alone.
 */
export const buildLabelAdditionUpdate = ({ currentLabels, labelStructure, resourcePath }: LabelAdditionInput): { id: string }[] | undefined => {
  const chain = findLabelChain(labelStructure, resourcePath);
  if (!chain) return undefined;

  const currentIds = labelIds(currentLabels);
  const missingIds = chain.map(label => label.id).filter(id => !currentIds.includes(id));
  return missingIds.length === 0 ? undefined : [...currentIds, ...missingIds].map(id => ({ id }));
};

interface PermanentLabelsInput<TLabel extends { id?: string }> {
  /** The labels a write is about to give the errand. */
  readonly labels: readonly TLabel[];
  readonly currentLabels: Errand['labels'];
  readonly labelStructure: readonly Label[] | undefined;
  readonly permanentResourcePaths: readonly string[];
}

/**
 * The labels a write gives the errand, with every permanent label the errand carries kept on it: one the write
 * leaves out is put back with the levels above it, as it was added, each as the metadata describes it. A permanent
 * label the errand does not carry, or one the namespace has not configured, changes nothing.
 */
export const withPermanentLabelsKept = <TLabel extends { id?: string }>({
  labels,
  currentLabels,
  labelStructure,
  permanentResourcePaths,
}: PermanentLabelsInput<TLabel>): (TLabel | Label)[] => {
  const currentIds = new Set(labelIds(currentLabels));
  const sentIds = new Set(labelIds(labels));
  const keptLabels = permanentResourcePaths
    .map(resourcePath => findLabelChain(labelStructure, resourcePath))
    .filter((chain): chain is IdentifiedLabel[] => chain !== undefined && currentIds.has(chain[chain.length - 1].id))
    .flat()
    .filter(label => !sentIds.has(label.id));
  // Each label on its own, as an errand carries it: the levels beneath are separate labels of their own.
  const uniqueKeptLabels = new Map(keptLabels.map(label => [label.id, { ...label, labels: undefined }]));
  return [...labels, ...uniqueKeptLabels.values()];
};
