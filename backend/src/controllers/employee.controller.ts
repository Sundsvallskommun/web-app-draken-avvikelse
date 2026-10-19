import authMiddleware from '@middlewares/auth.middleware';
import { Controller, Get, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { EmploymentV2 } from '@/data-contracts/employee/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { EmploymentService } from '@/services/employment.service';

interface UserEmploymentDTO {
  orgId?: number;
  orgName?: string;
  topOrgId?: number;
  isMainEmployment?: boolean;
  manager?: {
    personId?: string;
    givenname?: string;
    lastname?: string;
    emailAddress?: string;
  };
}

@Controller()
export class EmployeeController {
  private employmentService = new EmploymentService();

  @Get('/employee/employments')
  @OpenAPI({ summary: 'Get current user employments with organization info' })
  @UseBefore(authMiddleware)
  async getEmployments(@Req() req: RequestWithUser, @Res() response: any): Promise<UserEmploymentDTO[]> {
    try {
      const employments = (await this.employmentService.readEmployments(req.user)).map(
        (emp: EmploymentV2): UserEmploymentDTO => ({
          orgId: emp.orgId,
          orgName: emp.orgName ?? undefined,
          topOrgId: emp.topOrgId,
          isMainEmployment: emp.isMainEmployment,
          manager: emp.manager
            ? {
                personId: emp.manager.personId,
                givenname: emp.manager.givenname ?? undefined,
                lastname: emp.manager.lastname ?? undefined,
                emailAddress: emp.manager.emailAddress ?? undefined,
              }
            : undefined,
        }),
      );

      return response.send({ data: employments, message: 'success' });
    } catch (error: any) {
      console.error('Failed to get employments:', error);
      return response.send({ data: [], message: 'success' });
    }
  }
}
