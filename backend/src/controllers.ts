import { IndexController } from '@controllers/index.controller';

import { ActiveDirectoryController } from './controllers/active-directory.controller';
import { AddressController } from './controllers/address.controller';
import { CaseStatusController } from './controllers/casestatus.controller';
import { EmployeeController } from './controllers/employee.controller';
import { HealthController } from './controllers/health.controller';
import { JsonSchemaController } from './controllers/jsonschema.controller';
import { RelationsController } from './controllers/relations.controller';
import { SupportAttachmentController } from './controllers/supportmanagement/support-attachment.controller';
import { SupportConversationController } from './controllers/supportmanagement/support-conversation.controller';
import { SupportErrandController } from './controllers/supportmanagement/support-errand.controller';
import { SupportErrandJsonParameterController } from './controllers/supportmanagement/support-errand-json-parameter.controller';
import { SupportErrandParameterController } from './controllers/supportmanagement/support-errand-parameter.controller';
import { SupportExportController } from './controllers/supportmanagement/support-export.controller';
import { SupportFollowUpController } from './controllers/supportmanagement/support-follow-up.controller';
import { SupportHistoryController } from './controllers/supportmanagement/support-history.controller';
import { SupportInvestigationAssignmentController } from './controllers/supportmanagement/support-investigation-assignment.controller';
import { SupportInvestigationProfileController } from './controllers/supportmanagement/support-investigation-profile.controller';
import { SupportInvestigationReportController } from './controllers/supportmanagement/support-investigation-report.controller';
import { SupportMeasureController } from './controllers/supportmanagement/support-measure.controller';
import { SupportMeasureActionPlanController } from './controllers/supportmanagement/support-measure-action-plan.controller';
import { SupportMessageController } from './controllers/supportmanagement/support-message.controller';
import { SupportMetadataController } from './controllers/supportmanagement/support-metadata.controller';
import { SupportNoteController } from './controllers/supportmanagement/support-note.controller';
import { SupportNotificationController } from './controllers/supportmanagement/support-notification.controller';
import { SupportPhaseController } from './controllers/supportmanagement/support-phase.controller';
import { SupportPlaceManagerController } from './controllers/supportmanagement/support-place-manager.controller';
import { SupportSubscriptionController } from './controllers/supportmanagement/support-subscription.controller';
import { TemplateController } from './controllers/template.controller';
import { UserController } from './controllers/user.controller';

/**
 * Every controller registered with routing-controllers.
 *
 * Kept in its own module so server.ts and the default-deny auth tests consume the same
 * list - a controller added to the app is therefore always covered by the auth tests,
 * and cannot be missed because the test kept a separate copy.
 */
export const CONTROLLERS: NewableFunction[] = [
  ActiveDirectoryController,
  AddressController,
  CaseStatusController,
  EmployeeController,
  HealthController,
  IndexController,
  JsonSchemaController,
  RelationsController,
  SupportAttachmentController,
  SupportConversationController,
  SupportErrandController,
  SupportErrandJsonParameterController,
  SupportErrandParameterController,
  SupportExportController,
  SupportHistoryController,
  SupportInvestigationAssignmentController,
  SupportInvestigationProfileController,
  SupportFollowUpController,
  SupportInvestigationReportController,
  SupportMeasureActionPlanController,
  SupportMessageController,
  SupportMetadataController,
  SupportMeasureController,
  SupportNoteController,
  SupportPhaseController,
  SupportPlaceManagerController,
  SupportNotificationController,
  SupportSubscriptionController,
  TemplateController,
  UserController,
];
