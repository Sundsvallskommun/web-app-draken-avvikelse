import { RequestWithUser } from '@interfaces/auth.interface';
import authMiddleware from '@middlewares/auth.middleware';
import ApiService from '@services/api.service';
import { Controller, Get, Param, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { apiServiceName } from '@/config/api-config';

interface ResponseData<T> {
  data: T;
  message: string;
}

@Controller()
export class JsonSchemaController {
  private apiService = new ApiService();
  JSONSCHEMA_SERVICE = apiServiceName('jsonschema');

  @Get('/:municipalityId/schemas')
  @OpenAPI({ summary: 'List JSON schemas' })
  @UseBefore(authMiddleware)
  async listJsonSchemas(@Req() req: RequestWithUser, @Param('municipalityId') municipalityId: string): Promise<ResponseData<any>> {
    const url = `${this.JSONSCHEMA_SERVICE}/${municipalityId}/schemas`;
    const res = await this.apiService.get<any>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }

  @Get('/:municipalityId/schemas/:id')
  @OpenAPI({ summary: 'Get JSON schema by id' })
  @UseBefore(authMiddleware)
  async getJsonSchema(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('id') id: string,
  ): Promise<ResponseData<any>> {
    const url = `${this.JSONSCHEMA_SERVICE}/${municipalityId}/schemas/${id}`;
    const res = await this.apiService.get<any>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }

  @Get('/:municipalityId/schemas/:name/latest')
  @OpenAPI({ summary: 'Get latest JSON schema by name' })
  @UseBefore(authMiddleware)
  async getLatestJsonSchema(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('name') name: string,
  ): Promise<ResponseData<any>> {
    const url = `${this.JSONSCHEMA_SERVICE}/${municipalityId}/schemas/${name}/versions/latest`;
    const res = await this.apiService.get<any>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }

  @Get('/:municipalityId/schemas/:id/ui-schema')
  @OpenAPI({ summary: 'Get UI schema for a JSON schema' })
  @UseBefore(authMiddleware)
  async getUiSchema(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('id') id: string,
  ): Promise<ResponseData<any>> {
    const url = `${this.JSONSCHEMA_SERVICE}/${municipalityId}/schemas/${id}/ui-schema`;
    const res = await this.apiService.get<any>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }
}
