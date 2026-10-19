import { Page, Route } from '@playwright/test';

/**
 * Översiktens sidomeny räknar alla statusgrupper i ett anrop och väntar sig ett antal per grupp, i
 * samma ordning som grupperna i `statusGroups`. Svaret byggs därför från anropet, så att fixturerna
 * inte behöver veta hur många grupper sidomenyn har.
 */
const statusGroupCountsFor = (requestUrl: string, count: number): { counts: number[] } => {
  const statusGroups: unknown = JSON.parse(new URL(requestUrl).searchParams.get('statusGroups') ?? '[]');
  return { counts: Array.isArray(statusGroups) ? statusGroups.map(() => count) : [] };
};

/** Svarar `count` för varje statusgrupp sidomenyn frågar efter. */
export const mockStatusGroupCounts = (page: Page, count: number) =>
  page.route('**/countsupporterrands/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(statusGroupCountsFor(route.request().url(), count)),
    })
  );
