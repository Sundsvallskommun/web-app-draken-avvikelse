import { IAF_VOF_PERMANENT_LABELS } from '@/config/iaf-vof-permanent-labels';
import { getInvestigationHandoverStep, type InvestigationHandoverStep } from '@/config/investigation-handover-steps';

// Every step: a step added later does not type-check here until it is listed, and so is checked as well.
const everyStep: Record<InvestigationHandoverStep, true> = {
  'assign-lex': true,
  'return-to-manager': true,
  'decline-lex': true,
  'move-location': true,
  'request-vc-comment': true,
};

describe('investigation handover steps', () => {
  it.each(Object.keys(everyStep))('%s never takes a permanent label off the errand', step => {
    const definition = getInvestigationHandoverStep(step);

    expect(definition).toBeDefined();
    expect(definition?.removeLabelResourcePaths.filter(resourcePath => IAF_VOF_PERMANENT_LABELS.includes(resourcePath))).toEqual([]);
  });
});
