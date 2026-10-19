import { Status } from '@supportmanagement/services/support-errand-status';
import { getInitialSupportPhaseToLeave, isInSupportPhase } from '@supportmanagement/services/support-phase-service';

import type { InvestigationNextStep, InvestigationNextStepContext } from '../investigation-variant';
import {
  handsErrandToLexManager,
  isWithLexInvestigation,
  leavesFollowUpToTheUnit,
  requiresLexAssignment,
} from './assignment/avvikelse-assignment-policy';
import { LEX_MANAGER_ROLE_KEY } from './assignment/avvikelse-handler-roles';
import { resolveAvvikelseDocumentApplicability } from './avvikelse-classification-policy';
import { resolveDecisionInvestigation } from './avvikelse-decision-investigation';
import {
  HSL_DECISION_SCHEMA_NAME,
  LEX_ASSESSMENT_SCHEMA_NAME,
  LEX_DECISION_SCHEMA_NAME,
} from './avvikelse-schema-names';
import { findInvestigationDocumentBySchemaName, readSavedInvestigationDocument } from './saved-investigation-document';

/** The phases the avvikelse process runs through, as the namespace's phase metadata names them. */
export const REVIEW_PHASE_NAME = 'REVIEW';
const INVESTIGATION_PHASE_NAME = 'INVESTIGATION';
const DECISION_PHASE_NAME = 'DECISION';
const FOLLOW_UP_PHASE_NAME = 'FOLLOW_UP';

/** The errand page's tabs a step is taken in, by the keys and names the page gives them. */
const STEP_TABS = Object.freeze({
  details: { key: 'details', label: 'Ärendeuppgifter' },
  messages: { key: 'messages', label: 'Meddelanden' },
  investigation: { key: 'investigation', label: 'Utredning' },
  measures: { key: 'measures', label: 'Åtgärder' },
  decision: { key: 'decision', label: 'Beslut' },
  followUp: { key: 'follow-up', label: 'Uppföljning' },
});

const sameAccount = (left: string | undefined, right: string | undefined): boolean =>
  Boolean(left?.trim()) && left?.trim().toLowerCase() === right?.trim().toLowerCase();

/** LEX-ansvarig's initial assessment, while the errand is with LEX and the assessment has not been saved. */
const awaitsLexAssessment = ({ errand, profile, viewer }: InvestigationNextStepContext): boolean => {
  const assessment = findInvestigationDocumentBySchemaName(profile, LEX_ASSESSMENT_SCHEMA_NAME);
  return (
    Boolean(assessment) &&
    (viewer.roleKeys ?? []).includes(LEX_MANAGER_ROLE_KEY) &&
    !readSavedInvestigationDocument(errand, assessment?.key)
  );
};

const investigationStep = (context: InvestigationNextStepContext): InvestigationNextStep => {
  const { errand, labelStructure, viewer } = context;
  const withLex = isWithLexInvestigation(errand?.labels, labelStructure);
  if (withLex && awaitsLexAssessment(context)) {
    return {
      text: 'Gör den initiala bedömningen under Ärendeuppgifter: ska ärendet utredas enligt lex Sarah?',
      tab: STEP_TABS.details,
    };
  }
  if (requiresLexAssignment(context)) {
    return {
      text: 'Utredningen bedömer ett misstänkt missförhållande. Lämna ärendet till LEX med Tilldela LEX-ansvarig nedan.',
    };
  }
  const decision = resolveDecisionInvestigation(context);
  if (!decision) return { text: 'Dokumentera utredningen under Utredning.', tab: STEP_TABS.investigation };
  // A reported misconduct still with the unit: LEX investigates it once it reaches them.
  if (decision.lexMatter && !withLex) {
    return {
      text: 'Fyll i Utredning enhetschef. Ett missförhållande går sedan vidare till LEX, som utreder det.',
      tab: STEP_TABS.investigation,
    };
  }
  if (!decision.completed) {
    const handOver = (viewer.roleKeys ?? []).includes(LEX_MANAGER_ROLE_KEY)
      ? ', eller lämna utredningen till en LEX-utredare under Ansvarig'
      : '';
    return {
      text: `Skriv ${decision.document.tabLabel} och markera den som klar${handOver}.`,
      tab: STEP_TABS.investigation,
    };
  }
  return handsErrandToLexManager(viewer)
    ? { text: 'Utredningen är klar. Lämna ärendet till LEX-ansvarig med knappen nedan.' }
    : { text: 'Utredningen är klar. Skicka ärendet till beslut med knappen nedan.' };
};

/** The follow-up follows up what was approved: proposals still waiting are decided on before the errand goes there. */
const proposalsFirst = ({ measuresFollowUpRefusal }: InvestigationNextStepContext): InvestigationNextStep | undefined =>
  measuresFollowUpRefusal
    ? {
        text: 'Det finns åtgärdsförslag som inte är bedömda. Bedöm dem under Åtgärder innan ärendet går vidare till uppföljning.',
        tab: STEP_TABS.measures,
      }
    : undefined;

const decisionStep = (context: InvestigationNextStepContext): InvestigationNextStep => {
  const { errand, profile, viewer } = context;
  const applicability = resolveAvvikelseDocumentApplicability(errand);
  if (!applicability) {
    return (
      proposalsFirst(context) ?? {
        text: 'Ärendet kräver inget beslut. Gå vidare till uppföljning med knappen nedan.',
      }
    );
  }
  const decisionDocument = findInvestigationDocumentBySchemaName(
    profile,
    applicability === 'reported-misconduct' ? LEX_DECISION_SCHEMA_NAME : HSL_DECISION_SCHEMA_NAME
  );
  if (!readSavedInvestigationDocument(errand, decisionDocument?.key)) {
    return { text: 'Ärendet beslutas under Beslut.', tab: STEP_TABS.decision };
  }
  return leavesFollowUpToTheUnit(viewer)
    ? {
        text: 'Beslutet är fattat. Uppföljningen görs av enheten: återlämna ärendet med Återlämna till chef under Beslut.',
        tab: STEP_TABS.decision,
      }
    : proposalsFirst(context) ?? { text: 'Beslutet är fattat. Gå vidare till uppföljning med knappen nedan.' };
};

/**
 * What the errand's handler does next in the avvikelse process, and the tab it is done in. It speaks to the handler
 * alone: somebody reading an errand assigned to another, or one they may only know of, is told nothing. An errand
 * with no handler asks for one, whoever reads it.
 */
export const resolveAvvikelseNextStep = (context: InvestigationNextStepContext): InvestigationNextStep | undefined => {
  const { errand, viewerAccount, phases } = context;
  if (!errand?.id || errand.limitedAccess || errand.status === Status.SOLVED) return undefined;
  if (!errand.assignedUserId?.trim()) {
    return { text: 'Ärendet saknar handläggare. Ta ärendet eller välj en handläggare under Ansvarig.' };
  }
  if (!sameAccount(errand.assignedUserId, viewerAccount)) return undefined;

  switch (errand.status) {
    case Status.ASSIGNED:
      return { text: 'Ärendet har tilldelats dig. Börja med Återuppta ärende nedan.' };
    case Status.SUSPENDED:
      return { text: 'Ärendet är parkerat. Återuppta det nedan när du kan fortsätta.' };
    case Status.AWAITING_RESPONSE:
      // Nothing takes the errand out of waiting when the answer comes: the handler resumes it, and the status then
      // says it is being handled again.
      return {
        text: 'Ärendet väntar på komplettering. När svaret har kommit under Meddelanden trycker du på Återuppta ärende, så att statusen visar att ärendet hanteras igen.',
        tab: STEP_TABS.messages,
      };
  }

  if (getInitialSupportPhaseToLeave(phases)) {
    return {
      text: 'Läs rapporten under Ärendeuppgifter. Starta sedan handläggningen med knappen nedan.',
      tab: STEP_TABS.details,
    };
  }
  if (isInSupportPhase(REVIEW_PHASE_NAME, phases)) {
    return {
      text: 'Granska rapporten under Ärendeuppgifter. Inled sedan utredningen med knappen nedan.',
      tab: STEP_TABS.details,
    };
  }
  if (isInSupportPhase(INVESTIGATION_PHASE_NAME, phases)) return investigationStep(context);
  if (isInSupportPhase(DECISION_PHASE_NAME, phases)) return decisionStep(context);
  if (isInSupportPhase(FOLLOW_UP_PHASE_NAME, phases)) {
    return {
      text: 'Följ upp åtgärderna under Uppföljning. När alla är uppföljda avslutas ärendet med knappen nedan.',
      tab: STEP_TABS.followUp,
    };
  }
  return undefined;
};
