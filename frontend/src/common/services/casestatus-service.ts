import { ApiResponse, apiService } from './api-service';
import { sortBy } from './helper-service';

export interface CaseStatusResponse {
  caseId?: string;
  externalCaseId?: string;
  caseType?: string;
  status?: string;
  externalStatus?: string;
  firstSubmitted?: string;
  lastStatusChange?: string;
  system?: string;
  namespace?: string;
  errandNumber?: string;
}

export const getStatusesUsingPartyId = (partyId: string) => {
  if (!partyId) {
    return Promise.resolve([]);
  }
  const url = `party/${partyId}/statuses`;

  return apiService
    .get<ApiResponse<any>>(url)
    .then((res) => {
      const sortedData = sortBy(res.data.data, 'firstSubmitted').slice(0, 200);
      return sortedData;
    })
    .catch((e) => {
      console.error('Something went wrong when creating relation: ' + e);
      throw e;
    });
};
