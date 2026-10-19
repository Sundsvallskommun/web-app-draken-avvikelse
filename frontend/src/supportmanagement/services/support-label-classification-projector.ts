import type { Classification, Label } from '@common/data-contracts/supportmanagement/data-contracts';

import { normalizeSupportManagementResourcePath } from './supportmanagement-path';

/** Which label classifications the investigation's label tree reads at each categorization level. */
export interface SupportLabelTreeProfile {
  readonly categoryClassification: string;
  readonly typeClassification: string;
}

export interface SupportErrandLabelSource {
  readonly labels?: readonly Label[];
  readonly classification?: Classification;
}

export interface SupportLabelMetadataSource {
  readonly labels?: { readonly labelStructure?: readonly Label[] };
}

export const normalizeClassification = (classification: string | undefined): string =>
  (classification ?? '').trim().replaceAll('_', '-').toUpperCase();

const normalizeResource = normalizeSupportManagementResourcePath;

export const findLabelByClassification = (
  labels: readonly Label[] | undefined,
  classification: string
): Label | undefined =>
  labels?.find((label) => normalizeClassification(label.classification) === normalizeClassification(classification));

export const flattenLabelTree = (labels: readonly Label[] | undefined): Label[] =>
  (labels ?? []).flatMap((label) => [label, ...flattenLabelTree(label.labels)]);

export const matchesResource = (label: Label, resource: string | undefined): boolean =>
  Boolean(
    resource &&
      [label.resourcePath, label.resourceName].some(
        (candidate) => candidate && normalizeResource(candidate) === normalizeResource(resource)
      )
  );

export const projectLabelCategory = (
  errand: SupportErrandLabelSource | undefined,
  metadata: SupportLabelMetadataSource | undefined,
  labelTree: SupportLabelTreeProfile
): Label | undefined => {
  const selectedCategory = findLabelByClassification(errand?.labels, labelTree.categoryClassification);
  if (selectedCategory) return selectedCategory;

  // Not a configurable mapping: the investigation persists the selected category in classification.type.
  return flattenLabelTree(metadata?.labels?.labelStructure).find(
    (label) =>
      normalizeClassification(label.classification) === normalizeClassification(labelTree.categoryClassification) &&
      matchesResource(label, errand?.classification?.type)
  );
};

export const projectMappedLabelSubType = (
  errand: SupportErrandLabelSource | undefined,
  labelTree: SupportLabelTreeProfile
): Label | undefined => findLabelByClassification(errand?.labels, labelTree.typeClassification);
