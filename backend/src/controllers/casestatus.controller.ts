import { Controller, Get, Param, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { CaseStatusResponse } from '@/data-contracts/casestatus/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import ApiService from '@/services/api.service';
import { logger } from '@/utils/logger';
import { apiURL } from '@/utils/util';

// Casestatus answers with errands from every system the person or organization has one in. Only the
// errands within this application's own namespace are shown: another application's errands, and a
// system's that names no namespace, never are.
const isOwnNamespaceCase = (caseStatus: CaseStatusResponse) => !!SUPPORTMANAGEMENT_NAMESPACE && caseStatus.namespace === SUPPORTMANAGEMENT_NAMESPACE;

const filterVisibleCases = (cases: CaseStatusResponse[]): CaseStatusResponse[] => cases.filter(isOwnNamespaceCase);

@Controller()
export class CaseStatusController {
  private apiService = new ApiService();

  private SERVICE = apiServiceName('casestatus');

  @Get('/:municipalityId/party/:partyId/statuses')
  @OpenAPI({ summary: 'Get all statuses connected to a partyId' })
  @UseBefore(authMiddleware)
  async getStatusesUsingPartyId(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('partyId') partyId: string,
  ): Promise<{ data: any; message: string }> {
    const url = `${municipalityId}/party/${partyId}/statuses`;
    const baseURL = apiURL(this.SERVICE);
    const res = await this.apiService.get<any>({ url, baseURL }, req.user).catch(e => {
      logger.error('Error when fetching relations: ', e);
      throw e;
    });
    return { data: filterVisibleCases(res.data), message: 'success' };
  }

  @Get('/:municipalityId/:organizationNumber/statuses')
  @OpenAPI({ summary: 'Get all statuses connected to a organizationNumber' })
  @UseBefore(authMiddleware)
  async getStatusesUsingOrganizationNumber(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('organizationNumber') organizationNumber: string,
  ): Promise<{ data: any; message: string }> {
    const url = `${municipalityId}/${organizationNumber}/statuses`;
    const baseURL = apiURL(this.SERVICE);
    const res = await this.apiService.get<any>({ url, baseURL }, req.user).catch(e => {
      logger.error('Error when fetching relations: ', e);
      throw e;
    });
    return { data: filterVisibleCases(res.data), message: 'success' };
  }

  @Get('/:municipalityId/errands/statuses/:query')
  @OpenAPI({ summary: 'Get errand statuses by errandNumber and propertyDesignation' })
  @UseBefore(authMiddleware)
  async getErrandStatus(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('query') query: string,
  ): Promise<{ data: any; message: string }> {
    const urlErrandNumber = `${municipalityId}/errands/statuses?errandNumber=${query}`;
    const urlPropertyDesignation = `${municipalityId}/errands/statuses?propertyDesignation=${query}`;
    const baseURL = apiURL(this.SERVICE);
    const resErrandNumber = await this.apiService.get<any>({ url: urlErrandNumber, baseURL }, req.user).catch(e => {
      logger.error('Error when fetching relations: ', e);
      throw e;
    });
    const resPropertyDesignation = await this.apiService.get<any>({ url: urlPropertyDesignation, baseURL }, req.user).catch(e => {
      logger.error('Error when fetching relations: ', e);
      throw e;
    });
    const combined: CaseStatusResponse[] = [...resErrandNumber.data, ...resPropertyDesignation.data];
    return { data: filterVisibleCases(combined), message: 'success' };
  }
}
