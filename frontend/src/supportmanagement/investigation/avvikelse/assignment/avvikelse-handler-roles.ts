/**
 * The handler role keys the avvikelse flow knows by name.
 *
 * They are the same keys the deployment configures in `HEALTHCAREDEVIATION_HANDLER_ROLES`, and the backend
 * enforces the membership - these constants only decide what the client offers and says, so a mismatch
 * shows up as an empty selector or a plainer text rather than as a wrong assignment.
 */
export const LEX_MANAGER_ROLE_KEY = 'lex-ansvarig';
export const LEX_INVESTIGATOR_ROLE_KEY = 'lex-utredare';
export const MAS_MAR_ROLE_KEY = 'mas-mar';
export const HEAD_OF_OPERATIONS_ROLE_KEY = 'verksamhetschef';
export const UNIT_MANAGER_ROLE_KEY = 'enhetschef';

/** The roles that handle an errand while it is with LEX. */
export const LEX_HANDLER_ROLE_KEYS: readonly string[] = Object.freeze([
  LEX_MANAGER_ROLE_KEY,
  LEX_INVESTIGATOR_ROLE_KEY,
]);
