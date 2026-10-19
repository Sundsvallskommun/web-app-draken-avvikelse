import { MetadataResponse, Type } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService } from '@common/services/api-service';
import { sortBy } from '@common/services/helper-service';

export type SupportType = Type;

export type SupportMetadata = MetadataResponse;

export const getSupportMetadata: () => Promise<{ metadata: SupportMetadata; error?: string }> = () => {
  let url = `supportmetadata`;
  return apiService
    .get<SupportMetadata>(url)
    .then((res: any) => {
      const meta = res.data;
      meta.categories = sortBy(meta.categories, 'displayName');
      return { metadata: meta };
    })
    .catch(
      (e) =>
        ({ metadata: undefined as unknown as SupportMetadata, error: e.response?.status ?? 'UNKNOWN ERROR' } as {
          metadata: SupportMetadata;
          error?: string;
        })
    );
};
