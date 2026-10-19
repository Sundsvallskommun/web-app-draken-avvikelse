import { test as base, Route } from '@playwright/test';
import { mockInvestigationProfile } from './mock-investigation-profile';

type BaseFixtures = {
  dismissCookieConsent: () => Promise<void>;
  waitForFonts: () => Promise<void>;
  investigationProfileRoute: void;
};

export const test = base.extend<BaseFixtures>({
  // Registered before the test body, so a spec that routes the endpoint itself still wins:
  // Playwright runs the most recently registered handler first.
  investigationProfileRoute: [
    async ({ page }, use) => {
      await page.route('**/supportmanagement/investigation-profile', async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockInvestigationProfile()),
        });
      });
      await use();
    },
    { auto: true },
  ],

  dismissCookieConsent: async ({ page }, use) => {
    const dismiss = async () => {
      const btn = page.locator('.sk-cookie-consent-btn-wrapper').getByText('Godkänn alla');
      await btn.click();
    };
    await use(dismiss);
  },

  waitForFonts: async ({ page }, use) => {
    const waitFn = async () => {
      await page.evaluate(() => document.fonts.ready);
    };
    await use(waitFn);
  },
});

export { expect } from '@playwright/test';
