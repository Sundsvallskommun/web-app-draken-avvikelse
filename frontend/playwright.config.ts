import { defineConfig, devices } from '@playwright/test';

const baseURL = `http://${process.env.DOMAIN_NAME || 'localhost'}:${process.env.PORT || '3000'}${
  process.env.NEXT_PUBLIC_BASEPATH || ''
}/`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Tests mock all network and are wait-bound, so they parallelize safely even
  // past the core count. '50%' on a 2-vCPU CI runner meant 1 worker (fully
  // serial) — a fixed pool is several times faster.
  workers: process.env.CI ? 4 : 4,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 1024 },
    bypassCSP: true,
    // Draken shows dates and times in the user's own time, and its users are in Sweden. The specs are written in
    // Swedish time, so the browser runs in it wherever the suite runs - a CI runner is in UTC.
    timezoneId: 'Europe/Stockholm',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.003,
    },
  },
  projects: [
    {
      name: 'avvikelse',
      testDir: './e2e/avvikelse',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'schema-lab',
      testDir: './e2e/schema-lab',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer config — start the dev server manually before running tests:
  //   yarn dev   (then yarn test:e2e or yarn test:e2e:schema-lab in another terminal)
});
