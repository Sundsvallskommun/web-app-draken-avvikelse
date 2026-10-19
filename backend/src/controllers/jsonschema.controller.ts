import { RequestWithUser } from '@interfaces/auth.interface';
import authMiddleware from '@middlewares/auth.middleware';
import ApiService from '@services/api.service';
import { Controller, Get, Param, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID } from '@/config';
import { apiServiceName } from '@/config/api-config';

interface ResponseData<T> {
  data: T;
  message: string;
}

@Controller()
export class JsonSchemaController {
  private apiService = new ApiService();
  JSONSCHEMA_SERVICE = apiServiceName('jsonschema');

  @Get('/schemas')
  @OpenAPI({ summary: 'List JSON schemas' })
  @UseBefore(authMiddleware)
  async listJsonSchemas(@Req() req: RequestWithUser): Promise<ResponseData<any>> {
    const url = `${this.JSONSCHEMA_SERVICE}/${MUNICIPALITY_ID}/schemas`;
    const res = await this.apiService.get<any>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }

  @Get('/schemas/:id')
  @OpenAPI({ summary: 'Get JSON schema by id' })
  @UseBefore(authMiddleware)
  async getJsonSchema(@Req() req: RequestWithUser, @Param('id') id: string): Promise<ResponseData<any>> {
    const url = `${this.JSONSCHEMA_SERVICE}/${MUNICIPALITY_ID}/schemas/${id}`;
    const res = await this.apiService.get<any>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }

  @Get('/schemas/:name/latest')
  @OpenAPI({ summary: 'Get latest JSON schema by name' })
  @UseBefore(authMiddleware)
  async getLatestJsonSchema(@Req() req: RequestWithUser, @Param('name') name: string): Promise<ResponseData<any>> {
    const url = `${this.JSONSCHEMA_SERVICE}/${MUNICIPALITY_ID}/schemas/${name}/versions/latest`;
    const res = await this.apiService.get<any>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }

  @Get('/schemas/:id/ui-schema')
  @OpenAPI({ summary: 'Get UI schema for a JSON schema' })
  @UseBefore(authMiddleware)
  async getUiSchema(@Req() req: RequestWithUser, @Param('id') id: string): Promise<ResponseData<any>> {
    const url = `${this.JSONSCHEMA_SERVICE}/${MUNICIPALITY_ID}/schemas/${id}/ui-schema`;
    const res = await this.apiService.get<any>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }
}
