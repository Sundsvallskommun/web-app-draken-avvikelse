import { Controller, Get } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { User } from '@/interfaces/users.interface';
import ApiService from '@/services/api.service';
import { logger } from '@/utils/logger';

@Controller()
export class HealthController {
  private apiService = new ApiService();

  @Get('/health/up')
  @OpenAPI({ summary: 'Return health check' })
  async up() {
    const url = `simulatorserver/2.0/simulations/response?status=200%20OK`;
    const data = {
      status: 'OK',
    };
    const dummyUser: User = {
      id: 0,
      personId: '',
      name: '',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      username: '',
      groups: [],
      permissions: {
        canEditSupportManagement: false,
        canAdministerPlaceManagers: false,
      },
    };
    const res = await this.apiService.post<{ status: string }, { status: string }>({ url, data }, dummyUser).catch(e => {
      logger.error('Error when doing health check:', e);
      return e;
    });

    return res.data;
  }
}
