//Subscribed APIS as lowercased
export const APIS = [
  {
    name: 'access-mapper',
    version: '2.2',
  },
  {
    name: 'activedirectory',
    version: '2.0',
  },
  {
    name: 'citizen',
    version: '3.0',
  },
  {
    name: 'employee',
    version: '2.0',
  },
  {
    name: 'templating',
    version: '2.1',
  },
  {
    name: 'supportmanagement',
    version: '15.2',
    // Runtime transport target only. The Support Management contract is generated
    // from the sprint API below, which phases, measures and errand access are built
    // against; the sprint API extends this one.
    generateDataContract: false,
  },
  {
    name: 'supportmanagement-sprint',
    version: '17.1',
    // Generated as the one Support Management contract application code imports,
    // so the domain keeps a single TypeScript owner.
    dataContractName: 'supportmanagement',
  },
  {
    name: 'legalentity',
    version: '2.0',
  },
  {
    name: 'relations',
    version: '1.1',
  },
  {
    name: 'casestatus',
    version: '4.3',
  },
  {
    name: 'party',
    version: '2.1',
  },
  {
    name: 'jsonschema',
    version: '1.0',
  },
];

export const SUPPORT_MANAGEMENT_API_TARGETS = ['stable', 'sprint'] as const;

export type SupportManagementApiTarget = (typeof SUPPORT_MANAGEMENT_API_TARGETS)[number];

const SUPPORT_MANAGEMENT_SERVICE_BY_TARGET: Readonly<Record<SupportManagementApiTarget, string>> = {
  stable: 'supportmanagement',
  sprint: 'supportmanagement-sprint',
};

export const resolveSupportManagementApiTarget = (configuredTarget = process.env.SUPPORTMANAGEMENT_API_TARGET): SupportManagementApiTarget => {
  const target = configuredTarget?.trim().toLowerCase() || 'stable';
  if ((SUPPORT_MANAGEMENT_API_TARGETS as readonly string[]).includes(target)) {
    return target as SupportManagementApiTarget;
  }

  throw new Error(`Unsupported SUPPORTMANAGEMENT_API_TARGET "${configuredTarget}". Expected one of: ${SUPPORT_MANAGEMENT_API_TARGETS.join(', ')}`);
};

/** The targets whose Support Management contract has the errand search index (sprint 17.0 and later). */
const SUPPORT_MANAGEMENT_TARGETS_WITH_ERRAND_SEARCH: readonly SupportManagementApiTarget[] = ['sprint'];

/**
 * Whether the target's Support Management has the errand search index. Its count is the one that divides over a
 * column (`groupBy`), so the overview's status counts ask it wherever it exists; the filter endpoint's count has no
 * grouping and answers one status group per request.
 */
export const hasSupportManagementErrandSearch = (target: SupportManagementApiTarget = resolveSupportManagementApiTarget()): boolean =>
  SUPPORT_MANAGEMENT_TARGETS_WITH_ERRAND_SEARCH.includes(target);

/**
 * Whether errand lists are answered by Support Management's search index instead of its filter
 * endpoint. Off unless a deployment asks for it, because the index of a namespace has to be rebuilt
 * before it holds the errands created ahead of it. Asking for it on a target without the index stops
 * the backend at startup rather than failing every overview. The status counts ask the index
 * regardless, see `hasSupportManagementErrandSearch`.
 */
export const resolveSupportManagementErrandSearch = (
  configuredValue = process.env.SUPPORTMANAGEMENT_ERRAND_SEARCH,
  target: SupportManagementApiTarget = resolveSupportManagementApiTarget(),
): boolean => {
  const value = configuredValue?.trim().toLowerCase() || 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error(`Unsupported SUPPORTMANAGEMENT_ERRAND_SEARCH "${configuredValue}". Expected true or false`);
  }
  if (value === 'false') return false;
  if (!hasSupportManagementErrandSearch(target)) {
    throw new Error(
      `SUPPORTMANAGEMENT_ERRAND_SEARCH requires SUPPORTMANAGEMENT_API_TARGET ${SUPPORT_MANAGEMENT_TARGETS_WITH_ERRAND_SEARCH.join(' or ')}, not "${target}"`,
    );
  }
  return true;
};

export function apiServiceName(name: string): string {
  const resolvedName = name === 'supportmanagement' ? SUPPORT_MANAGEMENT_SERVICE_BY_TARGET[resolveSupportManagementApiTarget()] : name;
  const api = APIS.find(a => a.name === resolvedName);
  return api ? `${api.name}/${api.version}` : name;
}
