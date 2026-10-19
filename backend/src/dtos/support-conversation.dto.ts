import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

import {
  ConversationReadByCount,
  Identifier,
  IdentifierTypeEnum,
  MarkAsReadRequest,
  PartReadByCountEntry,
  ReadByCountEntry,
} from '@/data-contracts/supportmanagement/data-contracts';

export class MarkConversationMessagesAsReadDto implements MarkAsReadRequest {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  messageIds!: string[];
}

class ConversationIdentifierDto implements Identifier {
  @IsEnum(IdentifierTypeEnum)
  type!: IdentifierTypeEnum;

  @IsString()
  value!: string;
}

class ReadByCountEntryDto implements ReadByCountEntry {
  @IsOptional()
  @ValidateNested()
  @Type(() => ConversationIdentifierDto)
  identifier?: ConversationIdentifierDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  count?: number;
}

class PartReadByCountEntryDto implements PartReadByCountEntry {
  @IsOptional()
  @IsString()
  part?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  count?: number;
}

export class ConversationReadByCountDto implements ConversationReadByCount {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  messageCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReadByCountEntryDto)
  readByCount?: ReadByCountEntryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartReadByCountEntryDto)
  readByPartCount?: PartReadByCountEntryDto[];
}
