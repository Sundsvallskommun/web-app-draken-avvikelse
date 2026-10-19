import { type HandlerGroupRole, resolveHeldHandlerRoleKeys } from '@/config/handler-group-roles';
import {
  IAF_VOF_DECISION_PHASE_NAME,
  IAF_VOF_FOLLOW_UP_PHASE_NAME,
  IAF_VOF_REVIEW_PHASE_NAME,
  resolveIafVofDecisionInvestigationDocumentKey,
} from '@/config/iaf-vof-decision-investigation';
import { IAF_VOF_HIGH_HSL_RISK_LABEL } from '@/config/iaf-vof-high-hsl-risk';
import {
  hasHslAnalysisDecision,
  IAF_VOF_HSL_ANALYSIS_SCHEMA_NAME,
  IAF_VOF_HSL_ANALYSIS_STARTED_LABEL,
  IAF_VOF_HSL_DECISION_SCHEMA_NAME,
  startsHslAnalysis,
} from '@/config/iaf-vof-hsl-analysis';
import { resolveIafVofInvestigationDocumentApplicability } from '@/config/iaf-vof-investigation-classification';
import { LEX_HANDLER_ROLE_KEYS, LEX_INVESTIGATOR_ROLE_KEY, LEX_MANAGER_ROLE_KEY } from '@/config/investigation-handover-steps';
import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import type { Errand, Phase } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { User } from '@/interfaces/users.interface';

import { isJsonObject } from './schema-bound-json.service';
import { getActiveErrandPhaseId } from './support-errand.service';
import { SupportInvestigationPolicyService } from './support-investigation-policy.service';
import { isDocumentCompleted, SupportJsonParameterService } from './support-json-parameter.service';

/** The refusal names the investigation by its tab, so the handler knows which one to finish. */
export const investigationNotCompletedMessage = (tabLabel: string): string =>
  `Ärendet kan inte skickas till beslut förrän ${tabLabel} är markerad som klar och sparad.`;

export const LEX_INVESTIGATOR_CANNOT_SEND_TO_DECISION =
  'Som LEX-utredare skickar du inte ärendet till beslut. Tilldela det till en LEX-ansvarig, som tar det vidare.';

export const LEX_HANDLER_CANNOT_START_FOLLOW_UP =
  'Uppföljningen görs av enheten. Återlämna ärendet till chefen, som tar det vidare till uppföljning.';

export const REPORTED_MISCONDUCT_CLOSES_AT_WORKFLOW_END = 'Ett missförhållande avslutas först när processen är klar, från uppföljningen.';

const EARLY_CLOSE_BEFORE_REVIEW = 'Ärendet kan avslutas i förtid tidigast under granskning.';

const EARLY_CLOSE_NEEDS_MOTIVATION = 'Beskriv orsak till avslut. Ärendet avslutas innan hela processen är klar.';

/** How the service note that keeps the motivation begins. */
const EARLY_CLOSE_NOTE_HEADING = 'Ärendet avslutades innan hela processen var klar. Orsak:';

export const HSL_ASSESSMENT_PENDING =
  'Ärendet har hög risk HSL och kan inte avslutas förrän MAS/MAR har gjort sin initiala bedömning i Händelseanalys HSL.';

export const HSL_ANALYSIS_UNDER_WAY =
  'Ärendet kan inte avslutas medan MAS/MAR arbetar med händelseanalysen. Händelseanalys HSL ska vara markerad som klar och sparad, och Beslut HSL sparat.';

interface AssertMayEnterPhaseRequest {
  readonly policyService: Pick<SupportInvestigationPolicyService, 'iafVofClassificationPolicy'>;
  readonly handlerRoles: readonly HandlerGroupRole[];
  /** The superadmin groups, lowercased: an administrator is not held back by a role they also happen to hold. */
  readonly superadminGroups: readonly string[];
  readonly user: User;
  /** The name of the phase the write would move the errand into. */
  readonly targetPhaseName: string | undefined;
}

/**
 * The handler roles a user holds where a role rule applies to them. Undefined without the classification policy,
 * and for an administrator: neither has a role to be held back by.
 */
const heldIafVofHandlerRoleKeys = ({
  policyService,
  handlerRoles,
  superadminGroups,
  user,
}: Omit<AssertMayEnterPhaseRequest, 'targetPhaseName'>): string[] | undefined => {
  if (!policyService.iafVofClassificationPolicy) return undefined;
  const groups = user.groups ?? [];
  if (groups.some(group => superadminGroups.includes(group.trim().toLowerCase()))) return undefined;
  return resolveHeldHandlerRoleKeys(handlerRoles, groups);
};

/**
 * Refuses a LEX investigator who would move an IAF/VOF errand into the decision phase. The investigator
 * investigates; a LEX manager sends the errand on to the decision, so the investigator hands it to one. Somebody
 * who is LEX manager as well is a manager.
 */
export const assertMaySendToDecision = ({ targetPhaseName, ...request }: AssertMayEnterPhaseRequest): void => {
  if (targetPhaseName !== IAF_VOF_DECISION_PHASE_NAME) return;
  const held = heldIafVofHandlerRoleKeys(request);
  if (held?.includes(LEX_INVESTIGATOR_ROLE_KEY) && !held.includes(LEX_MANAGER_ROLE_KEY)) {
    throw new HttpException(422, LEX_INVESTIGATOR_CANNOT_SEND_TO_DECISION);
  }
};

/**
 * Refuses a LEX handler who would move an IAF/VOF errand into the follow-up phase. Following up the measures is
 * the unit's work: LEX hands the decided errand back to the unit manager, who starts it. Somebody who holds a
 * role besides the LEX ones may be acting in that one, so only a handler who is LEX and nothing else is held back.
 */
export const assertMayStartFollowUp = ({ targetPhaseName, ...request }: AssertMayEnterPhaseRequest): void => {
  if (targetPhaseName !== IAF_VOF_FOLLOW_UP_PHASE_NAME) return;
  const held = heldIafVofHandlerRoleKeys(request);
  if (held?.length && held.every(roleKey => LEX_HANDLER_ROLE_KEYS.includes(roleKey))) {
    throw new HttpException(422, LEX_HANDLER_CANNOT_START_FOLLOW_UP);
  }
};

interface AssertMayCloseRequest {
  readonly policyService: Pick<SupportInvestigationPolicyService, 'iafVofClassificationPolicy'>;
  readonly errand: Pick<Errand, 'parameters' | 'labels'>;
  /** The close has to move the errand through phases first: it is not yet in the phase its workflow closes from. */
  readonly closesBeforeWorkflowEnds: boolean;
}

/**
 * Refuses closing an IAF/VOF reported misconduct before its workflow has run its course. A misconduct goes to LEX,
 * is decided and is followed up; a close that skips that is refused whoever asks. The close at the end of the
 * workflow, from the follow-up, is untouched.
 */
export const assertMayCloseReportedMisconduct = ({ policyService, errand, closesBeforeWorkflowEnds }: AssertMayCloseRequest): void => {
  if (!closesBeforeWorkflowEnds || !policyService.iafVofClassificationPolicy) return;
  if (resolveIafVofInvestigationDocumentApplicability(errand) === 'reported-misconduct') {
    throw new HttpException(422, REPORTED_MISCONDUCT_CLOSES_AT_WORKFLOW_END);
  }
};

interface EarlyCloseRequest {
  readonly policyService: Pick<SupportInvestigationPolicyService, 'iafVofClassificationPolicy'>;
  readonly errand: Pick<Errand, 'phases'>;
  readonly phases: readonly Phase[] | undefined;
  /** The close has to move the errand through phases first: it is not yet in the phase its workflow closes from. */
  readonly closesBeforeWorkflowEnds: boolean;
  /** Why the closer ends the errand early, in their own words. */
  readonly motivation: string | undefined;
}

/**
 * Whether the errand has reached the named phase. A workflow without the phase does not gate on it; an errand
 * outside the workflow is before every phase.
 */
const hasReachedPhase = (errand: Pick<Errand, 'phases'>, phases: readonly Phase[] | undefined, phaseName: string): boolean => {
  const required = (phases ?? []).find(phase => phase.name === phaseName && !phase.deprecated);
  if (!required) return true;
  const activePhaseId = getActiveErrandPhaseId(errand);
  const active = (phases ?? []).find(phase => phase.id === activePhaseId);
  if (!active) return false;
  return (active.phaseOrder ?? 0) >= (required.phaseOrder ?? 0);
};

/**
 * What an IAF/VOF deviation closed before its workflow ends needs: the errand has to have reached the review, where
 * its handling starts, and the closer says why. Answers the service note the motivation is kept in; undefined where
 * no such close is asked for or the application has no IAF/VOF policy. A misconduct is never closed early at all,
 * which `assertMayCloseReportedMisconduct` refuses before this is asked.
 */
export const resolveEarlyCloseServiceNote = ({
  policyService,
  errand,
  phases,
  closesBeforeWorkflowEnds,
  motivation,
}: EarlyCloseRequest): string | undefined => {
  if (!closesBeforeWorkflowEnds || !policyService.iafVofClassificationPolicy) return undefined;
  if (!hasReachedPhase(errand, phases, IAF_VOF_REVIEW_PHASE_NAME)) throw new HttpException(422, EARLY_CLOSE_BEFORE_REVIEW);
  const reason = motivation?.trim();
  if (!reason) throw new HttpException(422, EARLY_CLOSE_NEEDS_MOTIVATION);
  return `${EARLY_CLOSE_NOTE_HEADING} ${reason}`;
};

interface AssertHslAnalysisFinishedRequest {
  readonly policyService: Pick<SupportInvestigationPolicyService, 'iafVofClassificationPolicy' | 'profile' | 'getState'>;
  readonly documentService: Pick<SupportJsonParameterService, 'readBoundSchema'>;
  readonly user: User;
  readonly municipalityId: string;
  readonly errandId: string;
  /** The errand as the write read it, with its labels and JSON parameters. */
  readonly errand: Errand;
  /** Whether the write would close the errand. */
  readonly closes: boolean;
}

const carriesLabel = (errand: Pick<Errand, 'labels'>, resourcePath: string): boolean =>
  (errand.labels ?? []).some(label => normalizeSupportManagementResourcePath(label.resourcePath) === resourcePath);

/**
 * Refuses closing an IAF/VOF errand before MAS/MAR is done with it, whoever closes it - a unit manager, a head of
 * operations - and whichever way. An errand with a high HSL risk waits for their initial assessment, whichever way it
 * goes. Where it is that the event is analysed, Händelseanalys HSL has to be saved as completed and Beslut HSL saved
 * as well. An analysis the closer cannot read is taken from the errand's labels, and held rather than let through.
 */
export const assertHslAnalysisFinishedBeforeClose = async ({
  policyService,
  documentService,
  user,
  municipalityId,
  errandId,
  errand,
  closes,
}: AssertHslAnalysisFinishedRequest): Promise<void> => {
  if (!closes || !policyService.iafVofClassificationPolicy) return;
  const documents = policyService.profile.documents;
  const analysisDefinition = documents.find(document => document.schemaName === IAF_VOF_HSL_ANALYSIS_SCHEMA_NAME);
  const decisionDefinition = documents.find(document => document.schemaName === IAF_VOF_HSL_DECISION_SCHEMA_NAME);
  if (!analysisDefinition || !decisionDefinition) return;

  if ((await policyService.getState()) === 'unavailable') throw new HttpException(503, 'Investigation policy is temporarily unavailable');

  const analysis = errand.jsonParameters?.find(parameter => parameter.key === analysisDefinition.key);
  const analysisValue = isJsonObject(analysis?.value) ? analysis.value : undefined;
  const analysisStartedLabel = carriesLabel(errand, IAF_VOF_HSL_ANALYSIS_STARTED_LABEL);
  // A high HSL risk is MAS/MAR's to assess, so the errand waits for that assessment whichever way it goes.
  const assessed = analysisValue ? hasHslAnalysisDecision(analysisValue) : analysisStartedLabel;
  if (carriesLabel(errand, IAF_VOF_HIGH_HSL_RISK_LABEL) && !assessed) throw new HttpException(422, HSL_ASSESSMENT_PENDING);
  const analysed = analysisValue ? startsHslAnalysis(analysisValue) : analysisStartedLabel;
  if (!analysed) return;

  // 422, as for the other refusals to close: the errand is as the handler left it, and the message names why.
  const refusal = new HttpException(422, HSL_ANALYSIS_UNDER_WAY);
  if (!analysis?.schemaId || !analysisValue) throw refusal;
  const schema = await documentService.readBoundSchema({ definition: analysisDefinition, municipalityId, errandId, user }, analysis.schemaId);
  if (!isDocumentCompleted(schema, analysisValue)) throw refusal;
  const decision = errand.jsonParameters?.find(parameter => parameter.key === decisionDefinition.key);
  if (!isJsonObject(decision?.value)) throw refusal;
};

interface AssertInvestigationCompletedRequest {
  readonly policyService: Pick<SupportInvestigationPolicyService, 'iafVofClassificationPolicy' | 'profile' | 'getState'>;
  readonly documentService: Pick<SupportJsonParameterService, 'readBoundSchema'>;
  readonly user: User;
  readonly municipalityId: string;
  readonly errandId: string;
  /** The errand as the phase write read it, with its JSON parameters. */
  readonly errand: Errand;
  /** The name of the phase the write would move the errand into. */
  readonly targetPhaseName: string | undefined;
}

/**
 * Refuses to move an IAF/VOF errand into the decision phase until the investigation it is decided on
 * has been saved as completed - the same `x-draken-completion` mark that locks the document.
 *
 * Which investigation that is belongs to `resolveIafVofDecisionInvestigationDocumentKey`. This only
 * applies it: a profile without the IAF/VOF policy has no investigation to wait for, and an errand
 * whose investigation state cannot be read is refused rather than waved through.
 */
export const assertInvestigationCompletedBeforeDecision = async ({
  policyService,
  documentService,
  user,
  municipalityId,
  errandId,
  errand,
  targetPhaseName,
}: AssertInvestigationCompletedRequest): Promise<void> => {
  if (targetPhaseName !== IAF_VOF_DECISION_PHASE_NAME) return;
  const policy = policyService.iafVofClassificationPolicy;
  if (!policy) return;

  if ((await policyService.getState()) === 'unavailable') throw new HttpException(503, 'Investigation policy is temporarily unavailable');

  const key = resolveIafVofDecisionInvestigationDocumentKey(policy, errand);
  const definition = policyService.profile.documents.find(document => document.key === key);
  if (!definition) throw new HttpException(502, `Investigation profile is missing the ${key} document`);

  // 422 rather than 409, as for the measures before closing: the errand is as the handler left it,
  // and the message names what is missing.
  const saved = errand.jsonParameters?.find(parameter => parameter.key === key);
  const refusal = new HttpException(422, investigationNotCompletedMessage(definition.tabLabel));
  if (!saved?.schemaId || !isJsonObject(saved.value)) throw refusal;

  // Completed means what the BFF locks the document on, so the declaration is read from the schema
  // the document is bound to rather than assumed.
  const schema = await documentService.readBoundSchema({ definition, municipalityId, errandId, user }, saved.schemaId);
  if (!isDocumentCompleted(schema, saved.value)) throw refusal;
};
