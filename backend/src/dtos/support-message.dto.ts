import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import { v4 as uuidv4 } from 'uuid';

import {
  Communication,
  CommunicationAttachment,
  CommunicationCommunicationTypeEnum,
  CommunicationDirectionEnum,
} from '@/data-contracts/supportmanagement/data-contracts';

export class SupportMessageDto {
  @IsString()
  @IsNotEmpty()
  contactMeans!: string;
  @IsString()
  @IsNotEmpty()
  @ValidateIf(o => o.contactMeans === 'email')
  recipientEmail!: string;
  @IsString()
  @IsNotEmpty()
  @ValidateIf(o => o.contactMeans === 'sms')
  recipientPhone!: string;
  @IsString()
  plaintextMessage!: string;
  @IsString()
  htmlMessage!: string;
  @IsString()
  @IsOptional()
  senderName!: string;
  @IsString()
  subject!: string;
  @IsOptional()
  files!: Express.Multer.File[];
  @IsString()
  reply_to!: string;
  @IsString()
  references!: string;
  @IsOptional()
  attachmentIds!: string[];
}

class CCommunicationAttachment implements CommunicationAttachment {
  @IsString()
  @IsOptional()
  id?: string;
  @IsString()
  @IsOptional()
  fileName?: string;
  @IsString()
  @IsOptional()
  mimeType?: string;
}

export class CCommunication implements Communication {
  @IsString()
  @IsOptional()
  communicationID?: string;
  @IsString()
  @IsOptional()
  sender?: string;
  @IsString()
  @IsOptional()
  errandNumber?: string;
  @IsEnum(CommunicationDirectionEnum)
  @IsOptional()
  direction?: CommunicationDirectionEnum;
  @IsString()
  @IsOptional()
  messageBody?: string;
  @IsString()
  @IsOptional()
  sent?: string;
  @IsString()
  @IsOptional()
  subject?: string;
  @IsEnum(CommunicationCommunicationTypeEnum)
  @IsOptional()
  communicationType!: CommunicationCommunicationTypeEnum;
  @IsString()
  @IsOptional()
  target?: string;
  @IsBoolean()
  @IsOptional()
  internal?: boolean;
  @IsBoolean()
  @IsOptional()
  viewed?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @JSONSchema({ type: 'array', items: { type: 'string' } })
  ccRecipients?: string[];
  @IsString()
  @IsOptional()
  emailHeaders?: Record<string, string[]>;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CCommunicationAttachment)
  communicationAttachments?: CommunicationAttachment[];
}

export const generateMessageId = () => `<${uuidv4()}@CONTACTCENTER>`;
