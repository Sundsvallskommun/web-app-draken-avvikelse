import { apiService } from '@common/services/api-service';

import { InvestigationProfile, parseInvestigationProfile } from './investigation-profile';

export async function getInvestigationProfile(): Promise<InvestigationProfile> {
  const response = await apiService.get<unknown>('supportmanagement/investigation-profile', { timeout: 10_000 });
  return parseInvestigationProfile(response.data);
}
