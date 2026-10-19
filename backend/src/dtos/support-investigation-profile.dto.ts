import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';

const SUPPORT_INVESTIGATION_IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const SUPPORT_INVESTIGATION_DOCUMENT_PLACEMENTS = ['investigation', 'decision', 'details'] as const;

/**
 * Where the errand page renders the document: the investigation tab (the default), the decision tab, or
 * Ärendeuppgifter. They share the document machinery; this only says where the document is offered.
 */
export type SupportInvestigationDocumentPlacement = (typeof SUPPORT_INVESTIGATION_DOCUMENT_PLACEMENTS)[number];

export const SUPPORT_INVESTIGATION_DOCUMENT_APPLICABILITIES = ['all', 'reported-misconduct', 'hsl-deviation', 'deviation'] as const;

/**
 * Which errands the document applies to. `all` (the default) offers it on every errand. The other
 * values restrict it to one kind of errand as the application's classification policy resolves it
 * - `reported-misconduct` for a reported misconduct, `hsl-deviation` for an ordinary deviation
 * under HSL, `deviation` for every errand but a reported misconduct - and the BFF refuses it on any
 * other errand.
 */
export type SupportInvestigationDocumentApplicability = (typeof SUPPORT_INVESTIGATION_DOCUMENT_APPLICABILITIES)[number];

export class SupportInvestigationDocumentProfileDto {
  @IsString()
  @MinLength(1)
  @Matches(SUPPORT_INVESTIGATION_IDENTIFIER)
  readonly key!: string;

  @IsString()
  @MinLength(1)
  @Matches(SUPPORT_INVESTIGATION_IDENTIFIER)
  readonly schemaName!: string;

  @IsString()
  @MinLength(1)
  readonly tabLabel!: string;

  @IsString()
  @MinLength(1)
  readonly ownerLabel!: string;

  @IsOptional()
  @IsIn(SUPPORT_INVESTIGATION_DOCUMENT_PLACEMENTS)
  readonly placement?: SupportInvestigationDocumentPlacement;

  @IsOptional()
  @IsIn(SUPPORT_INVESTIGATION_DOCUMENT_APPLICABILITIES)
  readonly appliesTo?: SupportInvestigationDocumentApplicability;

  /**
   * The key of another document in the same profile that must already be saved on the errand
   * before this one may be written: a decision that answers an investigation cannot precede it.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(SUPPORT_INVESTIGATION_IDENTIFIER)
  readonly prerequisiteDocumentKey?: string;
}

const SUPPORT_INVESTIGATION_DOCUMENT_ACCESS = ['edit', 'read', 'hidden'] as const;

/**
 * How far the signed-in user reaches into one investigation document: `edit` may change it, `read`
 * may only look at it, and `hidden` is not served at all. Write implies read, so the three levels
 * are ordered rather than independent flags.
 */
export type SupportInvestigationDocumentAccess = (typeof SUPPORT_INVESTIGATION_DOCUMENT_ACCESS)[number];

/** Effective document grants belong to an errand, never the application-wide profile. */
export class SupportInvestigationDocumentGrantDto {
  @IsString()
  readonly key!: string;

  @IsIn(SUPPORT_INVESTIGATION_DOCUMENT_ACCESS)
  readonly access!: SupportInvestigationDocumentAccess;
}

export class SupportInvestigationErrandAccessDto {
  @IsString()
  readonly municipalityId!: string;

  @IsString()
  readonly errandId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportInvestigationDocumentGrantDto)
  readonly documents!: readonly SupportInvestigationDocumentGrantDto[];
}

/** What the current user may do with one errand itself, as Support Management's /access answers it. */
export class SupportErrandAccessLevelDto {
  @IsIn(['LR', 'R', 'RW'])
  readonly level!: 'LR' | 'R' | 'RW';
}

/**
 * The report an errand arrives with - what happened, where and when. Katla writes it and it stays the
 * record of what was reported, so it is read-only, except on an errand registered in Draken: there
 * the unit manager fills it in, until the investigation starts.
 */
export class SupportInvestigationReportDocumentDto {
  @IsString()
  @MinLength(1)
  @Matches(SUPPORT_INVESTIGATION_IDENTIFIER)
  readonly key!: string;

  @IsString()
  @MinLength(1)
  @Matches(SUPPORT_INVESTIGATION_IDENTIFIER)
  readonly schemaName!: string;

  /** The channel of the errands whose report is filled in in Draken. Every other errand's is read-only. */
  @IsString()
  @MinLength(1)
  readonly editableChannel!: string;

  /** The workflow phase, by its technical name, that locks the report: the investigation starts there. */
  @IsString()
  @MinLength(1)
  readonly lockedFromPhase!: string;
}

export class SupportInvestigationProfileDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportInvestigationDocumentProfileDto)
  readonly documents!: readonly SupportInvestigationDocumentProfileDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SupportInvestigationReportDocumentDto)
  readonly reportDocument?: SupportInvestigationReportDocumentDto;
}

// `inactive` stays in the wire contract the frontend reads, but the backend no longer answers with it: the
// avvikelse investigation is always configured, so it is either served (`active`) or cannot be (`unavailable`).
const SUPPORT_INVESTIGATION_STATES = ['active', 'inactive', 'unavailable'] as const;
export type SupportInvestigationState = (typeof SUPPORT_INVESTIGATION_STATES)[number];

export class SupportRegistrationCapabilityDto {
  @IsIn(['enabled', 'disabled'])
  readonly mode!: 'enabled' | 'disabled';

  /**
   * Whether registration asks the handler for the errand's details first. It always does - the unit
   * manager says what happened and where - and the field stays optional only for the wire contract.
   */
  @IsOptional()
  @IsBoolean()
  readonly form?: boolean;
}

export class SupportManagementLabelFilterFieldProfileDto {
  @IsString()
  @MinLength(1)
  @Matches(SUPPORT_INVESTIGATION_IDENTIFIER)
  readonly key!: string;

  @IsString()
  @MinLength(1)
  readonly label!: string;

  @IsString()
  @MinLength(1)
  readonly classification!: string;
}

export class SupportManagementLabelFilterGroupProfileDto {
  @IsString()
  @MinLength(1)
  @Matches(SUPPORT_INVESTIGATION_IDENTIFIER)
  readonly key!: string;

  @IsString()
  @MinLength(1)
  readonly label!: string;

  @IsString()
  @MinLength(1)
  readonly rootResourcePath!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportManagementLabelFilterFieldProfileDto)
  readonly fields!: readonly SupportManagementLabelFilterFieldProfileDto[];
}

export class SupportManagementLabelFilterProfileDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportManagementLabelFilterGroupProfileDto)
  readonly groups!: readonly SupportManagementLabelFilterGroupProfileDto[];
}

export class SupportInvestigationRuntimeProfileDto extends SupportInvestigationProfileDto {
  @IsIn(SUPPORT_INVESTIGATION_STATES)
  readonly state!: SupportInvestigationState;

  @ValidateNested()
  @Type(() => SupportRegistrationCapabilityDto)
  readonly registration!: SupportRegistrationCapabilityDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SupportManagementLabelFilterProfileDto)
  readonly labelFilter?: SupportManagementLabelFilterProfileDto;
}
