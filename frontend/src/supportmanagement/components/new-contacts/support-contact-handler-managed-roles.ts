import { getInvestigationHandlerManagedStakeholderRoles } from '@supportmanagement/investigation/investigation-variant-registry';

/**
 * Whether the handler adds stakeholders of this role in Grunduppgifter - by search or by hand - removes them and makes
 * one the errand's owner, as the running variant says. Every role is, where the variant has no say in it.
 */
export const handlerManagesStakeholderRole = (role: string | undefined): boolean => {
  const managedRoles = getInvestigationHandlerManagedStakeholderRoles();
  return managedRoles === undefined || managedRoles.includes(role ?? '');
};
