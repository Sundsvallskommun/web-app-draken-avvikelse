import authMiddleware from '@middlewares/auth.middleware';
import { Controller, Get, Header, Param, QueryParam, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID, SUPERADMIN_GROUP } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { type HandlerGroupRole, resolveHandlerGroupRoles, resolveHeldHandlerRoleKeys } from '@/config/handler-group-roles';
import { PortalPersonData } from '@/data-contracts/employee/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import { Permissions } from '@/interfaces/users.interface';
import { readRoleGroups } from '@/services/ad-role.service';
import ApiService from '@/services/api.service';

interface UserData {
  name: string;
  firstName: string;
  lastName: string;
  username: string;
  userSettings: any;
  permissions: Permissions;
  /** The handler roles the user holds through their AD groups. */
  roleKeys: string[];
  /** Whether the user is in the superadmin group - in the avvikelse applications, the administrators. */
  superadmin: boolean;
}

@Controller()
export class UserController {
  private apiService = new ApiService();
  private handlerRoles: readonly HandlerGroupRole[] = resolveHandlerGroupRoles();
  private superadminGroups = readRoleGroups(SUPERADMIN_GROUP);
  EMPLOYEE_SERVICE = apiServiceName('employee');

  @Get('/me')
  @OpenAPI({ summary: 'Return current user' })
  @UseBefore(authMiddleware)
  async getUser(@Req() req: RequestWithUser, @Res() response: any): Promise<UserData> {
    const { name, firstName, lastName, username, permissions, groups = [] } = req.user;

    if (!name) {
      throw new HttpException(400, 'Bad Request');
    }

    const userData: UserData = {
      name,
      firstName,
      lastName,
      username,
      userSettings: { username },
      permissions,
      roleKeys: resolveHeldHandlerRoleKeys(this.handlerRoles, groups),
      superadmin: groups.some(group => this.superadminGroups.includes(group.trim().toLowerCase())),
    };

    return response.send({ data: userData, message: 'success' });
  }

  @Get('/user/avatar')
  @OpenAPI({ summary: 'Return logged in person image' })
  @UseBefore(authMiddleware)
  @Header('Content-Type', 'image/jpeg')
  @Header('Cross-Origin-Embedder-Policy', 'require-corp')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async getMyEmployeeImage(@Req() req: RequestWithUser, @QueryParam('width') width: number): Promise<any> {
    const { personId } = req.user;

    if (!personId) {
      throw new HttpException(400, 'Bad Request');
    }

    const url = `${this.EMPLOYEE_SERVICE}/${MUNICIPALITY_ID}/${personId}/personimage`;
    const res = await this.apiService.get<any>(
      {
        url,
        responseType: 'arraybuffer',
        params: {
          width: width,
        },
      },
      req.user,
    );
    return res.data;
  }

  @Get('/user/:personId/avatar')
  @OpenAPI({ summary: 'Return another users image' })
  @UseBefore(authMiddleware)
  @Header('Content-Type', 'image/jpeg')
  @Header('Cross-Origin-Embedder-Policy', 'require-corp')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async getEmployeeImage(@Req() req: RequestWithUser, @Param('personId') personId: string, @QueryParam('width') width: number): Promise<any> {
    if (!personId) {
      throw new HttpException(400, 'Bad Request');
    }

    const url = `${this.EMPLOYEE_SERVICE}/${MUNICIPALITY_ID}/${personId}/personimage`;
    const res = await this.apiService.get<any>(
      {
        url,
        responseType: 'arraybuffer',
        params: {
          width: width,
        },
      },
      req.user,
    );
    return res.data;
  }

  @Get('/user/:adaccount')
  @OpenAPI({ summary: 'Return employee info' })
  @UseBefore(authMiddleware)
  @Header('Content-Type', 'application/json')
  async getEmployeeInfo(@Req() req: RequestWithUser, @Param('adaccount') adaccount: string): Promise<any> {
    if (!adaccount) {
      throw new HttpException(400, 'Bad Request');
    }

    const url = `${this.EMPLOYEE_SERVICE}/${MUNICIPALITY_ID}/portalpersondata/PERSONAL/${adaccount}`;
    const res = await this.apiService.get<PortalPersonData>(
      {
        url,
      },
      req.user,
    );
    return res;
  }
}
