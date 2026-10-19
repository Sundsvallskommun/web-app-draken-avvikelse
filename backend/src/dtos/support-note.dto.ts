import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Longest note body Support Management stores. */
export const SUPPORT_NOTE_BODY_MAX_LENGTH = 2048;

/** The writer supplies the text and whom it concerns; kind, attribution and subject are set by Draken. */
export class CreateSupportServiceNoteDto {
  @IsString()
  @IsOptional()
  partyId?: string;
  @IsString()
  @Matches(/\S/)
  @MaxLength(SUPPORT_NOTE_BODY_MAX_LENGTH)
  body!: string;
}
