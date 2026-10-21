import { createHash } from 'node:crypto';

import { IAF_VOF_PERMANENT_LABELS } from '@/config/iaf-vof-permanent-labels';
import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';

import { getActiveErrandPhaseId } from './support-errand.service';

/**
 * An errand-level command - its own fields, the assignment, a status, a handover, the classification - is conditioned
 * on the errand as the handler was shown it, and only on the parts of it the command depends on: its facts.
 *
 * Not on the errand's version. Every write beneath the errand - a parameter, a document, a measure - moves that
 * version too, the handler's own writes included, so a version check either refuses a command over an unrelated
 * change or has to predict how far the handler's own writes moved the version. A fact check needs neither: the BFF
 * reads the errand, compares the facts the command depends on with what the handler saw, and writes upstream with
 * If-Match on the version it just read, so a write landing in between is refused by Support Management itself.
 *
 * The client never interprets a fact. Every errand the BFF hands out carries the fingerprints of its facts
 * (`errandFacts`), and a command sends back the ones it depends on (`seenFacts`).
 */
export const ERRAND_FACT_KEYS = [
  'title',
  'priority',
  'contactReason',
  'contactReasonDescription',
  'businessRelated',
  'escalationEmail',
  'channel',
  'description',
  'stakeholders',
  'externalTags',
  'labels',
  'routingLabels',
  'classification',
  'assignedUserId',
  'status',
  'activePhase',
] as const;

export type ErrandFactKey = (typeof ERRAND_FACT_KEYS)[number];

/** The fingerprint of each fact of an errand. */
export type ErrandFacts = Record<ErrandFactKey, string>;

/** The fingerprints a command sends back: those of the facts it depends on, as the handler saw them. */
export type SeenErrandFacts = Partial<Record<string, unknown>>;

/** Labels that decide who reaches the errand and what it is reported as: its access, its report type, its place. */
const ROUTING_LABEL_ROOTS: readonly string[] = ['ACCESS', 'REPORT_TYPE', 'LOCATION'];

const PERMANENT_LABEL_PATHS = new Set(IAF_VOF_PERMANENT_LABELS.map(normalizeSupportManagementResourcePath));

type ErrandLabels = NonNullable<Errand['labels']>;

const labelRoot = (label: ErrandLabels[number]): string => normalizeSupportManagementResourcePath(label.resourcePath).split('/')[0];

const isRoutingLabel = (label: ErrandLabels[number]): boolean => ROUTING_LABEL_ROOTS.includes(labelRoot(label));

/** A label the investigation adds on its own when a document decides it, never one the classification chooses. */
const isPermanentLabel = (label: ErrandLabels[number]): boolean =>
  PERMANENT_LABEL_PATHS.has(normalizeSupportManagementResourcePath(label.resourcePath));

const labelIds = (labels: ErrandLabels): string[] => labels.map(label => label.id ?? '').sort();

/** Object keys in one order and absent values left out, so a fact reads the same however upstream serialized it. */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined && entry !== null)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
};

/** Versions are the upstream's concurrency bookkeeping, not part of what the errand says. */
const withoutVersions = <T>(items: readonly T[]): Omit<T, 'version'>[] =>
  items.map(item => {
    const { version: _version, ...rest } = item as T & { version?: unknown };
    return rest;
  });

const FACT_VALUES: Readonly<Record<ErrandFactKey, (errand: Errand) => unknown>> = {
  title: errand => errand.title ?? '',
  priority: errand => errand.priority ?? '',
  contactReason: errand => errand.contactReason ?? '',
  contactReasonDescription: errand => errand.contactReasonDescription ?? '',
  businessRelated: errand => Boolean(errand.businessRelated),
  escalationEmail: errand => errand.escalationEmail ?? '',
  channel: errand => errand.channel ?? '',
  description: errand => errand.description ?? '',
  stakeholders: errand => withoutVersions(errand.stakeholders ?? []),
  externalTags: errand =>
    [...(errand.externalTags ?? [])].sort((first, second) => `${first.key}=${first.value}`.localeCompare(`${second.key}=${second.value}`)),
  labels: errand => labelIds(errand.labels ?? []),
  routingLabels: errand => labelIds((errand.labels ?? []).filter(isRoutingLabel)),
  // The classification is kept as labels - one per legal base group - and the errand's own field holds only one.
  classification: errand => ({
    classification: errand.classification ?? null,
    labels: labelIds((errand.labels ?? []).filter(label => !isRoutingLabel(label) && !isPermanentLabel(label))),
  }),
  assignedUserId: errand => (errand.assignedUserId ?? '').trim().toLowerCase(),
  status: errand => errand.status ?? '',
  activePhase: errand => getActiveErrandPhaseId(errand) ?? '',
};

const fingerprint = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)) ?? 'null')
    .digest('base64url')
    .slice(0, 22);

/** The fingerprint of every fact of an errand, as the errand is handed out to the client. */
export const errandFacts = (errand: Errand): ErrandFacts =>
  Object.fromEntries(ERRAND_FACT_KEYS.map(key => [key, fingerprint(FACT_VALUES[key](errand))])) as ErrandFacts;

/**
 * An errand as the client gets it: with the fingerprints of its facts. They are taken from the errand as Support
 * Management answered it (`upstream`), before anything the BFF adds for the client - a stakeholder's person number,
 * say - so they compare with the next read of it.
 */
export const withErrandFacts = <T extends object>(errand: T, upstream: Errand = errand as Errand): T & { facts: ErrandFacts } => ({
  ...errand,
  facts: errandFacts(upstream),
});

export const ERRAND_CHANGED_ELSEWHERE_MESSAGE = 'Ärendet har ändrats av någon annan. Ladda om ärendet och försök igen.';

/**
 * Refuses a command when a fact it depends on is no longer what the handler saw. A fact the command depends on but
 * did not send is a malformed command, not a conflict.
 */
export const assertErrandFactsUnchanged = (current: Errand, seen: SeenErrandFacts | undefined, facts: readonly ErrandFactKey[]): void => {
  const missing = facts.filter(fact => typeof seen?.[fact] !== 'string');
  if (missing.length > 0) {
    throw new HttpException(400, `The command must send what the handler saw of: ${missing.join(', ')}`);
  }
  const currentFacts = errandFacts(current);
  if (facts.some(fact => currentFacts[fact] !== seen?.[fact])) {
    throw new HttpException(409, ERRAND_CHANGED_ELSEWHERE_MESSAGE);
  }
};
