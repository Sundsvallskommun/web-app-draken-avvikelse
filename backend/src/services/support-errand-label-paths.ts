import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import type { Label, Labels } from '@/data-contracts/supportmanagement/data-contracts';
import { User } from '@/interfaces/users.interface';
import ApiService from '@/services/api.service';
import { supportMetadataCache } from '@/services/support-metadata-cache';

/**
 * The normalized resource path of every label in the namespace's label tree, by id. The id is a label's identity:
 * a label on an errand need not carry its own path, so what a label is - a place, an access, a category - is read
 * from the tree.
 */
export type LabelPathsById = ReadonlyMap<string, string>;

export const indexLabelPathsById = (labelStructure: readonly Label[] | undefined): LabelPathsById => {
  const pathsById = new Map<string, string>();
  const visit = (nodes: readonly Label[] | undefined): void => {
    for (const node of nodes ?? []) {
      const resourcePath = normalizeSupportManagementResourcePath(node.resourcePath);
      if (typeof node.id === 'string' && node.id.length > 0 && resourcePath.length > 0) pathsById.set(node.id, resourcePath);
      visit(node.labels);
    }
  };
  visit(labelStructure);
  return pathsById;
};

/** The normalized resource path of an errand's label: the tree's, by its id, and the label's own where the tree has none. */
export const resolveLabelPath = (label: { id?: string; resourcePath?: string }, labelPaths: LabelPathsById): string =>
  (typeof label.id === 'string' ? labelPaths.get(label.id) : undefined) ?? normalizeSupportManagementResourcePath(label.resourcePath);

interface ReadLabelPathsRequest {
  readonly apiService: Pick<ApiService, 'get'>;
  readonly baseURL: string;
  readonly municipalityId: string;
  readonly namespace: string | undefined;
  readonly user: User;
}

/** The namespace's label paths, from its label metadata as the BFF keeps it (`supportMetadataCache`). */
export const readLabelPathsById = async ({
  apiService,
  baseURL,
  municipalityId,
  namespace,
  user,
}: ReadLabelPathsRequest): Promise<LabelPathsById> => {
  const labels = await supportMetadataCache.read<Labels | null>(
    apiService,
    { url: `${municipalityId}/${namespace}/metadata/labels`, baseURL, propagateClientError: true, mapUnauthorizedToForbidden: true },
    user,
  );
  return indexLabelPathsById(labels.data?.labelStructure);
};
