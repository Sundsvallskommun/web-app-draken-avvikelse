import { avvikelseInvestigationVariant } from './avvikelse/avvikelse-investigation-variant';
import {
  type InvestigationVariantModule,
  type InvestigationViewer,
  resolveInvestigationAdministration,
} from './investigation-variant';

export const getInvestigationVariant = (): InvestigationVariantModule => avvikelseInvestigationVariant;

/** The follow-up across errands the variant offers, if any. */
export const getInvestigationFollowUp = (): InvestigationVariantModule['followUp'] =>
  getInvestigationVariant().followUp;

/**
 * What the variant lets this viewer administer from the overview, if anything: undefined for a viewer it is not
 * offered to.
 */
export const getInvestigationAdministration = (
  viewer: InvestigationViewer
): InvestigationVariantModule['administration'] =>
  resolveInvestigationAdministration(getInvestigationVariant(), viewer);

/** What the variant says the messages are for. */
export const getInvestigationMessagesIntroduction = (): InvestigationVariantModule['messagesIntroduction'] =>
  getInvestigationVariant().messagesIntroduction;

/** The channels the variant lets a user choose to be notified on. */
export const getInvestigationNotificationChannels = (): InvestigationVariantModule['notificationChannels'] =>
  getInvestigationVariant().notificationChannels;

/** The fields the variant adds beside Ansvarig in the sidebar. */
export const getInvestigationHandlerFields = (): InvestigationVariantModule['renderHandlerFields'] =>
  getInvestigationVariant().renderHandlerFields;

/** The variant's filter checkbox for the overview, whoever it is offered to. */
export const getInvestigationOverviewFilterToggle = (): InvestigationVariantModule['overviewFilterToggle'] =>
  getInvestigationVariant().overviewFilterToggle;

/** The stakeholder roles the variant offers no employee search for. */
export const getInvestigationRolesWithoutEmployeeSearch =
  (): InvestigationVariantModule['rolesWithoutEmployeeSearch'] => getInvestigationVariant().rolesWithoutEmployeeSearch;

/** The stakeholder roles the variant lets the handler add and remove. */
export const getInvestigationHandlerManagedStakeholderRoles =
  (): InvestigationVariantModule['handlerManagedStakeholderRoles'] =>
    getInvestigationVariant().handlerManagedStakeholderRoles;

/** The documents the variant keeps out of the viewer's sight. */
export const getInvestigationConcealedDocumentKeys = (): InvestigationVariantModule['concealedDocumentKeys'] =>
  getInvestigationVariant().concealedDocumentKeys;

/** Whether the variant keeps an errand from closing before its workflow ends. */
export const getInvestigationClosesOnlyAtWorkflowEnd = (): InvestigationVariantModule['closesOnlyAtWorkflowEnd'] =>
  getInvestigationVariant().closesOnlyAtWorkflowEnd;

/** How the variant lets an errand close before its workflow ends. */
export const getInvestigationEarlyClose = (): InvestigationVariantModule['earlyClose'] =>
  getInvestigationVariant().earlyClose;

/** What the variant reminds the handler of under the button that closes the errand. */
export const getInvestigationClosingReminder = (): InvestigationVariantModule['closingReminder'] =>
  getInvestigationVariant().closingReminder;

/** The variant's own name for a channel, where it has one. Undefined for every other channel. */
export const getInvestigationChannelLabel = (channel: string | undefined): string | undefined =>
  channel ? getInvestigationVariant().channelLabels?.[channel] : undefined;

/** What the errand's handler does next, where the variant says. */
export const getInvestigationNextStep = (): InvestigationVariantModule['nextStep'] =>
  getInvestigationVariant().nextStep;

/** Who the overview names as responsible for an errand, where the variant has a say in it. */
export const getInvestigationOverviewAssignee = (): InvestigationVariantModule['overviewAssignee'] =>
  getInvestigationVariant().overviewAssignee;

/** The alert the variant shows on an errand the user may only know of. */
export const getInvestigationLimitedAccessNotice = (): InvestigationVariantModule['limitedAccessNotice'] =>
  getInvestigationVariant().limitedAccessNotice;
