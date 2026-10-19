import type { RJSFSchema } from '@rjsf/utils';

import type { InvestigationProfile } from '../investigation-profile';
import { AVVIKELSE_CLASSIFICATION_POLICY } from './avvikelse-classification-policy';

/**
 * Where the investigator's proposal lives: in the reported-misconduct investigation, as its
 * proposed degree and motivation. The decision shows it read-only and never copies it.
 */
export const AVVIKELSE_DECISION_PROPOSAL_SOURCE = Object.freeze({
  schemaName: AVVIKELSE_CLASSIFICATION_POLICY.reportedMisconductOwnerSchemaName,
  degreeField: 'proposedMisconductDegree',
  motivationField: 'proposalMotivation',
  /** The decision's own degree field, whose choice list titles the proposed degree. */
  decisionDegreeField: 'decidedMisconductDegree',
});

export interface InvestigationDecisionProposal {
  readonly degree?: string;
  readonly motivation?: string;
}

interface ProposalErrand {
  readonly jsonParameters?: readonly { readonly key: string; readonly value?: unknown }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

/**
 * The investigator's proposal as the errand carries it, or undefined when the reported-misconduct
 * investigation has not been saved on this errand or is not in the profile. The document key is the
 * profile's, so a deployment with its own key for the SoL/LSS investigation is still read.
 */
export const readInvestigationDecisionProposal = (
  errand: ProposalErrand | undefined,
  profile: InvestigationProfile | null | undefined
): InvestigationDecisionProposal | undefined => {
  const sources = (profile?.documents ?? []).filter(
    (document) => document.schemaName === AVVIKELSE_DECISION_PROPOSAL_SOURCE.schemaName
  );
  if (sources.length !== 1) return undefined;

  const parameter = errand?.jsonParameters?.find((candidate) => candidate.key === sources[0].key);
  if (!parameter || !isRecord(parameter.value)) return undefined;

  return Object.freeze({
    degree: readNonEmptyString(parameter.value[AVVIKELSE_DECISION_PROPOSAL_SOURCE.degreeField]),
    motivation: readNonEmptyString(parameter.value[AVVIKELSE_DECISION_PROPOSAL_SOURCE.motivationField]),
  });
};

/**
 * The human title for a proposed degree, read from the decision schema's own choice list: the
 * decision decides among the same degrees the investigator proposes, so its titles apply. A value
 * the schema does not know is shown as is rather than hidden.
 */
export const resolveDecisionProposalDegreeTitle = (
  decisionSchema: RJSFSchema | undefined,
  degreeField: string,
  degree: string | undefined
): string | undefined => {
  if (degree === undefined) return undefined;
  const fieldSchema = decisionSchema?.properties?.[degreeField];
  const options = isRecord(fieldSchema) && Array.isArray(fieldSchema.oneOf) ? fieldSchema.oneOf : [];
  const match = options.find((option) => isRecord(option) && option.const === degree);
  return isRecord(match) && typeof match.title === 'string' ? match.title : degree;
};
