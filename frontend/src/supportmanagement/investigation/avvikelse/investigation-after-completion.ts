import { HSL_INVESTIGATION_SCHEMA_NAME, UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME } from './avvikelse-schema-names';

/** What follows once an investigation is finished, which the one finishing it is told. */
export type InvestigationAfterCompletion = 'hand-over-to-lex-manager' | 'create-report' | 'save';

interface AfterCompletionInput {
  readonly schemaName: string;
  /** Whether the unit manager's investigation, as it now stands, leaves a LEX handover to make. */
  readonly needsLexAssignment: boolean;
}

/**
 * MAS/MAR's HSL investigation leaves the errand with its handler, so it is only saved. The unit manager hands the
 * errand to LEX-ansvarig only where the investigation assesses a suspected misconduct that has not been handed
 * over yet; an ordinary deviation stays with them for the decision. A LEX investigation goes on to LEX-ansvarig.
 */
export const investigationAfterCompletion = ({
  schemaName,
  needsLexAssignment,
}: AfterCompletionInput): InvestigationAfterCompletion => {
  if (schemaName === HSL_INVESTIGATION_SCHEMA_NAME) return 'save';
  if (schemaName === UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME && !needsLexAssignment) return 'create-report';
  return 'hand-over-to-lex-manager';
};
