import { getInvestigationRolesWithoutEmployeeSearch } from '@supportmanagement/investigation/investigation-variant-registry';

/** Whether the running variant says a stakeholder of this role is never an employee. */
export const withholdsEmployeeSearchFrom = (role: string | undefined): boolean =>
  getInvestigationRolesWithoutEmployeeSearch()?.includes(role ?? '') ?? false;

/** Whether Grunduppgifter offers the employee search for a stakeholder of this role. */
export const offersEmployeeSearchFor = (role: string | undefined): boolean => !withholdsEmployeeSearchFrom(role);
