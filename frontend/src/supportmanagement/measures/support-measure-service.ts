import type { Measure, MeasureType, Role } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService } from '@common/services/api-service';
import { toStrongETag } from '@supportmanagement/services/strong-etag';

import type { MeasureDecisionInput } from './measure-decision';
import type { MeasureFollowUpInput } from './measure-follow-up';
import type { PlannedSupportMeasure } from './planned-measures';

export interface MeasuresSnapshot {
  measures: Measure[];
  metadata: { measureTypes: MeasureType[]; roles: Role[] };
  creationRoles: Role[];
  registration: {
    status: 'ready' | 'unconfigured' | 'invalid';
    /** The measure types each role registers, by the metadata name a measure's `type` carries. */
    roleTypes: { roleName: string; measureTypes: string[]; decides: boolean }[];
  };
  /** Whether Support Management lets the user write the errand's measures. The list stays readable without it. */
  canWrite: boolean;
  /** Whether the user's role follows up approved measures. */
  mayFollowUp: boolean;
  /** Why the errand may not be closed yet, as the close would be refused; absent once nothing stands in the way. */
  closeRefusal?: string;
  /** Why the errand may not go on to the follow-up yet: proposals that wait for their decision. */
  followUpRefusal?: string;
}

export interface PlannedMeasuresSnapshot {
  measures: PlannedSupportMeasure[];
  metadata: { measureTypes: MeasureType[]; roles: Role[] };
  /** More errands matched than the BFF read covers, so the list is incomplete. */
  truncated: boolean;
}

export type MeasureChanges = Pick<
  Measure,
  'type' | 'responsibleUser' | 'goal' | 'description' | 'plannedStart' | 'plannedComplete' | 'executed'
>;

export type NewMeasure = MeasureChanges & Required<Pick<Measure, 'type' | 'addedByRole' | 'goal' | 'description'>>;

const measuresUrl = (errandId: string) => `supporterrands/${encodeURIComponent(errandId)}/measures`;

export async function getSupportMeasures(errandId: string): Promise<MeasuresSnapshot> {
  const response = await apiService.get<MeasuresSnapshot>(measuresUrl(errandId));
  return response.data;
}

/** Open planned measures on every errand the user reaches, for the overview outside the errand. */
export async function getPlannedSupportMeasures(): Promise<PlannedMeasuresSnapshot> {
  const response = await apiService.get<PlannedMeasuresSnapshot>(`supportmeasures/planned`);
  return response.data;
}

export async function createSupportMeasure(errandId: string, data: NewMeasure): Promise<void> {
  await apiService.post<void, NewMeasure>(measuresUrl(errandId), data);
}

export async function updateSupportMeasure(
  errandId: string,
  measureId: string,
  version: Measure['version'],
  data: MeasureChanges
): Promise<void> {
  await apiService.patch<void, MeasureChanges>(`${measuresUrl(errandId)}/${encodeURIComponent(measureId)}`, data, {
    headers: { 'If-Match': measureETag(version) },
  });
}

/** Removes a measure, on its own version so a measure somebody changed meanwhile is not removed unseen. */
export async function deleteSupportMeasure(
  errandId: string,
  measureId: string,
  version: Measure['version']
): Promise<void> {
  await apiService.deleteRequest<void>(`${measuresUrl(errandId)}/${encodeURIComponent(measureId)}`, {
    headers: { 'If-Match': measureETag(version) },
  });
}

export async function decideSupportMeasure(
  errandId: string,
  measureId: string,
  version: Measure['version'],
  decision: MeasureDecisionInput
): Promise<void> {
  await apiService.patch<void, MeasureDecisionInput>(
    `${measuresUrl(errandId)}/${encodeURIComponent(measureId)}/decision`,
    decision,
    {
      headers: { 'If-Match': measureETag(version) },
    }
  );
}

export async function followUpSupportMeasure(
  errandId: string,
  measureId: string,
  version: Measure['version'],
  followUp: MeasureFollowUpInput
): Promise<void> {
  await apiService.patch<void, MeasureFollowUpInput>(
    `${measuresUrl(errandId)}/${encodeURIComponent(measureId)}/follow-up`,
    followUp,
    {
      headers: { 'If-Match': measureETag(version) },
    }
  );
}

/**
 * Moves an approved measure's end date from the follow-up; the BFF keeps its start as decided. A description is
 * sent only when it was rewritten in the same step, to say why the date moves.
 */
export async function changeSupportMeasurePlannedComplete(
  errandId: string,
  measureId: string,
  version: Measure['version'],
  plannedComplete: string,
  description?: string
): Promise<void> {
  await apiService.patch<void, Pick<Measure, 'plannedComplete' | 'description'>>(
    `${measuresUrl(errandId)}/${encodeURIComponent(measureId)}/planned-complete`,
    { plannedComplete, ...(description !== undefined ? { description } : {}) },
    { headers: { 'If-Match': measureETag(version) } }
  );
}

function measureETag(version: Measure['version']): string {
  return toStrongETag(version, 'measure');
}
