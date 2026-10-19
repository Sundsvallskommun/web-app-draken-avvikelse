import type { InvestigationErrandContext, InvestigationViewer } from '../investigation-variant';
import {
  hasErrandLabel,
  HIGH_HSL_RISK_LABEL_PATH,
  VC_COMMENT_REQUESTED_LABEL_PATH,
} from './assignment/avvikelse-access-labels';
import {
  HEAD_OF_OPERATIONS_ROLE_KEY,
  MAS_MAR_ROLE_KEY,
  UNIT_MANAGER_ROLE_KEY,
} from './assignment/avvikelse-handler-roles';
import { HSL_COMMISSIONER_COMMENT_SCHEMA_NAME, HSL_INVESTIGATION_SCHEMA_NAME } from './avvikelse-schema-names';
import { findInvestigationDocumentBySchemaName } from './saved-investigation-document';

const MANAGER_ROLE_KEYS: readonly string[] = [UNIT_MANAGER_ROLE_KEY, HEAD_OF_OPERATIONS_ROLE_KEY];

/**
 * Whether the HSL investigation is kept out of the viewer's sight: a unit manager or head of operations does not
 * see it until the errand carries a high HSL risk. MAS/MAR, an administrator and every other role see it as their
 * access says.
 */
export const concealsHslInvestigation = (
  { roleKeys = [], superadmin }: InvestigationViewer,
  carriesHighHslRisk: boolean
): boolean =>
  !carriesHighHslRisk &&
  !superadmin &&
  !roleKeys.includes(MAS_MAR_ROLE_KEY) &&
  roleKeys.some((roleKey) => MANAGER_ROLE_KEYS.includes(roleKey));

/**
 * The documents avvikelse keeps out of the viewer's sight on the errand.
 *
 * The HSL investigation, from a manager until the errand carries a high HSL risk. And VC kommentar HSL, from
 * everybody until MAS/MAR has asked the head of operations for their comment: there is nothing to comment on before
 * the analysis has got that far, and asking is what opens it.
 */
export const concealedAvvikelseDocumentKeys = ({
  errand,
  profile,
  labelStructure,
  viewer,
}: InvestigationErrandContext): readonly string[] => {
  const hslInvestigationKey = findInvestigationDocumentBySchemaName(profile, HSL_INVESTIGATION_SCHEMA_NAME)?.key;
  const commentKey = findInvestigationDocumentBySchemaName(profile, HSL_COMMISSIONER_COMMENT_SCHEMA_NAME)?.key;
  const carriesHighHslRisk = hasErrandLabel(errand?.labels, labelStructure, HIGH_HSL_RISK_LABEL_PATH);
  const commentRequested = hasErrandLabel(errand?.labels, labelStructure, VC_COMMENT_REQUESTED_LABEL_PATH);
  return [
    ...(hslInvestigationKey && concealsHslInvestigation(viewer, carriesHighHslRisk) ? [hslInvestigationKey] : []),
    ...(commentKey && !commentRequested ? [commentKey] : []),
  ];
};
