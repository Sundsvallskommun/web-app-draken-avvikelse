import { Type as TypeTransformer } from 'class-transformer';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Controller, Get, Param, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import {
  Category as ICategory,
  ContactReason as IContactReason,
  ExternalIdType as IExternalIdType,
  Label as ILabel,
  LabelAttribute as ILabelAttribute,
  Labels as ILabels,
  MeasureType as IMeasureType,
  MetadataResponse as IMetadataResponse,
  Phase as IPhase,
  PhaseTransition as IPhaseTransition,
  Role as IRole,
  Status as IStatus,
  Type as IType,
} from '@/data-contracts/supportmanagement/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import ApiService from '@/services/api.service';

class Type implements IType {
  @IsString()
  name!: string;
  @IsString()
  @IsOptional()
  displayName?: string;
  @IsString()
  @IsOptional()
  escalationEmail?: string;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsString()
  @IsOptional()
  created?: string;
  @IsString()
  @IsOptional()
  modified?: string;
}

class Category implements ICategory {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  @IsOptional()
  name?: string;
  @IsString()
  @IsOptional()
  displayName?: string;
  @IsNumber()
  @IsOptional()
  sortOrder?: number | null;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => Type)
  @IsOptional()
  types?: IType[];
  @IsString()
  @IsOptional()
  created?: string;
  @IsString()
  @IsOptional()
  modified?: string;
}

class ExternalIdType implements IExternalIdType {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  name!: string;
  @IsString()
  @IsOptional()
  displayName?: string | null;
  @IsNumber()
  @IsOptional()
  sortOrder?: number | null;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsString()
  @IsOptional()
  created?: string;
  @IsString()
  @IsOptional()
  modified?: string;
}

class LabelAttribute implements ILabelAttribute {
  @IsString()
  key!: string;
  @IsString()
  value!: string;
}

class Label implements ILabel {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  classification!: string;
  @IsString()
  @IsOptional()
  displayName?: string;
  @IsString()
  @IsOptional()
  resourcePath?: string;
  @IsString()
  resourceName!: string;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => Label)
  @IsOptional()
  labels?: ILabel[];
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => LabelAttribute)
  @IsOptional()
  attributes?: ILabelAttribute[];
}

class Labels implements ILabels {
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => Label)
  @IsOptional()
  labelStructure?: ILabel[];
}

class Status implements IStatus {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  name!: string;
  @IsString()
  @IsOptional()
  displayName?: string | null;
  @IsString()
  @IsOptional()
  externalDisplayName?: string | null;
  @IsNumber()
  @IsOptional()
  sortOrder?: number | null;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsString()
  @IsOptional()
  created?: string;
  @IsString()
  @IsOptional()
  modified?: string;
}

class Role implements IRole {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  name!: string;
  @IsString()
  @IsOptional()
  displayName?: string | null;
  @IsNumber()
  @IsOptional()
  sortOrder?: number | null;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsString()
  @IsOptional()
  created?: string;
  @IsString()
  @IsOptional()
  modified?: string;
}

class ContactReason implements IContactReason {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  reason!: string;
  @IsString()
  @IsOptional()
  displayName?: string | null;
  @IsNumber()
  @IsOptional()
  sortOrder?: number | null;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsString()
  @IsOptional()
  created?: string;
  @IsString()
  @IsOptional()
  modified?: string;
}

class PhaseTransition implements IPhaseTransition {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  targetPhaseId!: string;
  @IsString()
  @IsOptional()
  targetPhaseName?: string;
  @IsString()
  @IsOptional()
  targetPhaseDisplayName?: string;
  @IsString()
  @IsOptional()
  description?: string;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
}

class Phase implements IPhase {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  name!: string;
  @IsString()
  @IsOptional()
  displayName?: string;
  @IsString()
  @IsOptional()
  description?: string;
  @IsNumber()
  @IsOptional()
  phaseOrder?: number;
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedStatuses?: string[];
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => PhaseTransition)
  @IsOptional()
  transitions?: IPhaseTransition[];
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsString()
  @IsOptional()
  created?: string;
  @IsString()
  @IsOptional()
  modified?: string;
}

class MeasureType implements IMeasureType {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  name!: string;
  @IsString()
  @IsOptional()
  displayName?: string | null;
  @IsArray()
  @IsString({ each: true })
  measureGroups!: string[];
  @IsNumber()
  @IsOptional()
  sortOrder?: number | null;
  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;
  @IsString()
  @IsOptional()
  created?: string;
  @IsString()
  @IsOptional()
  modified?: string;
}

class MetadataResponse implements IMetadataResponse {
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => Category)
  @IsOptional()
  categories?: ICategory[];
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => ExternalIdType)
  @IsOptional()
  externalIdTypes?: IExternalIdType[];
  @ValidateNested()
  @TypeTransformer(() => Labels)
  @IsOptional()
  labels?: ILabels;
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => Status)
  @IsOptional()
  statuses?: IStatus[];
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => Role)
  @IsOptional()
  roles?: IRole[];
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => ContactReason)
  @IsOptional()
  contactReasons?: IContactReason[];
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => Phase)
  @IsOptional()
  phases?: IPhase[];
  @IsArray()
  @ValidateNested({ each: true })
  @TypeTransformer(() => MeasureType)
  @IsOptional()
  measureTypes?: IMeasureType[];
}

@Controller()
export class SupportMetadataController {
  private apiService = new ApiService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  private SERVICE = apiServiceName('supportmanagement');

  @Get('/supportmetadata/:municipalityId')
  @OpenAPI({ summary: 'Get support metadata' })
  @ResponseSchema(MetadataResponse)
  @UseBefore(authMiddleware)
  async fetchSupportMetadata(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Res() response: any,
  ): Promise<IMetadataResponse> {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/metadata`;
    const res = await this.apiService.get<IMetadataResponse>({ url }, req.user);
    return response.status(200).send(res.data);
  }

  @Get('/supportmetadata/:municipalityId/roles')
  @OpenAPI({ summary: 'Get support roles' })
  @ResponseSchema(Role, { isArray: true })
  @UseBefore(authMiddleware)
  async fetchSupportMetadataRoles(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Res() response: any,
  ): Promise<IRole[]> {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/metadata/roles`;
    const res = await this.apiService.get<IRole[]>({ url }, req.user);
    return response.status(200).send(res.data);
  }
}
