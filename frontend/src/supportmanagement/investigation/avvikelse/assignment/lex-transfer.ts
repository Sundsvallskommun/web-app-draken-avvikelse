import { countWithNoun } from '@common/utils/count-with-noun';
import dayjs from 'dayjs';
import type { CErrandAction } from 'src/data-contracts/backend/data-contracts';

/**
 * The action Support Management schedules to move a reported misconduct to LEX on its own. The status
 * label recognises the same action by the same name.
 */
const LEX_TRANSFER_ACTION_NAME = 'ADD_LABEL';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The scheduled move to LEX, when the errand has one with a readable time. */
export const findLexTransferAction = (actions: readonly CErrandAction[] | undefined): CErrandAction | undefined =>
  actions?.find(
    (action) =>
      action.actionName === LEX_TRANSFER_ACTION_NAME &&
      typeof action.executeAfter === 'string' &&
      Number.isFinite(Date.parse(action.executeAfter))
  );

/** When the errand is sent to a LEX manager, counted from `now` and given as a local date and time. */
export const describeLexTransfer = (executeAfter: string, now: Date = new Date()): string => {
  const at = dayjs(executeAfter);
  const when = at.format('YYYY-MM-DD [kl.] HH:mm');
  const remaining = at.valueOf() - now.getTime();
  if (remaining <= 0) return `Ärendet skulle skickas till en LEX-ansvarig ${when} och skickas inom kort.`;
  if (remaining >= DAY_MS) {
    return `Ärendet skickas till en LEX-ansvarig om ${countWithNoun(
      Math.floor(remaining / DAY_MS),
      'dag',
      'dagar'
    )}, ${when}.`;
  }
  return `Ärendet skickas till en LEX-ansvarig om ${countWithNoun(
    Math.ceil(remaining / HOUR_MS),
    'timme',
    'timmar'
  )}, ${when}.`;
};
