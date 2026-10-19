import dayjs from 'dayjs';

import { formatOffsetDateTime } from '@/utils/util';

import { ErrandFilterInput, sanitizeQuery } from './support-errand.service';

/** Support Management refuses a longer search query. */
export const ERRAND_SEARCH_QUERY_MAX_LENGTH = 2000;

/**
 * The fields the free-text query has always been matched against. The index could look in every
 * text of the errand, communications included, but a search is meant to find what it found before.
 */
const FREE_TEXT_FIELDS = [
  'description',
  'title',
  'errandNumber',
  'stakeholders.firstName',
  'stakeholders.lastName',
  'stakeholders.address',
  'stakeholders.zipCode',
  'stakeholders.contactChannels.value',
  'stakeholders.organizationName',
  'stakeholders.externalId',
  'parameters.values',
] as const;

/** Characters the query syntax reserves, each of which a backslash makes literal. */
const RESERVED_CHARACTERS = /[+\-=&|!(){}[\]^"~*?:\\/]/gu;

/** `<` and `>` start a range and cannot be escaped, so they are dropped. */
const UNESCAPABLE_CHARACTERS = /[<>]/gu;

export interface ErrandSearchInput extends Omit<ErrandFilterInput, 'labelCategory' | 'labelType' | 'labelSubType' | 'labelFilter'> {
  /** Label ids by criterion: the errand has to carry one label of every group. No group may be empty. */
  labelIdGroups?: readonly (readonly string[])[];
}

export const escapeSearchTerm = (term: string): string => term.replace(UNESCAPABLE_CHARACTERS, '').replace(RESERVED_CHARACTERS, '\\$&');

const quoted = (value: string): string => `"${value.replace(/["\\]/gu, '\\$&')}"`;

/** Wraps a comma-separated parameter into one field clause, e.g. `HIGH,LOW` -> `priority:("HIGH" OR "LOW")`. */
const anyOf = (field: string, values: readonly string[]): string => `${field}:(${values.map(quoted).join(' OR ')})`;

/** Every word somewhere in the field, the way the filter's `*query*` matched it as a substring. */
const containsEveryWord = (field: string, words: readonly string[]): string =>
  `${field}:(${words.map(word => `*${escapeSearchTerm(word)}*`).join(' AND ')})`;

const freeTextClause = (queryRaw: string | undefined, partyId: string | undefined): string | undefined => {
  const words = sanitizeQuery(queryRaw).split(' ').filter(Boolean);
  const clauses = words.length > 0 ? FREE_TEXT_FIELDS.map(field => containsEveryWord(field, words)) : [];
  if (words.length > 0 && partyId) {
    clauses.push(containsEveryWord('stakeholders.externalId', [sanitizeQuery(partyId)]));
  }
  return clauses.length > 0 ? `(${clauses.join(' OR ')})` : undefined;
};

const createdClause = (start: string | undefined, end: string | undefined): string | undefined => {
  if (!start && !end) return undefined;
  const from = start ? quoted(formatOffsetDateTime(dayjs(start).startOf('day'))) : '*';
  const to = end ? quoted(formatOffsetDateTime(dayjs(end).endOf('day'))) : '*';
  return `created:[${from} TO ${to}]`;
};

/**
 * Builds the Lucene query string for Support Management's errand search from the same criteria the
 * filter endpoints take, so a list answers the same whichever of the two is asked. Labels are indexed
 * by id only, so the caller resolves their resource paths first. Pure; an empty string matches every
 * errand.
 */
export const buildErrandSearchQuery = (input: ErrandSearchInput): string => {
  const { query, partyId, stakeholders, priority, category, type, channel, status, resolution, start, end, labelIdGroups = [] } = input;
  const clauses = [
    freeTextClause(query, partyId),
    stakeholders && `(assignedUserId:${quoted(stakeholders)} OR (reporterUserId:${quoted(stakeholders)} AND NOT _exists_:assignedUserId))`,
    priority && anyOf('priority', priority.split(',')),
    category && anyOf('category', category.split(',')),
    type && anyOf('type', type.split(',')),
    ...labelIdGroups.map(labelIds => anyOf('labels.metadataLabelId', labelIds)),
    channel && anyOf('channel', [channel]),
    status && anyOf('status', status.split(',')),
    resolution && anyOf('resolution', [resolution]),
    createdClause(start, end),
  ];
  return clauses.filter(Boolean).join(' AND ');
};
