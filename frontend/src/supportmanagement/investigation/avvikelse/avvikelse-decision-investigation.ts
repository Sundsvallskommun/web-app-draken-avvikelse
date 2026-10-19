import type { InvestigationProfileDocument } from '../investigation-profile';
import type { InvestigationPhaseEntryContext } from '../investigation-variant';
import { assessesSuspectedMisconduct } from './assignment/avvikelse-assignment-policy';
import {
  AVVIKELSE_CLASSIFICATION_POLICY,
  isAvvikelseReportedMisconductErrand,
} from './avvikelse-classification-policy';
import { hasLexDeclinedInvestigation } from './lex-initial-assessment';
import { findInvestigationDocumentBySchemaName, readSavedInvestigationDocument } from './saved-investigation-document';

/**
 * The field every investigation schema names in `x-draken-completion` - the schema contract tests
 * hold every one to it. The BFF reads the declaration from the bound schema instead, and is the one
 * that refuses the phase change; this only keeps the button from offering a move it would refuse.
 */
const INVESTIGATION_COMPLETION_FIELD = 'completed';

export interface DecisionInvestigation {
  /** The investigation that has to be saved as completed before the errand may be decided. */
  readonly document: InvestigationProfileDocument;
  /** Whether it is a lex Sarah matter, decided on the SoL/LSS investigation rather than the unit manager's. */
  readonly lexMatter: boolean;
  readonly completed: boolean;
}

/**
 * Which investigation an avvikelse errand is decided on, and whether it is done.
 *
 * A lex Sarah matter - a reported misconduct, or a deviation the unit manager's saved investigation
 * assesses as a suspected one - is decided on the SoL/LSS investigation. A suspicion LEX-ansvarig declined in the
 * initial assessment is no longer one. Every other errand is decided on the unit manager's. MAS/MAR's HSL investigation never holds the decision back. The BFF applies
 * the same rule (`resolveIafVofDecisionInvestigationDocumentKey`).
 */
export const resolveDecisionInvestigation = ({
  errand,
  profile,
}: Pick<InvestigationPhaseEntryContext, 'errand' | 'profile'>): DecisionInvestigation | undefined => {
  const managerDocument = findInvestigationDocumentBySchemaName(
    profile,
    AVVIKELSE_CLASSIFICATION_POLICY.defaultOwnerSchemaName
  );
  const lexDocument = findInvestigationDocumentBySchemaName(
    profile,
    AVVIKELSE_CLASSIFICATION_POLICY.reportedMisconductOwnerSchemaName
  );
  if (!managerDocument || !lexDocument) return undefined;

  const lexMatter =
    isAvvikelseReportedMisconductErrand(errand) ||
    (assessesSuspectedMisconduct(readSavedInvestigationDocument(errand, managerDocument.key)) &&
      !hasLexDeclinedInvestigation(errand, profile));
  const document = lexMatter ? lexDocument : managerDocument;
  const saved = readSavedInvestigationDocument(errand, document.key);
  return { document, lexMatter, completed: saved?.[INVESTIGATION_COMPLETION_FIELD] === 'yes' };
};

/** What the handler is told when the move to the decision waits for the investigation. */
export const describeIncompleteDecisionInvestigation = ({ document, lexMatter }: DecisionInvestigation): string => {
  const required = `${document.tabLabel} måste vara markerad som klar och sparad innan ärendet kan skickas till beslut.`;
  return lexMatter
    ? `Ärendet gäller ett missförhållande eller misstänkt missförhållande och beslutas på ${document.tabLabel}. ${required}`
    : required;
};

/**
 * Whether the errand may enter the decision as far as its investigation goes. Only an active
 * investigation is waited for: switched off there is nothing to complete, and while its state cannot
 * be read the BFF refuses the move and says so.
 */
export const isDecisionInvestigationCompleted = (context: InvestigationPhaseEntryContext): boolean =>
  context.profile?.state !== 'active' || resolveDecisionInvestigation(context)?.completed !== false;
