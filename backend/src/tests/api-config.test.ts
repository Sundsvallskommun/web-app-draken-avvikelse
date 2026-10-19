import {
  APIS,
  apiServiceName,
  hasSupportManagementErrandSearch,
  resolveSupportManagementApiTarget,
  resolveSupportManagementErrandSearch,
} from '@/config/api-config';

const configuredVersions = new Map(APIS.map(({ name, version }) => [name, version]));

describe('apiServiceName', () => {
  const originalTarget = process.env.SUPPORTMANAGEMENT_API_TARGET;

  afterEach(() => {
    if (originalTarget === undefined) {
      delete process.env.SUPPORTMANAGEMENT_API_TARGET;
    } else {
      process.env.SUPPORTMANAGEMENT_API_TARGET = originalTarget;
    }
  });

  it('keeps every application on the stable Support Management API by default', () => {
    delete process.env.SUPPORTMANAGEMENT_API_TARGET;

    expect(resolveSupportManagementApiTarget()).toBe('stable');
    expect(apiServiceName('supportmanagement')).toBe(`supportmanagement/${configuredVersions.get('supportmanagement')}`);
  });

  it('routes only deployments that explicitly opt in through the sprint API', () => {
    process.env.SUPPORTMANAGEMENT_API_TARGET = 'sprint';

    expect(resolveSupportManagementApiTarget()).toBe('sprint');
    expect(apiServiceName('supportmanagement')).toBe(`supportmanagement-sprint/${configuredVersions.get('supportmanagement-sprint')}`);
  });

  it('rejects misspelled targets instead of silently changing the upstream contract', () => {
    process.env.SUPPORTMANAGEMENT_API_TARGET = 'latest';

    expect(() => resolveSupportManagementApiTarget()).toThrow('Unsupported SUPPORTMANAGEMENT_API_TARGET "latest". Expected one of: stable, sprint');
  });

  it('keeps regular configured and unknown service names unchanged', () => {
    expect(apiServiceName('citizen')).toBe(`citizen/${configuredVersions.get('citizen')}`);
    expect(apiServiceName('unknown-service')).toBe('unknown-service');
  });
});

describe('hasSupportManagementErrandSearch', () => {
  it('finds the search index, and the count that groups by status, on the sprint target alone', () => {
    expect(hasSupportManagementErrandSearch('sprint')).toBe(true);
    expect(hasSupportManagementErrandSearch('stable')).toBe(false);
  });
});

describe('resolveSupportManagementErrandSearch', () => {
  it('stays on the filter endpoints unless the deployment asks for the search index', () => {
    expect(resolveSupportManagementErrandSearch(undefined, 'sprint')).toBe(false);
    expect(resolveSupportManagementErrandSearch('', 'sprint')).toBe(false);
    expect(resolveSupportManagementErrandSearch('false', 'sprint')).toBe(false);
  });

  it('searches the index when the sprint deployment asks for it', () => {
    expect(resolveSupportManagementErrandSearch('true', 'sprint')).toBe(true);
    expect(resolveSupportManagementErrandSearch(' TRUE ', 'sprint')).toBe(true);
  });

  it.each(['stable'] as const)('refuses the search index on the %s target, which has none', target => {
    expect(() => resolveSupportManagementErrandSearch('true', target)).toThrow(
      `SUPPORTMANAGEMENT_ERRAND_SEARCH requires SUPPORTMANAGEMENT_API_TARGET sprint, not "${target}"`,
    );
    expect(resolveSupportManagementErrandSearch('false', target)).toBe(false);
  });

  it('rejects a value that is neither true nor false instead of guessing', () => {
    expect(() => resolveSupportManagementErrandSearch('yes', 'sprint')).toThrow(
      'Unsupported SUPPORTMANAGEMENT_ERRAND_SEARCH "yes". Expected true or false',
    );
  });
});
