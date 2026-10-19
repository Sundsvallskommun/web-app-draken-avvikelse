import { ApiPagingData } from '@supportmanagement/interfaces/errand';

const typeMap = {
  CREATE: 'Skapa',
  UPDATE: 'Uppdatera',
  DELETE: 'Ta bort',
  UNKNOWN: 'Okänd',
};

export interface SupportEvent {
  id?: string;
  type: keyof typeof typeMap;
  /** What kind of entity the event refers to: MESSAGE, ATTACHMENT, NOTE, ... */
  subType?: string;
  /** Ties together everything that happened in one operation, events and notifications alike. */
  requestGroupId?: string;
  message: string;
  /** Longer description of the event, when upstream provides one. */
  details?: string;
  owner: string;
  created: string;
  historyReference: string;
  sourceType: string;
  metadata: {
    key: string;
    value: string;
  }[];
}

export interface SupportEvents {
  content: SupportEvent[];
  pageable: ApiPagingData;
}

export interface ParsedSupportEvent extends SupportEvent {
  parsed: {
    event: string;
    datetime: string;
    version: string;
    executedBy: string;
  };
}

/** Events that happened as part of the same operation, rendered as one entry in the log. */
export interface SupportEventGroup {
  key: string;
  /** The event representing the group — the first one, since the log is sorted newest first. */
  latest: ParsedSupportEvent;
  events: ParsedSupportEvent[];
}
