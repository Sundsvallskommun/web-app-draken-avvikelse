import { apiService } from '@common/services/api-service';
import {
  ParsedSupportEvent,
  SupportEvent,
  SupportEventGroup,
  SupportEvents,
} from '@supportmanagement/interfaces/supportEvent';
import dayjs from 'dayjs';

const parseChange: (
  event: SupportEvent,
  errandId: string,
  municipalityId: string,
  keyMapper: { [key: string]: string }
) => Promise<ParsedSupportEvent> = async (event, errandId, municipalityId, keyMapper) => {
  const currentVersion = event.metadata.find((item) => item.key === 'CurrentVersion')?.value || 'unknown';
  const previousVersion = event.metadata.find((item) => item.key === 'PreviousVersion')?.value || 'unknown';
  const executedBy = event.metadata.find((item) => item.key === 'ExecutedBy')?.value || 'unknown';
  const p = {
    ...event,
    parsed: {
      event: event.message,
      datetime: dayjs(event.created).format('YYYY-MM-DD HH:mm:ss'),
      version: currentVersion,
      executedBy: executedBy,
    },
  } as ParsedSupportEvent;
  return p;
  // const diff = await fetchRevisionDiff(errandId, parsedChange, municipalityId, keyMapper);
  // parsedChange.parsed.diffList = diff;
};

export const getSupportErrandEvents: (
  errandId: string,
  municipalityId: string,
  keyMapper: { [key: string]: string }
) => Promise<ParsedSupportEvent[]> = (errandId, municipalityId, keyMapper) => {
  return apiService
    .get<SupportEvents>(`supporthistory/${municipalityId}/${errandId}`)
    .then((res) => {
      const ps = res.data.content.map((event) => parseChange(event, errandId, municipalityId, keyMapper));
      return Promise.all(ps);
    })
    .catch((e) => {
      console.error('Something went wrong when fetching errand events');
      throw e;
    });
};

/**
 * When the errand's current handler took it up after it was given to them, as the errand's history tells it.
 * Undefined when the history names no assignment to them.
 */
export const getSupportErrandAssigneeResumedAt = (
  errandId: string,
  municipalityId: string
): Promise<string | undefined> =>
  apiService
    .get<{ resumedAt: string | null }>(`supporthistory/${municipalityId}/${errandId}/assignee-resumed`)
    .then((res) => res.data?.resumedAt ?? undefined);

/**
 * Who gave the errand to its current handler, as the errand's history tells it. Undefined when the history names
 * no assignment to them, or not who made it.
 */
export const getSupportErrandAssignedBy = (errandId: string, municipalityId: string): Promise<string | undefined> =>
  apiService
    .get<{ assignedBy: string | null }>(`supporthistory/${municipalityId}/${errandId}/assigned-by`)
    .then((res) => res.data?.assignedBy ?? undefined);

/**
 * Collapse events that belong to the same operation into one log entry.
 *
 * Saving an errand can produce a handful of events in the same instant. Showing them as separate
 * dots on the timeline makes one action look like several, so they are grouped by the upstream
 * `requestGroupId`. Events without one stay on their own, which is the correct reading: there is
 * nothing saying they belong together.
 */
export const groupSupportEvents = (events: ParsedSupportEvent[]): SupportEventGroup[] => {
  const groups: SupportEventGroup[] = [];

  events.forEach((event, index) => {
    const openGroup = event.requestGroupId
      ? groups.find((group) => group.latest.requestGroupId === event.requestGroupId)
      : undefined;

    if (openGroup) {
      openGroup.events.push(event);
      return;
    }

    groups.push({
      key: event.requestGroupId ?? event.id ?? `event-${index}`,
      latest: event,
      events: [event],
    });
  });

  return groups;
};
