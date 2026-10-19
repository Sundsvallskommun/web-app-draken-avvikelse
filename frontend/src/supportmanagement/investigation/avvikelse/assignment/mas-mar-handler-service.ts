import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { saveChangedErrandParameters } from '@supportmanagement/services/support-parameter-service';

import { MAS_MAR_HANDLER_PARAMETER } from './mas-mar-handler';

/** Records the errand's MAS/MAR handler, on the parameter's own version. The handler already recorded writes nothing. */
export const saveMasMarHandler = async (municipalityId: string, errand: SupportErrand, account: string) => {
  if (!errand.id) throw new Error('The errand has no id to record its MAS/MAR handler on');
  await saveChangedErrandParameters(municipalityId, errand.id, errand.parameters, [
    { key: MAS_MAR_HANDLER_PARAMETER, displayName: 'MAS/MAR', values: [account] },
  ]);
};
