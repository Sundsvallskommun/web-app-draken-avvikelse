import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';

import type { InvestigationProfile } from '../../investigation-profile';
import type { InvestigationViewer } from '../../investigation-variant';
import { UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME } from '../avvikelse-schema-names';
import type { InvestigationFormData } from '../investigation-document';
import { hasLexDeclinedInvestigation } from '../lex-initial-assessment';
import { findInvestigationDocumentBySchemaName, readSavedInvestigationDocument } from '../saved-investigation-document';
import { ACCESS_LEX_LABEL_PATH, hasErrandLabel } from './avvikelse-access-labels';
import { LEX_HANDLER_ROLE_KEYS, LEX_INVESTIGATOR_ROLE_KEY, LEX_MANAGER_ROLE_KEY } from './avvikelse-handler-roles';

interface LexAssignmentInput {
  readonly formData: InvestigationFormData;
  readonly labels: Label[] | undefined;
  readonly labelStructure: Label[] | undefined;
  /** LEX-ansvarig has declined to lex-investigate the errand in the initial assessment. */
  readonly lexDeclined?: boolean;
}

/** The document whose assessment of suspected misconduct decides the handover to LEX. */

/** Whether a unit manager investigation assesses the deviation as a suspected misconduct. */
export const assessesSuspectedMisconduct = (formData: InvestigationFormData | undefined): boolean =>
  formData?.suspectedMisconduct === 'yes';

/**
 * Whether a saved unit manager investigation has to be handed to a LEX manager.
 *
 * The rule reads the saved form together with the errand's own labels, because the label is the
 * record of a handover that already happened: answering "yes" to suspected misconduct a second time
 * must not ask for a new LEX manager. Nor does a suspicion LEX-ansvarig has already declined.
 *
 * The HSL risk value deliberately triggers nothing here. It is shown as a warning to the unit
 * manager, and a completed investigation marks the errand with the high HSL risk label - which the BFF
 * sets when the document is saved, not this handover.
 */
export const shouldPromptLexAssignment = ({
  formData,
  labels,
  labelStructure,
  lexDeclined = false,
}: LexAssignmentInput): boolean =>
  assessesSuspectedMisconduct(formData) &&
  !lexDeclined &&
  !hasErrandLabel(labels, labelStructure, ACCESS_LEX_LABEL_PATH);

interface LexAssignmentRequirementInput {
  readonly errand: SupportErrand | undefined;
  readonly profile: InvestigationProfile | null | undefined;
  readonly labelStructure: Label[] | undefined;
}

/**
 * Whether the errand still has to be handed to a LEX manager before it may be decided: the unit
 * manager investigation saved on it assesses a suspected misconduct, and no handover has happened.
 *
 * The dialog that asks for the handover after saving can be put off; this is what makes it unavoidable
 * before the decision. Only the saved document counts - an unsaved answer is not yet an assessment.
 */
export const requiresLexAssignment = ({ errand, profile, labelStructure }: LexAssignmentRequirementInput): boolean => {
  const key = findInvestigationDocumentBySchemaName(profile, UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME)?.key;
  const saved = readSavedInvestigationDocument(errand, key);
  if (!saved) return false;
  return shouldPromptLexAssignment({
    formData: saved,
    labels: errand?.labels,
    labelStructure,
    lexDeclined: hasLexDeclinedInvestigation(errand, profile),
  });
};

/**
 * Whether the errand is with the LEX roles, and can therefore be handed back to its unit manager.
 * The label is the state: it is what took the errand away from the manager in the first place.
 */
export const isWithLexInvestigation = (labels: Label[] | undefined, labelStructure: Label[] | undefined): boolean =>
  hasErrandLabel(labels, labelStructure, ACCESS_LEX_LABEL_PATH);

/**
 * Whether the user hands the errand to a LEX manager rather than sending it to the decision. A LEX investigator
 * investigates; the LEX manager decides when the errand is ready for the decision. Somebody who is LEX manager as
 * well is a manager, and an administrator is held back by no role. The BFF holds the same rule.
 */
export const handsErrandToLexManager = ({ roleKeys = [], superadmin }: InvestigationViewer): boolean =>
  !superadmin && roleKeys.includes(LEX_INVESTIGATOR_ROLE_KEY) && !roleKeys.includes(LEX_MANAGER_ROLE_KEY);

/**
 * Whether the user leaves the follow-up to the unit. Following up the measures is the unit's work, so a LEX handler
 * hands the decided errand back to its manager rather than starting it. Somebody who holds another role as well may
 * be acting in that one, and an administrator is held back by no role. The BFF holds the same rule.
 */
export const leavesFollowUpToTheUnit = ({ roleKeys = [], superadmin }: InvestigationViewer): boolean =>
  !superadmin && roleKeys.length > 0 && roleKeys.every((roleKey) => LEX_HANDLER_ROLE_KEYS.includes(roleKey));

/**
 * The overview names LEX as responsible while the errand is with them: the role holds it, whichever of
 * LEX it is assigned to, and the unit sees that much even where its read is limited.
 */
export const lexOverviewAssignee = (
  labels: Label[] | undefined,
  labelStructure: Label[] | undefined
): string | undefined => (isWithLexInvestigation(labels, labelStructure) ? 'LEX' : undefined);
