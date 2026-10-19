'use client';

import { ApiResponse, apiService } from '@common/services/api-service';

export interface OrgManagerDTO {
  personId?: string;
  givenname?: string;
  lastname?: string;
  emailAddress?: string;
}

export interface UserEmploymentDTO {
  orgId?: number;
  orgName?: string;
  topOrgId?: number;
  isMainEmployment?: boolean;
  manager?: OrgManagerDTO;
}

export const getUserEmployments = async (): Promise<UserEmploymentDTO[]> => {
  const res = await apiService.get<ApiResponse<UserEmploymentDTO[]>>('employee/employments');
  return res.data.data || [];
};
