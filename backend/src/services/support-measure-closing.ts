import type { Measure } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import type { User } from '@/interfaces/users.interface';

import type ApiService from './api.service';
import { CLOSED_SUPPORT_ERRAND_STATUS } from './support-errand.service';
import { isPlannedApprovedMeasure } from './support-measure-follow-up';

/** A measure nobody has decided on: it was proposed and is still only a proposal. */
const isUndecidedMeasure = (measure: Measure): boolean => !measure.accept;

/**
 * An approved, planned measure that has not been followed up: the follow-up tab still asks for its
 * answers. The follow-up saves them in `result`, so a planned measure reported as carried out through
 * an edit, which sets only `executed`, is still waiting for its follow-up.
 */
const isUnfollowedMeasure = (measure: Measure): boolean => isPlannedApprovedMeasure(measure) && !measure.result;

/**
 * Whether a measure still asks something of somebody. A rejected measure and one registered as
 * already carried out are both finished business.
 */
export const isUnhandledMeasure = (measure: Measure): boolean => isUndecidedMeasure(measure) || isUnfollowedMeasure(measure);

/** What is outstanding, counted so the refusal can say which of the two it is. */
export interface UnhandledMeasureCounts {
  readonly undecided: number;
  readonly unfollowed: number;
}

export const countUnhandledMeasures = (measures: readonly Measure[]): UnhandledMeasureCounts => ({
  undecided: measures.filter(isUndecidedMeasure).length,
  unfollowed: measures.filter(isUnfollowedMeasure).length,
});

const measureCount = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`;

/**
 * Why the errand cannot be closed, in the words the handler needs to act: which measures are in the
 * way, and what has to happen to them. Undefined when nothing is outstanding.
 */
export const unhandledMeasuresMessage = (measures: readonly Measure[]): string | undefined => {
  const { undecided, unfollowed } = countUnhandledMeasures(measures);
  if (undecided === 0 && unfollowed === 0) return undefined;

  const parts: string[] = [];
  if (undecided > 0) parts.push(`${measureCount(undecided, 'åtgärd', 'åtgärder')} väntar på beslut`);
  if (unfollowed > 0) parts.push(`${measureCount(unfollowed, 'åtgärd', 'åtgärder')} är inte uppföljd${unfollowed === 1 ? '' : 'a'}`);

  return `Ärendet kan inte avslutas förrän alla åtgärder är hanterade: ${parts.join(' och ')}.`;
};

/**
 * Why the errand cannot go on to the follow-up: proposals nobody has decided on. The follow-up follows up what was
 * approved, so a proposal has to be approved, partly approved or rejected first. Undefined when none waits.
 */
export const undecidedProposalsMessage = (measures: readonly Measure[]): string | undefined => {
  const { undecided } = countUnhandledMeasures(measures);
  if (undecided === 0) return undefined;
  return `Ärendet kan inte gå vidare till uppföljning förrän alla åtgärdsförslag är bedömda: ${undecided} förslag väntar på att godkännas, delvis godkännas eller avslås.`;
};

interface AssertProposalsDecidedRequest {
  readonly apiService: Pick<ApiService, 'get'>;
  readonly user: User;
  /** The errand's upstream path, without a trailing slash. */
  readonly errandUrl: string;
  readonly baseURL: string;
  /** Whether the write would move the errand into the phase its measures are followed up in. */
  readonly entersFollowUp: boolean;
}

/**
 * Refuses to move an errand into the follow-up while a proposal still waits for its decision. The same rule the
 * measures snapshot tells the client (`followUpRefusal`), so the phase button explains instead of failing.
 */
export const assertProposalsDecidedBeforeFollowUp = async ({
  apiService,
  user,
  errandUrl,
  baseURL,
  entersFollowUp,
}: AssertProposalsDecidedRequest): Promise<void> => {
  if (!entersFollowUp) return;

  const measures = await apiService.get<Measure[]>(
    { url: `${errandUrl}/measures`, baseURL, propagateClientError: true, mapUnauthorizedToForbidden: true },
    user,
  );
  // 422, as for the close: the errand is as the handler left it, and the message names what is missing.
  const undecided = undecidedProposalsMessage(measures.data ?? []);
  if (undecided) throw new HttpException(422, undecided);
};

interface AssertMeasuresHandledRequest {
  readonly apiService: Pick<ApiService, 'get'>;
  readonly user: User;
  /** The errand's upstream path, without a trailing slash. */
  readonly errandUrl: string;
  readonly baseURL: string;
  /** The status the write would leave the errand in. */
  readonly status: string | undefined;
}

/**
 * Refuses to close an errand while a measure still asks something of somebody.
 *
 * Called from every write that can close one - the explicit status transition and the phase move
 * that carries a status with it - so the rule does not depend on which button the handler pressed.
 * The measures are read here rather than taken from an errand read for another purpose: this is the
 * assertion the refusal rests on, and a read that happens to omit them would let the errand through.
 */
export const assertMeasuresHandledBeforeClose = async ({
  apiService,
  user,
  errandUrl,
  baseURL,
  status,
}: AssertMeasuresHandledRequest): Promise<void> => {
  if (status !== CLOSED_SUPPORT_ERRAND_STATUS) return;

  const measures = await apiService.get<Measure[]>(
    { url: `${errandUrl}/measures`, baseURL, propagateClientError: true, mapUnauthorizedToForbidden: true },
    user,
  );
  // 422 rather than 409: the client reads 409 and 412 on an errand write as "somebody else changed
  // it" and says so. This is not that - the errand is exactly as the handler left it, and the
  // message names what is missing, so it needs a status the client passes through.
  const unhandled = unhandledMeasuresMessage(measures.data ?? []);
  if (unhandled) throw new HttpException(422, unhandled);
};
