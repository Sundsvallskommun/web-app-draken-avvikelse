import type { Page, Route } from '@playwright/test';

import { mockAdmins, mockNoAdmins } from '../fixtures/mockAdmins';
import { mockMe } from '../fixtures/mockMe';
import { expect, test } from '../fixtures/base.fixture';
import { mockStatusGroupCounts } from '../utils/status-group-counts';
import { defaultInvestigationProfile, errandNumber, installIafApiMock } from './fixtures/investigation-flow.mock';

/**
 * Notiser i användarmenyn: användaren väljer själv om notiserna också ska komma med e-post eller SMS.
 * Valet lagras på användarens prenumerant i Support Management; notiserna i Draken går inte att välja bort.
 */
const emptyErrandPage = {
  content: [],
  pageable: { pageNumber: 0, pageSize: 12, offset: 0, paged: true, unpaged: false },
  totalPages: 0,
  totalElements: 0,
  size: 12,
  number: 0,
  first: true,
  last: true,
  numberOfElements: 0,
  empty: true,
};

const jsonRoute = (page: Page, pattern: string | RegExp, body: unknown) =>
  page.route(pattern, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

interface SubscriberTrace {
  reads: number;
  updates: unknown[];
}

/** The user's own subscriber, answering with the channels it was last given. */
async function installSubscriber(
  page: Page,
  { channels = ['INTERNAL'], readStatus = 200 }: { channels?: string[]; readStatus?: number } = {}
): Promise<SubscriberTrace> {
  const trace: SubscriberTrace = { reads: 0, updates: [] };
  let stored = channels.map((type) => ({ type }));

  await page.route('**/supportsubscribers/me', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { channels: { type: string }[] };
      trace.updates.push(body);
      stored = body.channels;
    } else {
      trace.reads += 1;
      if (readStatus !== 200) {
        await route.fulfill({ status: readStatus, contentType: 'application/json', body: '{}' });
        return;
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'subscriber-1', channels: stored }),
    });
  });
  return trace;
}

async function installOverview(page: Page) {
  await page.context().addCookies([{ name: 'connect.sid', value: 'test-session', domain: 'localhost', path: '/' }]);
  await jsonRoute(page, '**/administrators', mockAdmins);
  await jsonRoute(page, '**/me', mockMe);
  await jsonRoute(page, '**/users/admins', mockNoAdmins);
  await jsonRoute(page, '**/supportnotifications', []);
  await jsonRoute(page, '**/supportmanagement/investigation-profile', defaultInvestigationProfile());
  await mockStatusGroupCounts(page, 0);
  await jsonRoute(page, '**/supportmetadata', {
    categories: [],
    types: [],
    statuses: [{ name: 'NEW', displayName: 'Ny' }],
    labels: { labelStructure: [] },
  });
  await jsonRoute(page, /\/supporterrands\?/, emptyErrandPage);
}

const modal = (page: Page) => page.locator('[data-cy="notification-settings-modal"]');
const channel = (page: Page, name: 'email' | 'sms') => page.locator(`[data-cy="notification-settings-${name}"]`);
const save = (page: Page) => page.locator('[data-cy="notification-settings-save"]');

async function openNotificationSettings(page: Page, menu: string) {
  await page.locator(`${menu} .sk-usermenu-button`).click();
  // The errand page draws the menu twice, for wide and narrow screens; the entry is the one in the menu that was opened.
  await page.locator(`${menu} [data-cy="notification-settings-button"]`).click();
  await expect(modal(page)).toBeVisible();
}

async function openFromOverview(page: Page, dismissCookieConsent: () => Promise<void>) {
  await page.goto('oversikt/');
  await dismissCookieConsent();
  await openNotificationSettings(page, '[data-cy="avatar-aside"]');
}

test.describe('Notiser i användarmenyn', () => {
  test('visar det som är valt i Support Management och sparar ett nytt val', async ({ page, dismissCookieConsent }) => {
    await installOverview(page);
    const trace = await installSubscriber(page, { channels: ['INTERNAL', 'EMAIL'] });
    await openFromOverview(page, dismissCookieConsent);

    await expect(modal(page)).toContainText('Du får alltid notiser i Draken.');
    await expect(channel(page, 'email')).toBeChecked();
    await expect(channel(page, 'sms')).not.toBeChecked();
    // Nothing to save until something is changed.
    await expect(save(page)).toBeDisabled();

    await channel(page, 'sms').check({ force: true });
    await save(page).click();

    await expect(modal(page)).toBeHidden();
    expect(trace.updates).toEqual([{ channels: [{ type: 'INTERNAL' }, { type: 'EMAIL' }, { type: 'SMS' }] }]);

    // The next opening reads the choice again, and shows what was saved. Dev mode mounts twice under StrictMode,
    // so the reads are not counted exactly; that the opening made more of them is.
    const readsBeforeReopening = trace.reads;
    await openNotificationSettings(page, '[data-cy="avatar-aside"]');
    await expect(channel(page, 'sms')).toBeChecked();
    expect(trace.reads).toBeGreaterThan(readsBeforeReopening);
  });

  test('låter notiserna i Draken vara kvar när både e-post och SMS väljs bort', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installOverview(page);
    const trace = await installSubscriber(page, { channels: ['INTERNAL', 'EMAIL', 'SMS'] });
    await openFromOverview(page, dismissCookieConsent);

    await channel(page, 'email').uncheck({ force: true });
    await channel(page, 'sms').uncheck({ force: true });
    await save(page).click();

    await expect(modal(page)).toBeHidden();
    expect(trace.updates).toEqual([{ channels: [{ type: 'INTERNAL' }] }]);
  });

  test('sparar inget när dialogen avbryts', async ({ page, dismissCookieConsent }) => {
    await installOverview(page);
    const trace = await installSubscriber(page);
    await openFromOverview(page, dismissCookieConsent);

    await channel(page, 'email').check({ force: true });
    await modal(page).getByRole('button', { name: 'Avbryt' }).click();

    await expect(modal(page)).toBeHidden();
    expect(trace.updates).toEqual([]);
  });

  test('säger till när inställningarna inte går att hämta', async ({ page, dismissCookieConsent }) => {
    await installOverview(page);
    await installSubscriber(page, { readStatus: 500 });
    await openFromOverview(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="notification-settings-error"]')).toBeVisible();
    await expect(channel(page, 'email')).toHaveCount(0);
    await expect(save(page)).toBeDisabled();
  });

  test('finns också i användarmenyn på ärendesidan', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, { documents: {}, activePhaseName: 'INVESTIGATION', errandStatus: 'INQUIRY' });
    const trace = await installSubscriber(page, { channels: ['INTERNAL', 'SMS'] });

    await page.goto(`arende/${errandNumber}`);
    await dismissCookieConsent();
    await expect(page.getByRole('tab', { name: 'Grundinformation', exact: true })).toBeVisible();
    await openNotificationSettings(page, '[data-cy="usermenu"]');

    await expect(channel(page, 'sms')).toBeChecked();
    await channel(page, 'email').check({ force: true });
    await save(page).click();

    await expect(modal(page)).toBeHidden();
    expect(trace.updates).toEqual([{ channels: [{ type: 'INTERNAL' }, { type: 'EMAIL' }, { type: 'SMS' }] }]);
  });
});
