import type { InvestigationOverviewFilterToggleSlot, InvestigationViewer } from '../../investigation-variant';
import { HIGH_HSL_RISK_LABEL_PATH } from './avvikelse-access-labels';
import { MAS_MAR_ROLE_KEY } from './avvikelse-handler-roles';

/**
 * MAS/MAR-ärenden: the errands with a high HSL risk, which are the ones MAS/MAR answer for. Offered to MAS/MAR alone.
 * The group and field are the `risk` label filter of the BFF's profile.
 */
export const masMarOverviewFilter: InvestigationOverviewFilterToggleSlot = Object.freeze({
  label: 'MAS/MAR-ärenden',
  selection: Object.freeze({ groupKey: 'risk', fieldKey: 'risk', resourcePath: HIGH_HSL_RISK_LABEL_PATH }),
  isOfferedTo: ({ roleKeys = [] }: InvestigationViewer) => roleKeys.includes(MAS_MAR_ROLE_KEY),
});
