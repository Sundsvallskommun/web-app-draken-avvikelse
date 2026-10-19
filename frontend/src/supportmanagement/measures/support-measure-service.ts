import type { Measure, MeasureType, Role } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService } from '@common/services/api-service';

import type { MeasureDecisionInput } from './measure-decision';
import type { MeasureFollowUpInput } from './measure-follow-up';
import type { PlannedSupportMeasure } from './planned-measures';

export interface MeasuresSnapshot {
  measures: Measure[];
  errandVersion: number;
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

const measuresUrl = (municipalityId: string, errandId: string) =>
  `supporterrands/${encodeURIComponent(municipalityId)}/${encodeURIComponent(errandId)}/measures`;

export async function getSupportMeasures(municipalityId: string, errandId: string): Promise<MeasuresSnapshot> {
  const response = await apiService.get<MeasuresSnapshot>(measuresUrl(municipalityId, errandId));
  return response.data;
}

/** Open planned measures on every errand the user reaches, for the overview outside the errand. */
export async function getPlannedSupportMeasures(municipalityId: string): Promise<PlannedMeasuresSnapshot> {
  const response = await apiService.get<PlannedMeasuresSnapshot>(
    `supportmeasures/${encodeURIComponent(municipalityId)}/planned`
  );
  return response.data;
}

export async function createSupportMeasure(municipalityId: string, errandId: string, data: NewMeasure): Promise<void> {
  await apiService.post<void, NewMeasure>(measuresUrl(municipalityId, errandId), data);
}

export async function updateSupportMeasure(
  municipalityId: string,
  errandId: string,
  measureId: string,
  version: Measure['version'],
  data: MeasureChanges
): Promise<void> {
  await apiService.patch<void, MeasureChanges>(
    `${measuresUrl(municipalityId, errandId)}/${encodeURIComponent(measureId)}`,
    data,
    { headers: { 'If-Match': measureETag(version) } }
  );
}

/** Removes a measure, on its own version so a measure somebody changed meanwhile is not removed unseen. */
export async function deleteSupportMeasure(
  municipalityId: string,
  errandId: string,
  measureId: string,
  version: Measure['version']
): Promise<void> {
  await apiService.deleteRequest<void>(`${measuresUrl(municipalityId, errandId)}/${encodeURIComponent(measureId)}`, {
    headers: { 'If-Match': measureETag(version) },
  });
}

export async function decideSupportMeasure(
  municipalityId: string,
  errandId: string,
  measureId: string,
  version: Measure['version'],
  decision: MeasureDecisionInput
): Promise<void> {
  await apiService.patch<void, MeasureDecisionInput>(
    `${measuresUrl(municipalityId, errandId)}/${encodeURIComponent(measureId)}/decision`,
    decision,
    { headers: { 'If-Match': measureETag(version) } }
  );
}

export async function followUpSupportMeasure(
  municipalityId: string,
  errandId: string,
  measureId: string,
  version: Measure['version'],
  followUp: MeasureFollowUpInput
): Promise<void> {
  await apiService.patch<void, MeasureFollowUpInput>(
    `${measuresUrl(municipalityId, errandId)}/${encodeURIComponent(measureId)}/follow-up`,
    followUp,
    { headers: { 'If-Match': measureETag(version) } }
  );
}

/**
 * Moves an approved measure's end date from the follow-up; the BFF keeps its start as decided. A description is
 * sent only when it was rewritten in the same step, to say why the date moves.
 */
export async function changeSupportMeasurePlannedComplete(
  municipalityId: string,
  errandId: string,
  measureId: string,
  version: Measure['version'],
  plannedComplete: string,
  description?: string
): Promise<void> {
  await apiService.patch<void, Pick<Measure, 'plannedComplete' | 'description'>>(
    `${measuresUrl(municipalityId, errandId)}/${encodeURIComponent(measureId)}/planned-complete`,
    { plannedComplete, ...(description !== undefined ? { description } : {}) },
    { headers: { 'If-Match': measureETag(version) } }
  );
}

function measureETag(version: Measure['version']): string {
  if (version === undefined || !Number.isSafeInteger(version) || version < 0) {
    throw new Error('A valid measure version is required before writing');
  }
  return `"${version}"`;
}
