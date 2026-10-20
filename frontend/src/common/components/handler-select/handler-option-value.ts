import { Admin, HandlerRole } from '@common/services/user-service';

/**
 * The value of one Ansvarig option: the role heading it sits under and the account it gives the errand to.
 *
 * A person holding two roles is listed under both, and the two can mean different things: giving the errand to a
 * manager who is also LEX-ansvarig is an ordinary assignment under the one heading and the handover to LEX under
 * the other. A display name tells neither the role nor, for two people of the same name, the person.
 */
const SEPARATOR = ':';

export interface HandlerOptionChoice {
  roleKey: string;
  adAccount: string;
}

export const handlerOptionValue = (roleKey: string, adAccount: string): string => `${roleKey}${SEPARATOR}${adAccount}`;

/** Role keys are kebab-case, so the first separator ends the role and the rest is the account. */
export const parseHandlerOptionValue = (value: string | undefined): HandlerOptionChoice | undefined => {
  const index = value?.indexOf(SEPARATOR) ?? -1;
  if (!value || index <= 0 || index === value.length - 1) return undefined;
  return { roleKey: value.slice(0, index), adAccount: value.slice(index + 1) };
};

const sameAccount = (first: string, second: string): boolean =>
  first.trim().toLowerCase() === second.trim().toLowerCase();

/** The handler an option stands for: the entry for that account under that role. */
export const findHandlerForOption = (handlers: readonly Admin[], value: string | undefined): Admin | undefined => {
  const choice = parseHandlerOptionValue(value);
  if (!choice) return undefined;
  return handlers.find(
    (handler) => sameAccount(handler.adAccount, choice.adAccount) && handler.roleKeys.includes(choice.roleKey)
  );
};

/**
 * The option that shows the handler who already has the errand: the first heading they are listed under, in the
 * deployment's role order. An entry that would hand the errand over is passed over, since already having the errand
 * is not being handed it. Undefined when the handler is not among those offered.
 */
export const optionValueForHandler = (
  handlers: readonly Admin[],
  roles: readonly HandlerRole[],
  adAccount: string
): string | undefined => {
  const entries = handlers.filter((handler) => sameAccount(handler.adAccount, adAccount));
  const ordered = [
    ...entries.filter((handler) => !handler.handoverStep),
    ...entries.filter((handler) => handler.handoverStep),
  ];
  for (const handler of ordered) {
    const role = roles.find((candidate) => handler.roleKeys.includes(candidate.key));
    if (role) return handlerOptionValue(role.key, handler.adAccount);
  }
  return undefined;
};
