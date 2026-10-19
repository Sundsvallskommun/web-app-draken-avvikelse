import authMiddleware from '@middlewares/auth.middleware';
import { Controller, Get, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { RequestWithUser } from '@/interfaces/auth.interface';
import { AssignableHandler, HandlerDirectoryService } from '@/services/handler-directory.service';

export type { AdUser } from '@/services/handler-directory.service';

interface ResponseData<T> {
  data: T;
  message: string;
}

/** Presentation metadata for one handler role, in the order the deployment configured it. */
interface AssignableHandlerRole {
  key: string;
  label: string;
}

export interface AssignableHandlersResponse extends ResponseData<AssignableHandler[]> {
  roles: AssignableHandlerRole[];
}

@Controller()
export class ActiveDirectoryController {
  private readonly handlerDirectory = new HandlerDirectoryService();

  @Get('/users/admins')
  @OpenAPI({ summary: 'Return users in the configured assignable handler groups' })
  @UseBefore(authMiddleware)
  async getAssignableHandlers(@Req() req: RequestWithUser): Promise<AssignableHandlersResponse> {
    const data = await this.handlerDirectory.listHandlers(req.user);
    return { data, roles: this.handlerDirectory.roles.map(({ key, label }) => ({ key, label })), message: 'ok' };
  }
}
