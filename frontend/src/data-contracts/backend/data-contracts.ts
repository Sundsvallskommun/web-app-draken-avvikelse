/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface SsnPayload {
  ssn: string;
}

export interface SupportAttachmentDto {
  name: string;
  files?: any;
}

export interface MarkConversationMessagesAsReadDto {
  /** @minItems 1 */
  messageIds: string[];
}

export interface ConversationIdentifierDto {
  type: ConversationIdentifierDtoTypeEnum;
  value: string;
}

export interface ReadByCountEntryDto {
  identifier?: ConversationIdentifierDto;
  /** @min 0 */
  count?: number;
}

export interface PartReadByCountEntryDto {
  part?: string;
  /** @min 0 */
  count?: number;
}

export interface ConversationReadByCountDto {
  conversationId?: string;
  /** @min 0 */
  messageCount?: number;
  readByCount?: ReadByCountEntryDto[];
  readByPartCount?: PartReadByCountEntryDto[];
}

export interface SupportInvestigationDocumentProfileDto {
  /**
   * @minLength 1
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  key: string;
  /**
   * @minLength 1
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  schemaName: string;
  /** @minLength 1 */
  tabLabel: string;
  /** @minLength 1 */
  ownerLabel: string;
  placement?: SupportInvestigationDocumentProfileDtoPlacementEnum;
  appliesTo?: SupportInvestigationDocumentProfileDtoAppliesToEnum;
  /**
   * @minLength 1
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  prerequisiteDocumentKey?: string;
}

export interface SupportInvestigationDocumentGrantDto {
  key: string;
  access: SupportInvestigationDocumentGrantDtoAccessEnum;
}

export interface SupportInvestigationErrandAccessDto {
  municipalityId: string;
  errandId: string;
  documents: SupportInvestigationDocumentGrantDto[];
}

export interface SupportErrandAccessLevelDto {
  level: SupportErrandAccessLevelDtoLevelEnum;
}

export interface SupportInvestigationReportDocumentDto {
  /**
   * @minLength 1
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  key: string;
  /**
   * @minLength 1
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  schemaName: string;
  /** @minLength 1 */
  editableChannel: string;
  /** @minLength 1 */
  lockedFromPhase: string;
}

export interface SupportInvestigationProfileDto {
  documents: SupportInvestigationDocumentProfileDto[];
  reportDocument?: SupportInvestigationReportDocumentDto;
}

export interface SupportRegistrationCapabilityDto {
  mode: SupportRegistrationCapabilityDtoModeEnum;
  form?: boolean;
}

export interface SupportManagementLabelFilterFieldProfileDto {
  /**
   * @minLength 1
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  key: string;
  /** @minLength 1 */
  label: string;
  /** @minLength 1 */
  classification: string;
}

export interface SupportManagementLabelFilterGroupProfileDto {
  /**
   * @minLength 1
   * @pattern ^[a-z0-9]+(?:-[a-z0-9]+)*$
   */
  key: string;
  /** @minLength 1 */
  label: string;
  /** @minLength 1 */
  rootResourcePath: string;
  fields: SupportManagementLabelFilterFieldProfileDto[];
}

export interface SupportManagementLabelFilterProfileDto {
  groups: SupportManagementLabelFilterGroupProfileDto[];
}

export interface SupportInvestigationRuntimeProfileDto {
  state: SupportInvestigationRuntimeProfileDtoStateEnum;
  registration: SupportRegistrationCapabilityDto;
  labelFilter?: SupportManagementLabelFilterProfileDto;
  documents: SupportInvestigationDocumentProfileDto[];
  reportDocument?: SupportInvestigationReportDocumentDto;
}

export interface CExternalTag {
  key: string;
  value: string;
}

export interface CParameter {
  key: string;
  displayName?: string;
  group?: string;
  values?: any[];
  version?: number;
}

export interface CContactChannel {
  type?: string;
  value?: string;
}

export interface CSupportStakeholder {
  externalId?: string;
  externalIdType?: string;
  role?: string;
  city?: string;
  organizationName?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  careOf?: string;
  zipCode?: string;
  country?: string;
  contactChannels?: CContactChannel[];
  parameters?: CParameter[];
}

export interface Classification {
  category: string;
  type: string;
}

export interface RequiredClassificationDto {
  /** @minLength 1 */
  category: string;
  /** @minLength 1 */
  type: string;
}

export interface ClassificationLabelReferenceDto {
  /** @minLength 1 */
  id: string;
}

export interface InvestigationClassificationSelectionDto {
  classification: any;
  /** @minItems 1 */
  categoryLabels: any;
}

export interface UpdateSupportErrandClassificationDto {
  seenFacts: object;
  /** @minItems 1 */
  classifications: any;
  /** @minLength 1 */
  documentKey: string;
  /** @pattern ^"(0|[1-9]\d*)"$ */
  documentETag: string;
}

export interface CSuspension {
  suspendedFrom?: string;
  suspendedTo?: string;
}

export interface UpdateSupportErrandStatusDto {
  seenFacts: object;
  /** @minLength 1 */
  status: string;
  resolution?: string;
  suspension?: CSuspension;
  /** @maxLength 4000 */
  closingMotivation?: string;
}

export interface AssignSupportErrandDto {
  /** @minLength 1 */
  assignedUserId: string;
  seenFacts: object;
}

export interface CErrandAction {
  id?: string;
  actionName?: string;
  executeAfter?: string;
  actionConfigId?: string;
  displayValue?: string;
}

export interface CErrandPhase {
  phaseId?: string;
  name?: string;
  displayName?: string;
  started?: string;
  ended?: string;
}

export interface SupportErrandDto {
  id?: string;
  errandNumber?: string;
  title?: string;
  stakeholders?: CSupportStakeholder[];
  priority?: string;
  externalTags?: CExternalTag[];
  parameters?: CParameter[];
  classification?: Classification;
  status?: string;
  resolution?: string;
  description?: string;
  channel?: string;
  reporterUserId?: string;
  assignedUserId?: string;
  assignedGroupId?: string;
  escalationEmail?: string;
  contactReason?: string;
  contactReasonDescription?: string;
  suspension?: CSuspension;
  businessRelated?: boolean;
  labels?: any[];
  created?: string;
  modified?: string;
  touched?: string;
  version?: number;
  actions?: CErrandAction[];
  activePhaseId?: string;
  phases?: CErrandPhase[];
}

export interface NewSupportErrandDto {
  /** @minLength 1 */
  locationLabelId?: string;
  /** @minLength 1 */
  reportTypeLabelId?: string;
  priority?: NewSupportErrandDtoPriorityEnum;
}

export interface UpdateSupportErrandJsonParameterDto {
  /** @minLength 1 */
  schemaId: string;
  value: any;
}

export interface UpdateSupportErrandParameterDto {
  /** @maxItems 1000 */
  values: any;
  /** @minLength 1 */
  displayName?: string;
  /** @minLength 1 */
  group?: string;
}

export interface UnitFollowUpQueryDto {
  /** @pattern ^\d{4}-\d{2}-\d{2}$ */
  from: string;
  /** @pattern ^\d{4}-\d{2}-\d{2}$ */
  to: string;
}

export interface InvestigationHandoverDto {
  seenFacts: object;
  /** @minLength 1 */
  assignedUserId?: string;
  /** @minLength 1 */
  locationLabelId?: string;
}

export interface CreateSupportInvestigationReportDto {
  /** @format uuid */
  operationId?: string;
  preview?: boolean;
  /** @minLength 1 */
  schemaId?: string;
  value?: object;
}

export interface SupportMeasureDetailsDto {
  responsibleUser?: string;
  plannedStart?: string;
  plannedComplete?: string;
  executed?: string;
}

export interface CreateSupportMeasureDto {
  /** @pattern \S */
  type: string;
  /** @pattern \S */
  addedByRole: string;
  /** @pattern \S */
  goal: string;
  /** @pattern \S */
  description: string;
  responsibleUser?: string;
  plannedStart?: string;
  plannedComplete?: string;
  executed?: string;
}

export interface UpdateSupportMeasureDto {
  /** @pattern \S */
  type?: string;
  goal?: string;
  description?: string;
  responsibleUser?: string;
  plannedStart?: string;
  plannedComplete?: string;
  executed?: string;
}

export interface DecideSupportMeasureDto {
  accept: DecideSupportMeasureDtoAcceptEnum;
  /** @pattern \S */
  acceptMotivation?: string;
  plannedStart?: string;
  plannedComplete?: string;
}

export interface PlannedCompleteSupportMeasureDto {
  plannedComplete: string;
  /** @pattern \S */
  description?: string;
}

export interface FollowUpSupportMeasureDto {
  desiredEffectAchieved: boolean;
  /**
   * @maxLength 4000
   * @pattern \S
   */
  followUpDescription: string;
}

export interface SupportMessageDto {
  /** @minLength 1 */
  contactMeans: string;
  /** @minLength 1 */
  recipientEmail?: string;
  /** @minLength 1 */
  recipientPhone?: string;
  plaintextMessage: string;
  htmlMessage: string;
  senderName?: string;
  subject: string;
  files?: any;
  reply_to: string;
  references: string;
  attachmentIds?: any;
}

export interface CCommunicationAttachment {
  id?: string;
  fileName?: string;
  mimeType?: string;
}

export interface CCommunication {
  communicationID?: string;
  sender?: string;
  errandNumber?: string;
  direction?: CCommunicationDirectionEnum;
  messageBody?: string;
  sent?: string;
  subject?: string;
  communicationType?: CCommunicationCommunicationTypeEnum;
  target?: string;
  internal?: boolean;
  viewed?: boolean;
  ccRecipients?: string[];
  emailHeaders?: string;
  communicationAttachments: CCommunicationAttachment[];
}

export interface Type {
  name: string;
  displayName?: string;
  escalationEmail?: string;
  deprecated?: boolean;
  created?: string;
  modified?: string;
}

export interface Category {
  id?: string;
  name?: string;
  displayName?: string;
  sortOrder?: number;
  deprecated?: boolean;
  types?: Type[];
  created?: string;
  modified?: string;
}

export interface ExternalIdType {
  id?: string;
  name: string;
  displayName?: string;
  sortOrder?: number;
  deprecated?: boolean;
  created?: string;
  modified?: string;
}

export interface LabelAttribute {
  key: string;
  value: string;
}

export interface Label {
  id?: string;
  classification: string;
  displayName?: string;
  resourcePath?: string;
  resourceName: string;
  deprecated?: boolean;
  labels?: Label[];
  attributes?: LabelAttribute[];
}

export interface Labels {
  labelStructure?: Label[];
}

export interface Status {
  id?: string;
  name: string;
  displayName?: string;
  externalDisplayName?: string;
  sortOrder?: number;
  deprecated?: boolean;
  created?: string;
  modified?: string;
}

export interface Role {
  id?: string;
  name: string;
  displayName?: string;
  sortOrder?: number;
  deprecated?: boolean;
  created?: string;
  modified?: string;
}

export interface ContactReason {
  id?: string;
  reason: string;
  displayName?: string;
  sortOrder?: number;
  deprecated?: boolean;
  created?: string;
  modified?: string;
}

export interface PhaseTransition {
  id?: string;
  targetPhaseId: string;
  targetPhaseName?: string;
  targetPhaseDisplayName?: string;
  description?: string;
  deprecated?: boolean;
}

export interface Phase {
  id?: string;
  name: string;
  displayName?: string;
  description?: string;
  phaseOrder?: number;
  allowedStatuses?: string[];
  transitions?: PhaseTransition[];
  deprecated?: boolean;
  created?: string;
  modified?: string;
}

export interface MeasureType {
  id?: string;
  name: string;
  displayName?: string;
  measureGroups: string[];
  sortOrder?: number;
  deprecated?: boolean;
  created?: string;
  modified?: string;
}

export interface MetadataResponse {
  categories?: Category[];
  externalIdTypes?: ExternalIdType[];
  labels?: Labels;
  statuses?: Status[];
  roles?: Role[];
  contactReasons?: ContactReason[];
  phases?: Phase[];
  measureTypes?: MeasureType[];
}

export interface CreateSupportServiceNoteDto {
  partyId?: string;
  /**
   * @maxLength 2048
   * @pattern \S
   */
  body: string;
}

export interface SupportNoteDto {
  context?: string;
  role?: string;
  partyId?: string;
  subject?: string;
  body: string;
}

export interface SupportNoteUpdateDto {
  modifiedBy?: string;
  subject?: string;
  body: string;
}

export interface SupportNotificationEventDto {
  created: string;
  eventType: string;
  subType: string;
  description: string;
}

export interface SupportNotificationDto {
  id: string;
  created: string;
  acknowledged: string;
  errandId: string;
  errandNumber: string;
  events: SupportNotificationEventDto[];
}

export interface AcknowledgeNotificationsDto {
  /** @minItems 1 */
  ids: string[];
}

export interface UpdateSupportErrandPhaseDto {
  /** @minLength 1 */
  expectedActivePhaseId?: string;
  /** @minLength 1 */
  transitionId?: string;
}

export interface PlaceManagerLookupDto {
  /** @maxItems 150 */
  adAccounts: string[];
}

export interface PlaceManagerPlacesDto {
  /** @maxItems 50 */
  add: string[];
  /** @maxItems 50 */
  remove: string[];
}

export interface NotificationChannelDto {
  type: NotificationChannelDtoTypeEnum;
}

export interface EventFilterDto {
  type: string;
  subtype?: string;
}

export interface SubscriberUpdateDto {
  name?: string;
  channels?: NotificationChannelDto[];
  eventFilters?: EventFilterDto[];
  pausedFrom?: string;
  pausedUntil?: string;
}

export enum ConversationIdentifierDtoTypeEnum {
  AdAccount = "adAccount",
  PartyId = "partyId",
}

export enum SupportInvestigationDocumentProfileDtoPlacementEnum {
  Investigation = "investigation",
  Decision = "decision",
  Details = "details",
}

export enum SupportInvestigationDocumentProfileDtoAppliesToEnum {
  All = "all",
  ReportedMisconduct = "reported-misconduct",
  HslDeviation = "hsl-deviation",
  Deviation = "deviation",
}

export enum SupportInvestigationDocumentGrantDtoAccessEnum {
  Edit = "edit",
  Read = "read",
  Hidden = "hidden",
}

export enum SupportErrandAccessLevelDtoLevelEnum {
  LR = "LR",
  R = "R",
  RW = "RW",
}

export enum SupportRegistrationCapabilityDtoModeEnum {
  Enabled = "enabled",
  Disabled = "disabled",
}

export enum SupportInvestigationRuntimeProfileDtoStateEnum {
  Active = "active",
  Inactive = "inactive",
  Unavailable = "unavailable",
}

export enum NewSupportErrandDtoPriorityEnum {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum DecideSupportMeasureDtoAcceptEnum {
  TRUE = "TRUE",
  FALSE = "FALSE",
  REWORK = "REWORK",
}

export enum CCommunicationDirectionEnum {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

export enum CCommunicationCommunicationTypeEnum {
  SMS = "SMS",
  EMAIL = "EMAIL",
  WEB_MESSAGE = "WEB_MESSAGE",
}

export enum NotificationChannelDtoTypeEnum {
  INTERNAL = "INTERNAL",
  EMAIL = "EMAIL",
  SMS = "SMS",
}
