import dayjs from 'dayjs';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import type { IafVofInvestigationClassificationLabelTree } from '@/config/iaf-vof-investigation-classification';
import { DRAKEN_REGISTRATION_CHANNEL } from '@/config/support-errand-channels';
import { normalizeSupportManagementResourcePath } from '@/config/supportmanagement-path';
import { Errand, Label, Parameter, Phase, Status as SupportManagementStatus, Suspension } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { ContactChannelType } from '@/interfaces/support-contactchannel';
import { User } from '@/interfaces/users.interface';
import { apiURL, buildCategoryFilter, findLeafComponents, removeUnreachablePaths, toOffsetDateTime } from '@/utils/util';

import ApiService from './api.service';
const SERVICE = apiServiceName('supportmanagement');
const namespace = SUPPORTMANAGEMENT_NAMESPACE;

export const validateSupportAction: (municipalityId: string, errandId: string, user: User) => Promise<boolean> = async (
  municipalityId,
  errandId,
  user,
) => {
  let allowed = false;
  const apiService = new ApiService();
  const url = `${municipalityId}/${namespace}/errands/${errandId}`;
  const baseURL = apiURL(SERVICE);
  const res = await apiService.get<Errand>({ url, baseURL }, user);
  const existingErrand = res.data;
  if (user.username.toLocaleLowerCase() === existingErrand.assignedUserId?.toLocaleLowerCase()) {
    allowed = true;
  }
  if (existingErrand.assignedUserId?.toLocaleLowerCase() === undefined) {
    if (existingErrand.channel === 'EMAIL' || existingErrand.channel === 'ESERVICE') {
      allowed = true;
    }
  }
  return Promise.resolve(allowed);
};

export enum SupportStakeholderRole {
  PRIMARY = 'PRIMARY',
  CONTACT = 'CONTACT',
}

/**
 * Characters accepted in a free-text search query. Everything else is stripped before the
 * query is interpolated into the SupportManagement filter expression, so that a user cannot
 * break out of the quoted literal.
 */
const SAFE_CHARS_REGEX = /[^\p{L}\p{N}\s.\-_,:]/gu;

export const sanitizeQuery = (s?: string): string => {
  return (s ?? '').normalize('NFKC').replace(SAFE_CHARS_REGEX, '').replace(/\s+/g, ' ').trim();
};

export interface ErrandFilterInput {
  /** Raw free-text query. Sanitized here; callers pass it through untouched. */
  query?: string;
  /** Party id already resolved from the query (org number or personal number), if any. */
  partyId?: string;
  stakeholders?: string;
  /**
   * Errand parameters that also make an errand the stakeholder's: it is theirs when one of them holds their
   * account, as well as when it is assigned to them.
   */
  stakeholderParameterKeys?: readonly string[];
  priority?: string;
  category?: string;
  type?: string;
  labelCategory?: string;
  labelType?: string;
  labelSubType?: string;
  /** JSON-encoded generic label selections; resolved by the controller against profile + live metadata. */
  labelFilter?: string;
  channel?: string;
  status?: string;
  resolution?: string;
  start?: string;
  end?: string;
}

/**
 * The label resource paths the category, type and subtype filters ask for, of which an errand needs
 * any one: a selection that none of the levels above it reaches is dropped, and a selection gives way
 * to a selection beneath it.
 */
export const selectCategoryLeafPaths = ({ labelCategory, labelType, labelSubType }: ErrandFilterInput): string[] => {
  if (!labelCategory && !labelType && !labelSubType) return [];
  const reachablePaths = removeUnreachablePaths([labelCategory?.split(','), labelType?.split(','), labelSubType?.split(',')]);
  return [...findLeafComponents(reachablePaths)];
};

/** Wraps a comma-separated parameter into an `or` group, e.g. `HIGH,LOW` -> `(priority:'HIGH' or priority:'LOW')`. */
const orGroup = (field: string, csv: string): string =>
  `(${csv
    .split(',')
    .map(s => `${field}:'${s}'`)
    .join(' or ')})`;

/**
 * Builds the `&filter=...` query-string fragment for the SupportManagement errands endpoints.
 * Pure: any party-id lookup must be performed by the caller and passed in via `partyId`.
 */
export const buildErrandFilter = (input: ErrandFilterInput): string => {
  const { query: queryRaw, partyId, stakeholders, priority, category, type } = input;
  const { channel, status, resolution, start, end } = input;
  const filterList: string[] = [];

  if (queryRaw) {
    // sanitizeQuery already drops '+' (it is outside SAFE_CHARS_REGEX), and the clauses below are
    // *contains* matches - so a query of '+46701740635' searches for '46701740635', which still
    // matches a stored '+46701740635'. No separate phone-number normalisation is needed.
    const query = sanitizeQuery(queryRaw);

    let queryFilter = '(';
    queryFilter += `description~'*${query}*'`;
    queryFilter += ` or title~'*${query}*'`;
    queryFilter += ` or errandNumber~'*${query}*'`;
    queryFilter += ` or exists(stakeholders.firstName~'*${query}*')`;
    queryFilter += ` or exists(stakeholders.lastName~'*${query}*')`;
    queryFilter += ` or exists(stakeholders.address~'*${query}*')`;
    queryFilter += ` or exists(stakeholders.zipCode~'*${query}*')`;
    queryFilter += ` or exists(stakeholders.contactChannels.value~'*${query}*' and stakeholders.contactChannels.type~'${ContactChannelType.EMAIL}')`;
    queryFilter += ` or exists(stakeholders.contactChannels.value~'*${query}*' and stakeholders.contactChannels.type~'${ContactChannelType.PHONE}')`;
    queryFilter += ` or exists(stakeholders.organizationName~'*${query}*')`;
    queryFilter += ` or exists(stakeholders.externalId~'*${query}*')`;
    queryFilter += ` or exists(parameters.values~'*${query}*')`;
    if (partyId) {
      queryFilter += ` or exists(stakeholders.externalId~'*${sanitizeQuery(partyId)}*')`;
    }
    queryFilter += ')';
    filterList.push(queryFilter);
  }

  if (stakeholders) {
    // Key and value in one exists(...), so both have to match the same parameter.
    const parameterClauses = (input.stakeholderParameterKeys ?? [])
      .map(key => ` or exists(parameters.key:'${key}' and parameters.values:'${stakeholders}')`)
      .join('');
    filterList.push(`(assignedUserId:'${stakeholders}' or (assignedUserId is null and reporterUserId:'${stakeholders}' )${parameterClauses})`);
  }
  if (priority) {
    filterList.push(orGroup('priority', priority));
  }
  if (category) {
    filterList.push(orGroup('category', category));
  }
  if (type) {
    filterList.push(orGroup('type', type));
  }
  const categoryFilter = buildCategoryFilter(selectCategoryLeafPaths(input));
  if (categoryFilter) filterList.push(categoryFilter);
  if (channel) {
    filterList.push(`channel:'${channel}'`);
  }
  if (status) {
    filterList.push(orGroup('status', status));
  }
  if (resolution) {
    filterList.push(`resolution:'${resolution}'`);
  }
  if (start) {
    const s = toOffsetDateTime(dayjs(start).startOf('day'));
    filterList.push(`created>'${s}'`);
  }
  if (end) {
    const e = toOffsetDateTime(dayjs(end).endOf('day'));
    filterList.push(`created<'${e}'`);
  }

  return filterList.length > 0 ? `&filter=${filterList.join(' and ')}` : '';
};

/** What the handler is asked before a new errand exists. */
interface NewErrandRegistrationForm {
  /** The report types offered, by label resource path. The chosen one becomes the errand's label. */
  readonly reportTypes: readonly string[];
  /**
   * Whether the errand gets a place. It is the unit the handler is employed at in the organization
   * tree; a handler whose employment is not a place there picks among the places AccessMapper
   * configures for their account instead.
   */
  readonly location: boolean;
  /** Whether the handler picks the errand's priority instead of taking the default. */
  readonly priority: boolean;
}

export interface NewErrandDefaults {
  /** How the errand came in. */
  readonly channel: string;
  readonly parameters: readonly Pick<Parameter, 'key' | 'displayName' | 'values'>[];
  readonly form: NewErrandRegistrationForm;
}

/**
 * How an errand is registered in Draken: the unit manager says what happened and where, and the errand is
 * created from that. The report type is the errand's label - an errand is either a deviation or a reported
 * misconduct, never both.
 */
export const NEW_ERRAND_DEFAULTS: NewErrandDefaults = Object.freeze({
  channel: DRAKEN_REGISTRATION_CHANNEL,
  parameters: Object.freeze([Object.freeze({ key: 'eventType', displayName: 'Rapporttyp', values: ['AVVIKELSE'] })]),
  form: Object.freeze({
    reportTypes: Object.freeze(['REPORT_TYPE/DEVIATION', 'REPORT_TYPE/ABUSE']),
    location: true,
    // The handler is asked what and where only; every errand starts at Medel.
    priority: false,
  }),
});

/**
 * Structural shapes of the classification payload. The controller's class-validator DTOs satisfy
 * these, which keeps the validation classes in the controller without the service importing them.
 */
export interface ClassificationSpec {
  category: string;
  type: string;
}

export interface LabelIdReference {
  id: string;
}

export interface SupportErrandClassificationSelection {
  classification: ClassificationSpec;
  categoryLabels: LabelIdReference[];
}

/**
 * One resolvable path through the Support Management label tree.
 *
 * NOTE: the mapping to `classification` is deliberately shifted by one level, so the field
 * names do not line up with the metadata classification strings they carry:
 *
 *   configured owner node (`owner`)    -> classification.category
 *   configured category (`category`)   -> classification.type
 *   configured type nodes (`types`)    -> neither field; contribute selected label ids only
 *
 * When there is no configured owner ancestor, `classification.category` falls back to the
 * category node, so category and type then hold the same resource. This mapping is an invariant
 * of the fixed IAF/VOF investigation classification rule. The
 * frontend performs the same mapping and documents it at
 * `investigation/label-classification/iaf-supportmanagement-label-classification.ts`
 * ("Support Management persists the selected CATEGORY resource in classification.type").
 * Keep the two in step — they are two implementations of one rule.
 */
interface SupportErrandClassificationBinding {
  owner?: Label;
  category: Label;
  types: Label[];
}

interface SupportErrandClassificationMetadata {
  bindings: SupportErrandClassificationBinding[];
  managedLabels: Label[];
}

const normalizeLabelClassification = (classification: string | undefined): string => (classification ?? '').trim().replaceAll('_', '-').toUpperCase();

const normalizeLabelResource = normalizeSupportManagementResourcePath;

const isCategoryLabel = (
  label: NonNullable<Errand['labels']>[number],
  managedCategoryLabelIds: ReadonlySet<string>,
  managedRootResource: string | undefined,
): boolean => {
  const resourcePath = normalizeLabelResource(label.resourcePath);
  const rootResource = normalizeLabelResource(managedRootResource);
  return (
    (Boolean(rootResource) && (resourcePath === rootResource || resourcePath.startsWith(`${rootResource}/`))) ||
    (typeof label.id === 'string' && managedCategoryLabelIds.has(label.id))
  );
};

const getLabelResource = (label: Label): string =>
  typeof label.resourcePath === 'string' && label.resourcePath.trim().length > 0 ? label.resourcePath : label.resourceName;

const requireMetadataLabelResource = (label: Label): string => {
  if (typeof label.resourcePath === 'string' && label.resourcePath.trim().length > 0) return label.resourcePath;
  if (typeof label.resourceName === 'string' && label.resourceName.trim().length > 0) return label.resourceName;
  throw new HttpException(502, 'Support Management classification metadata contains a label without resource');
};

const findClassificationTypeLabels = (labels: readonly Label[] | undefined, labelTree: IafVofInvestigationClassificationLabelTree): Label[] => {
  const types: Label[] = [];

  const visit = (nodes: readonly Label[]) => {
    for (const node of nodes) {
      const classification = normalizeLabelClassification(node.classification);
      if (classification === normalizeLabelClassification(labelTree.typeClassification)) {
        types.push(node);
      } else if (classification !== normalizeLabelClassification(labelTree.categoryClassification) && node.labels?.length) {
        visit(node.labels);
      }
    }
  };

  visit(labels ?? []);
  return types;
};

const getSupportErrandClassificationMetadata = (
  labelStructure: readonly Label[],
  labelTree: IafVofInvestigationClassificationLabelTree,
): SupportErrandClassificationMetadata => {
  const bindings: SupportErrandClassificationBinding[] = [];

  const visit = (nodes: readonly Label[], owner?: Label) => {
    for (const node of nodes) {
      const classification = normalizeLabelClassification(node.classification);
      if (classification === normalizeLabelClassification(labelTree.categoryClassification)) {
        bindings.push({ owner, category: node, types: findClassificationTypeLabels(node.labels, labelTree) });
        continue;
      }

      const nextOwner = classification === normalizeLabelClassification(labelTree.ownerClassification) ? node : owner;
      if (node.labels?.length) visit(node.labels, nextOwner);
    }
  };

  const categoryRoots = labelStructure.filter(label => {
    const classification = normalizeLabelClassification(label.classification);
    return (
      classification === normalizeLabelClassification(labelTree.root.classification) &&
      normalizeLabelResource(getLabelResource(label)) === normalizeLabelResource(labelTree.root.resource)
    );
  });
  if (categoryRoots.length !== 1) {
    throw new HttpException(
      502,
      `Support Management classification metadata expected one configured root ${labelTree.root.resource}/${labelTree.root.classification}, found ${categoryRoots.length}`,
    );
  }
  const categoryRoot = categoryRoots[0];
  if (categoryRoot?.labels?.length) visit(categoryRoot.labels);
  if (bindings.length === 0) {
    throw new HttpException(
      502,
      `Support Management classification metadata contains no ${labelTree.categoryClassification} labels under the configured root`,
    );
  }
  const managedLabels: Label[] = [];
  const collectManagedLabels = (labels: readonly Label[]) => {
    for (const label of labels) {
      managedLabels.push(label);
      if (label.labels?.length) collectManagedLabels(label.labels);
    }
  };
  collectManagedLabels([categoryRoot]);

  return { bindings, managedLabels };
};

const requireMetadataLabelId = (label: Label): string => {
  if (typeof label.id === 'string' && label.id.length > 0) return label.id;
  throw new HttpException(502, 'Support Management classification metadata contains a label without id');
};

export interface ResolvedSupportErrandClassification {
  classification: ClassificationSpec;
  categoryLabels: LabelIdReference[];
  managedCategoryLabelIds: string[];
  managedRootResource: string;
}

const buildClassificationMetadataIds = (labels: readonly Label[]): Map<string, Label> => {
  const metadataIds = new Map<string, Label>();
  for (const label of labels) {
    const id = requireMetadataLabelId(label);
    if (metadataIds.has(id)) {
      throw new HttpException(502, 'Support Management classification metadata contains duplicate label ids');
    }
    metadataIds.set(id, label);
  }
  return metadataIds;
};

const bindingMatchesClassification = (binding: SupportErrandClassificationBinding, classification: ClassificationSpec): boolean => {
  const categoryLabel = binding.owner ?? binding.category;
  return (
    normalizeLabelResource(requireMetadataLabelResource(categoryLabel)) === normalizeLabelResource(classification.category) &&
    normalizeLabelResource(requireMetadataLabelResource(binding.category)) === normalizeLabelResource(classification.type)
  );
};

const requireMatchingClassificationBinding = (
  bindings: readonly SupportErrandClassificationBinding[],
  classification: ClassificationSpec,
): SupportErrandClassificationBinding => {
  for (const binding of bindings) {
    for (const label of [...(binding.owner ? [binding.owner] : []), binding.category, ...binding.types]) {
      requireMetadataLabelResource(label);
    }
  }

  const matches = bindings.filter(binding => bindingMatchesClassification(binding, classification));
  if (matches.length === 0) {
    throw new HttpException(400, 'Classification does not match the configured Support Management label tree');
  }
  if (matches.length > 1) {
    throw new HttpException(502, 'Support Management classification metadata contains an ambiguous configured category path');
  }
  return matches[0];
};

const resolveSubmittedClassificationLabelIds = (
  binding: SupportErrandClassificationBinding,
  categoryLabels: readonly LabelIdReference[],
): string[] => {
  const submittedIds = categoryLabels.map(label => label.id);
  const submittedIdSet = new Set(submittedIds);
  if (submittedIdSet.size !== submittedIds.length) {
    throw new HttpException(400, 'Classification label ids must be unique');
  }

  const ownerId = binding.owner ? requireMetadataLabelId(binding.owner) : undefined;
  const categoryId = requireMetadataLabelId(binding.category);
  const typeIds = binding.types.map(type => requireMetadataLabelId(type));
  const selectedTypeIds = typeIds.filter(id => submittedIdSet.has(id));
  const expectedSelectedTypeCount = typeIds.length > 0 ? 1 : 0;
  if (selectedTypeIds.length !== expectedSelectedTypeCount) {
    throw new HttpException(400, 'Classification must contain exactly one valid undercategory when required');
  }

  const expectedIds = [...(ownerId ? [ownerId] : []), categoryId, ...selectedTypeIds];
  if (submittedIds.length !== expectedIds.length || submittedIds.some(id => !expectedIds.includes(id))) {
    throw new HttpException(400, 'Classification label ids do not match the selected configured category path');
  }
  return expectedIds;
};

/**
 * Validates a submitted classification against the configured metadata tree and returns the canonical
 * resource names plus the exact label ids that path implies. Throws 400 for a payload that does not
 * match the tree, and 502 when the metadata itself is unusable.
 */
export const resolveSupportErrandClassification = (
  data: SupportErrandClassificationSelection,
  labelStructure: readonly Label[] | undefined,
  labelTree: IafVofInvestigationClassificationLabelTree,
): ResolvedSupportErrandClassification => {
  if (!labelStructure) {
    throw new HttpException(502, 'Support Management classification metadata is unavailable');
  }

  const { bindings, managedLabels } = getSupportErrandClassificationMetadata(labelStructure, labelTree);
  const metadataIds = buildClassificationMetadataIds(managedLabels);
  const binding = requireMatchingClassificationBinding(bindings, data.classification);
  const expectedIds = resolveSubmittedClassificationLabelIds(binding, data.categoryLabels);

  return {
    classification: {
      category: binding.owner ? requireMetadataLabelResource(binding.owner) : requireMetadataLabelResource(binding.category),
      type: requireMetadataLabelResource(binding.category),
    },
    categoryLabels: expectedIds.map(id => ({ id })),
    managedCategoryLabelIds: [...metadataIds.keys()],
    managedRootResource: labelTree.root.resource,
  };
};

/**
 * Builds the PATCH body for a classification change, keeping every label that the configured tree does
 * not own so unrelated labels survive the update.
 */
export const buildSupportErrandClassificationUpdateBody = (
  data: SupportErrandClassificationSelection,
  currentLabels: Errand['labels'],
  categoryLabels: readonly LabelIdReference[] = data.categoryLabels,
  classification: ClassificationSpec = data.classification,
  managedCategoryLabelIds: readonly string[] = categoryLabels.map(label => label.id),
  managedRootResource?: string,
): { classification: ClassificationSpec; labels: LabelIdReference[] } => {
  const managedCategoryLabelIdSet = new Set(managedCategoryLabelIds);
  const preservedLabelIds = (currentLabels ?? [])
    .filter(label => !isCategoryLabel(label, managedCategoryLabelIdSet, managedRootResource))
    .map(label => {
      if (typeof label.id !== 'string' || label.id.length === 0) {
        throw new HttpException(502, 'Support Management response contains an unrelated label without id');
      }

      return label.id;
    });
  const labelIds = [...preservedLabelIds, ...categoryLabels.map(label => label.id)];

  return {
    classification: {
      category: classification.category,
      type: classification.type,
    },
    labels: [...new Set(labelIds)].map(id => ({ id })),
  };
};

const STRONG_ERRAND_ETAG_PATTERN = /^"(0|[1-9]\d*)"$/u;

/**
 * Parses the required optimistic-locking precondition for every errand mutation.
 * Weak validators, wildcard validators, lists and non-canonical numeric values are rejected.
 */
export const requireStrongErrandVersion = (ifMatch: string | undefined): number => {
  if (ifMatch === undefined) {
    throw new HttpException(428, 'If-Match is required when updating a support errand');
  }

  const match = STRONG_ERRAND_ETAG_PATTERN.exec(ifMatch);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!match || !Number.isSafeInteger(version)) {
    throw new HttpException(400, 'If-Match must contain one strong numeric ETag');
  }

  return version;
};

/** Ensures the caller edited the same errand version that is current upstream. */
export const assertRequestedErrandVersion = (requestedVersion: number, currentVersion: number): void => {
  if (requestedVersion !== currentVersion) {
    throw new HttpException(412, 'If-Match does not match the current support errand version');
  }
};

/**
 * Reads the errand's optimistic locking version from the ETag header, falling back to the body.
 * Both are checked against each other so a stale or malformed version never reaches an If-Match.
 */
export const getErrandVersion = (errand: Errand, responseETag: unknown): number => {
  let responseVersion: number | undefined;
  if (responseETag !== undefined) {
    const match = typeof responseETag === 'string' ? STRONG_ERRAND_ETAG_PATTERN.exec(responseETag) : null;
    responseVersion = match ? Number(match[1]) : Number.NaN;
    if (!Number.isSafeInteger(responseVersion)) {
      throw new HttpException(502, 'Support Management response contains an invalid errand ETag');
    }
  }
  const bodyVersion = typeof errand.version === 'number' && Number.isSafeInteger(errand.version) && errand.version >= 0 ? errand.version : undefined;
  if (responseVersion !== undefined && bodyVersion !== undefined && responseVersion !== bodyVersion) {
    throw new HttpException(502, 'Support Management response contains inconsistent errand versions');
  }
  if (responseVersion !== undefined) {
    return responseVersion;
  }
  if (bodyVersion !== undefined) {
    return bodyVersion;
  }

  throw new HttpException(502, 'Support Management response is missing a valid errand version');
};

const LOCKED_SUPPORT_ERRAND_STATUSES = new Set(['SOLVED', 'SUSPENDED', 'ASSIGNED', 'REOPENED']);

/**
 * Assigning a handler is how an errand leaves the parked states, so only the terminal one
 * locks it. The UI offers "Ta ärende" regardless of status and follows it with a transition
 * to ONGOING; locking SUSPENDED/ASSIGNED/REOPENED here would strand those errands.
 */
const LOCKED_SUPPORT_ERRAND_ADMIN_STATUSES = new Set(['SOLVED']);

/** Mirrors the product's write lock at the backend boundary for all new command routes. */
export const assertSupportErrandWritable = (errand: Pick<Errand, 'status'>, operation: string): void => {
  if (LOCKED_SUPPORT_ERRAND_STATUSES.has(errand.status ?? '')) {
    throw new HttpException(409, `Support errand status does not allow ${operation}`);
  }
};

export const assertSupportErrandAdminAssignable = (errand: Pick<Errand, 'status'>, operation: string): void => {
  if (LOCKED_SUPPORT_ERRAND_ADMIN_STATUSES.has(errand.status ?? '')) {
    throw new HttpException(409, `Support errand status does not allow ${operation}`);
  }
};

export interface SupportErrandStatusTransitionCommand {
  expectedStatus: string;
  status: string;
  resolution?: string;
  suspension?: Suspension;
}

/** One move along the workflow, on the way to the phase that closes an errand. */
interface SupportErrandPhaseStep {
  activePhaseId: string;
  /** The status the phase requires, when the errand's status at that point is not one it allows. */
  status?: string;
}

export interface ResolvedSupportErrandStatusTransition {
  status: string;
  resolution?: string;
  suspension?: Suspension;
  /** The phase a closed errand moves into, when the phase it is in does not allow closing. */
  activePhaseId?: string;
  /**
   * The phases a closed errand passes through before that one, in order. Support Management only moves
   * an errand along its workflow's transitions, so closing from an earlier phase steps through each first.
   */
  phaseSteps?: SupportErrandPhaseStep[];
}

/**
 * Resolves a status command against the freshly read errand and namespace metadata.
 *
 * Support Management does not expose a status-transition graph. Requiring the exact current
 * status prevents a caller from applying a command whose source state has changed, while the
 * metadata check prevents arbitrary or deprecated target values without inventing app-specific
 * transition rules in Draken.
 */
export const resolveSupportErrandStatusTransition = (
  errand: Pick<Errand, 'status' | 'phases'>,
  statuses: readonly Pick<SupportManagementStatus, 'name' | 'deprecated'>[] | undefined,
  command: SupportErrandStatusTransitionCommand,
  phases?: readonly Phase[],
): ResolvedSupportErrandStatusTransition => {
  if (!errand.status) {
    throw new HttpException(502, 'Support Management response is missing the current errand status');
  }
  if (errand.status !== command.expectedStatus) {
    throw new HttpException(409, 'Support errand status has changed since it was loaded');
  }
  if (!statuses) {
    throw new HttpException(502, 'Support Management metadata is missing statuses');
  }
  if (!statuses.some(status => status.name === command.status && !status.deprecated)) {
    throw new HttpException(400, 'Target status is not available in Support Management metadata');
  }

  const closingSteps = resolveClosingPhaseSteps(errand, phases, command.status) ?? [];
  const activePhaseId = closingSteps.at(-1);
  // Every phase passed on the way leaves the errand in a status it allows, as a phase transition does.
  const phaseSteps: SupportErrandPhaseStep[] = [];
  let stepStatus = errand.status;
  for (const phaseId of closingSteps.slice(0, -1)) {
    const phase = phases?.find(candidate => candidate.id === phaseId);
    const status = phase ? resolvePhaseStatus(stepStatus, phase) : undefined;
    if (status) stepStatus = status;
    phaseSteps.push({ activePhaseId: phaseId, ...withStatus(status) });
  }

  return {
    status: command.status,
    ...(command.resolution !== undefined ? { resolution: command.resolution } : {}),
    ...(command.suspension !== undefined ? { suspension: command.suspension } : {}),
    ...(activePhaseId ? { activePhaseId } : {}),
    ...(phaseSteps.length > 0 ? { phaseSteps } : {}),
  };
};

export interface ResolvedSupportErrandPhaseTransition {
  /** Absent when the errand is entering the workflow rather than moving within it. */
  transitionId?: string;
  targetPhaseId: string;
  /**
   * The status the target phase requires, when the errand is not already in one it allows. A phase
   * declares `allowedStatuses`, so moving the phase without the status would leave the errand in a
   * state its own phase does not permit.
   */
  status?: string;
}

/**
 * The phase an errand is currently in.
 *
 * `activePhaseId` is write-only upstream: it is how a phase is *set*, and it never comes back on a
 * read. The readable side is the `phases` history, where the phase the errand has entered but not
 * left is the one it is in. Reading `activePhaseId` off a fetched errand always yields undefined,
 * which reads as "outside the workflow" for every errand there is.
 */
export const getActiveErrandPhaseId = (errand: Pick<Errand, 'phases'>): string | undefined => {
  const open = (errand.phases ?? []).filter(phase => phase.phaseId && !phase.ended);
  return open.length > 0 ? open[open.length - 1].phaseId : undefined;
};

export const CLOSED_SUPPORT_ERRAND_STATUS = 'SOLVED';

/**
 * The phase closing an errand moves it into, or undefined when closing needs no move.
 *
 * Closing is the handler's decision rather than a step in the workflow, so it is taken from any
 * phase: an errand closed in a phase that does not allow SOLVED moves into the phase that does -
 * Uppföljning (FOLLOW_UP) in the avvikelse workflow - stepping there along the workflow's transitions
 * (`resolveClosingPhaseSteps`). A namespace without phases, a phase that already allows closing and
 * every status other than SOLVED move nothing. Several phases allowing SOLVED is a choice Draken does
 * not guess at.
 */
export const resolveClosingPhaseId = (errand: Pick<Errand, 'phases'>, phases: readonly Phase[] | undefined, status: string): string | undefined => {
  if (status !== CLOSED_SUPPORT_ERRAND_STATUS) return undefined;
  const workflow = (phases ?? []).filter(phase => !phase.deprecated && phase.id);
  if (workflow.length === 0) return undefined;

  const activePhaseId = getActiveErrandPhaseId(errand);
  const activeAllowed = workflow.find(phase => phase.id === activePhaseId)?.allowedStatuses ?? [];
  if (activePhaseId && (activeAllowed.length === 0 || activeAllowed.includes(status))) return undefined;

  const closingPhases = workflow.filter(phase => phase.allowedStatuses?.includes(status));
  if (closingPhases.length !== 1) {
    throw new HttpException(409, 'Support Management metadata has no single phase that closes an errand');
  }
  return closingPhases[0].id;
};

/**
 * The phases a closed errand moves through to reach the phase that closes it, ending with that phase, or
 * undefined when closing needs no move.
 *
 * Support Management only moves an errand along its workflow's transitions and refuses a jump between
 * phases, so the path follows them - the shortest one from the active phase. An errand outside the
 * workflow enters its first phase and steps on from there. A closing phase the transitions do not reach
 * is refused rather than jumped to.
 */
export const resolveClosingPhaseSteps = (
  errand: Pick<Errand, 'phases'>,
  phases: readonly Phase[] | undefined,
  status: string,
): string[] | undefined => {
  const closingPhaseId = resolveClosingPhaseId(errand, phases, status);
  if (!closingPhaseId) return undefined;

  const workflow = (phases ?? []).filter(phase => !phase.deprecated && phase.id);
  const activePhaseId = getActiveErrandPhaseId(errand);
  const start = activePhaseId ?? findInitialSupportErrandPhase(phases)?.id;
  if (!start) throw new HttpException(409, 'Support Management metadata has no phase to start the workflow in');

  const cameFrom = new Map<string, string | undefined>([[start, undefined]]);
  const queue = [start];
  while (queue.length > 0 && !cameFrom.has(closingPhaseId)) {
    const phaseId = queue.shift() as string;
    for (const transition of workflow.find(phase => phase.id === phaseId)?.transitions ?? []) {
      const target = transition.targetPhaseId;
      if (transition.deprecated || !target || cameFrom.has(target) || !workflow.some(phase => phase.id === target)) continue;
      cameFrom.set(target, phaseId);
      queue.push(target);
    }
  }
  if (!cameFrom.has(closingPhaseId)) {
    throw new HttpException(409, 'The phase that closes the errand cannot be reached along the workflow from its active phase');
  }

  const path: string[] = [];
  for (let at: string | undefined = closingPhaseId; at && at !== start; at = cameFrom.get(at)) path.unshift(at);
  return activePhaseId ? path : [start, ...path];
};

/** The workflow's first phase: the lowest `phaseOrder`, with metadata order as the tie-break. */
export const findInitialSupportErrandPhase = (phases: readonly Phase[] | undefined): Phase | undefined =>
  (phases ?? [])
    .filter(phase => !phase.deprecated && phase.id)
    .reduce<Phase | undefined>((lowest, phase) => (!lowest || (phase.phaseOrder ?? 0) < (lowest.phaseOrder ?? 0) ? phase : lowest), undefined);

/**
 * The status a phase leaves the errand in.
 *
 * A phase that already allows the errand's current status changes nothing - the status is the
 * handler's to set within a phase. Otherwise the phase decides, because `allowedStatuses` makes the
 * two one state rather than two: an errand in `Beslut` whose status still says `INQUIRY` is in a
 * combination its own workflow does not have.
 */
export const resolvePhaseStatus = (currentStatus: string | undefined, phase: Phase): string | undefined => {
  const allowed = (phase.allowedStatuses ?? []).filter(status => typeof status === 'string' && status.trim());
  if (allowed.length === 0) return undefined;
  if (currentStatus && allowed.includes(currentStatus)) return undefined;
  return allowed[0];
};

/**
 * Resolves an explicit workflow transition against the current errand and fresh metadata.
 * Metadata order is never used as a decision; branched workflows must submit a transition id.
 *
 * An errand with no active phase is outside the workflow, and the only move available to it is in:
 * the first phase, with no transition to name because it is coming from nowhere. Without that, an
 * errand created without a phase could never join the workflow at all.
 */
export const resolveSupportErrandPhaseTransition = (
  errand: Errand,
  phases: readonly Phase[] | undefined,
  transitionId: string | undefined,
): ResolvedSupportErrandPhaseTransition => {
  assertSupportErrandWritable(errand, 'phase transitions');
  const activePhaseId = getActiveErrandPhaseId(errand);

  if (!activePhaseId) {
    const initialPhase = findInitialSupportErrandPhase(phases);
    if (!initialPhase?.id) {
      throw new HttpException(409, 'Support Management metadata has no phase to start the workflow in');
    }
    if (transitionId) {
      throw new HttpException(400, 'Support errand has no active phase, so no transition can be applied');
    }
    return { targetPhaseId: initialPhase.id, ...withStatus(resolvePhaseStatus(errand.status, initialPhase)) };
  }

  if (!transitionId) {
    throw new HttpException(400, 'A transition id is required to move an errand that is already in a phase');
  }

  const activePhase = phases?.find(phase => phase.id === activePhaseId && !phase.deprecated);
  if (!activePhase) {
    throw new HttpException(502, 'Support Management metadata is missing the active phase');
  }

  const transition = activePhase.transitions?.find(candidate => candidate.id === transitionId && !candidate.deprecated);
  if (!transition) {
    throw new HttpException(400, 'Phase transition is not available from the active phase');
  }

  const targetPhase = phases?.find(phase => phase.id === transition.targetPhaseId && !phase.deprecated);
  if (!targetPhase?.id) {
    throw new HttpException(502, 'Support Management metadata contains an invalid phase transition target');
  }

  return { transitionId, targetPhaseId: targetPhase.id, ...withStatus(resolvePhaseStatus(errand.status, targetPhase)) };
};

const withStatus = (status: string | undefined) => (status ? { status } : {});

// SupportManagement owns the optimistic locking `version` on errands and parameters: it is returned on
// reads but rejected with "must be null" when sent back on update. The frontend echoes fetched errands
// straight back, so strip the field from everything we forward.
type Versioned = { version?: number };

type VersionedErrand = Versioned & {
  parameters?: Versioned[];
  jsonParameters?: Versioned[];
  stakeholders?: { parameters?: Versioned[] }[];
};

const withoutVersion = <T extends Versioned>(item: T): Omit<T, 'version'> => {
  const { version: _version, ...itemWithoutVersion } = item;
  return itemWithoutVersion;
};

/** Removes the server-managed `version` from a list of errand, stakeholder or JSON parameters. */
export const stripParameterVersions = <T extends Versioned>(parameters: T[]): Omit<T, 'version'>[] => parameters.map(withoutVersion);

/** Removes the server-managed `version` from an errand and all parameters it carries. */
export const stripErrandVersions = <T extends VersionedErrand>(errand: T): T =>
  ({
    ...withoutVersion(errand),
    ...(errand.parameters && { parameters: stripParameterVersions(errand.parameters) }),
    ...(errand.jsonParameters && { jsonParameters: stripParameterVersions(errand.jsonParameters) }),
    ...(errand.stakeholders && {
      stakeholders: errand.stakeholders.map(stakeholder => ({
        ...stakeholder,
        ...(stakeholder.parameters && { parameters: stripParameterVersions(stakeholder.parameters) }),
      })),
    }),
  }) as T;
