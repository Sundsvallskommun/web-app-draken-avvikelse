import { RequestWithUser } from '@interfaces/auth.interface';
import authMiddleware from '@middlewares/auth.middleware';
import { validationMiddleware } from '@middlewares/validation.middleware';
import ApiService from '@services/api.service';
import { IsString } from 'class-validator';
import { Body, Controller, Get, Param, Post, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { logger } from '@/utils/logger';

class SsnPayload {
  @IsString()
  ssn!: string;
}

interface Citizenaddress {
  personId: string;
  givenname: string;
  lastname: string;
  gender: string;
  civilStatus: string;
  nrDate: string;
  classified: string;
  protectedNR: string;
  addresses: [
    {
      realEstateDescription: string;
      co?: string;
      address: string;
      addressArea?: string;
      addressNumber?: string;
      addressLetter?: string;
      appartmentNumber: string;
      postalCode: string;
      city: string;
      municipality: string;
      country: string;
      emigrated: boolean;
      addressType: string;
    },
  ];
}

interface EmployeeAddress {
  personid: string;
  givenname: string;
  lastname: string;
  fullname: string;
  address: string;
  postalCode: string;
  city: string;
  workPhone: string;
  mobilePhone: string;
  aboutMe: string;
  email: string;
  mailNickname: string;
  company: string;
  companyId: number;
  title: string;
  orgTree: string;
  referenceNumber: string;
  isManager: boolean;
  loginName: string;
  department: string;
}

interface EmployedPersonData {
  domain: string;
  loginName: string;
}

interface ResponseData {
  data: Citizenaddress;
  message: string;
}

@Controller()
export class AddressController {
  private apiService = new ApiService();
  CITIZEN_SERVICE = apiServiceName('citizen');
  EMPLOYEE_SERVICE = apiServiceName('employee');

  @Post('/address/')
  @OpenAPI({ summary: 'Return adress for given person number' })
  @UseBefore(authMiddleware, validationMiddleware(SsnPayload, 'body'))
  async cases(@Req() req: RequestWithUser, @Res() response: any, @Body() ssnPayload: SsnPayload): Promise<ResponseData> {
    const guidUrl = `${this.CITIZEN_SERVICE}/${MUNICIPALITY_ID}/${ssnPayload.ssn}/guid`;
    const guidRes = await this.apiService.get<string>({ url: guidUrl }, req.user);

    const url = `${this.CITIZEN_SERVICE}/${MUNICIPALITY_ID}/${guidRes.data}`;
    const res = await this.apiService.get<Citizenaddress>({ url }, req.user);

    return { data: res.data, message: 'success' } as ResponseData;
  }

  @Get('/portalpersondata/personal/:loginName')
  @OpenAPI({ summary: 'Fetch user information for given AD user' })
  @UseBefore(authMiddleware)
  async username(
    @Req() req: RequestWithUser,
    @Param('loginName') loginName: string,
    @Res() _response: any,
  ): Promise<{ data: EmployeeAddress; message: string } | undefined> {
    const baseUrl = `${this.EMPLOYEE_SERVICE}/${MUNICIPALITY_ID}/portalpersondata/PERSONAL/${loginName}`;
    const res = await this.apiService.get<EmployeeAddress>({ url: baseUrl }, req.user).catch(e => {
      logger.error('Error when fetching user information');
      throw e;
    });
    const personId = res.data?.personid;

    if (personId) {
      const empUrl = `${this.EMPLOYEE_SERVICE}/${MUNICIPALITY_ID}/employments?personId=${personId}`;
      const empRes = await this.apiService.get<any[]>({ url: empUrl }, req.user).catch(_e => {
        logger.error('Error when fetching employment data');
        return { data: [] };
      });
      const data = empRes?.data?.[0];
      const employment = data?.employments?.[0];
      if (data && employment) {
        res.data.title = employment?.title || '';
        res.data.referenceNumber = data?.referenceNumbers?.[0]?.referenceNumber || '';
        res.data.department = employment?.orgName || '';
      }

      return {
        data: res.data,
        message: 'success',
      };
    }
  }

  @Get('/employed/:personalNumber/loginname')
  @OpenAPI({ summary: 'Fetch employed user information' })
  @UseBefore(authMiddleware)
  async employed(
    @Req() req: RequestWithUser,
    @Param('personalNumber') personalNumber: string,
    @Res() _response: any,
  ): Promise<{ data: EmployedPersonData; message: string }> {
    const guidUrl = `${this.CITIZEN_SERVICE}/${MUNICIPALITY_ID}/${personalNumber}/guid`;
    const guidRes = await this.apiService.get<string>({ url: guidUrl }, req.user);
    if (!guidRes.data) {
      throw new Error('No data found for the given personal number');
    }
    const url = `${this.EMPLOYEE_SERVICE}/${MUNICIPALITY_ID}/employed/${guidRes.data}/accounts`;
    const res = await this.apiService.get<EmployedPersonData>({ url }, req.user).catch(e => {
      logger.error('Error when fetching employed user information');
      throw e;
    });
    return { data: res.data, message: 'success' };
  }
}
