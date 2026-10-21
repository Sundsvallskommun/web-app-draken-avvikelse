import { createHash } from 'node:crypto';

import { IAF_VOF_INVESTIGATION_CLASSIFICATION_LABEL_TREE } from '@/config/iaf-vof-investigation-classification';
import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';

import { getActiveErrandPhaseId } from './support-errand.service';
import { type LabelPathsById, resolveLabelPath } from './support-errand-label-paths';

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

/** The root of the label tree the classification is kept in: the labels a classification write chooses, and no others. */
const CLASSIFICATION_LABEL_ROOT = normalizeSupportManagementResourcePath(IAF_VOF_INVESTIGATION_CLASSIFICATION_LABEL_TREE.root.resource);

type ErrandLabels = NonNullable<Errand['labels']>;

/** Where a label sits in the tree - read by its id, since a label on the errand may leave its own path out. */
const labelRoot = (label: ErrandLabels[number], labelPaths: LabelPathsById): string => resolveLabelPath(label, labelPaths).split('/')[0];

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

const FACT_VALUES: Readonly<Record<ErrandFactKey, (errand: Errand, labelPaths: LabelPathsById) => unknown>> = {
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
  routingLabels: (errand, labelPaths) => labelIds((errand.labels ?? []).filter(label => ROUTING_LABEL_ROOTS.includes(labelRoot(label, labelPaths)))),
  // The classification is kept as labels - one per legal base group - and the errand's own field holds only one. The
  // labels are those of the classification's own tree: a label added beside it - a high HSL risk and the level above
  // it, written with a saved document - is no change of the classification.
  classification: (errand, labelPaths) => ({
    classification: errand.classification ?? null,
    labels: labelIds((errand.labels ?? []).filter(label => labelRoot(label, labelPaths) === CLASSIFICATION_LABEL_ROOT)),
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

/**
 * The fingerprint of every fact of an errand, as the errand is handed out to the client. `labelPaths` is the
 * namespace's label tree (`readLabelPathsById`), which says what each of the errand's labels is.
 */
export const errandFacts = (errand: Errand, labelPaths: LabelPathsById): ErrandFacts =>
  Object.fromEntries(ERRAND_FACT_KEYS.map(key => [key, fingerprint(FACT_VALUES[key](errand, labelPaths))])) as ErrandFacts;

/**
 * An errand as the client gets it: with the fingerprints of its facts. They are taken from the errand as Support
 * Management answered it (`upstream`), read by its id as every command reads it, before anything the BFF adds for
 * the client - a stakeholder's person number, say - so they compare with the next read of it.
 */
export const withErrandFacts = <T extends object>(
  errand: T,
  labelPaths: LabelPathsById,
  upstream: Errand = errand as Errand,
): T & { facts: ErrandFacts } => ({
  ...errand,
  facts: errandFacts(upstream, labelPaths),
});

export const ERRAND_CHANGED_ELSEWHERE_MESSAGE = 'Ärendet har ändrats av någon annan. Ladda om ärendet och försök igen.';

/**
 * Refuses a command when a fact it depends on is no longer what the handler saw. A fact the command depends on but
 * did not send is a malformed command, not a conflict.
 */
export const assertErrandFactsUnchanged = (
  current: Errand,
  seen: SeenErrandFacts | undefined,
  facts: readonly ErrandFactKey[],
  labelPaths: LabelPathsById,
): void => {
  const missing = facts.filter(fact => typeof seen?.[fact] !== 'string');
  if (missing.length > 0) {
    throw new HttpException(400, `The command must send what the handler saw of: ${missing.join(', ')}`);
  }
  const currentFacts = errandFacts(current, labelPaths);
  if (facts.some(fact => currentFacts[fact] !== seen?.[fact])) {
    throw new HttpException(409, ERRAND_CHANGED_ELSEWHERE_MESSAGE);
  }
};
