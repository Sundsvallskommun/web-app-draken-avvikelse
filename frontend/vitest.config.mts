import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolves the @common/* / @supportmanagement/* aliases straight from
    // tsconfig.json, which sets `baseUrl`. The backend needs an explicit alias table only
    // because its tsconfig has none — do not copy that pattern here.
    tsconfigPaths: true,
  },
  test: {
    // Pure suites use node; component/hook suites opt into jsdom with a file directive.
    environment: 'node',
    // Assertions use node:assert/strict and `test` is imported explicitly, so no globals
    // are injected.
    globals: false,
    // Draken shows dates in the user's own time, and its users are in Sweden. The suites are written in
    // Swedish time, so they run in it wherever they run - a CI runner is in UTC.
    env: { TZ: 'Europe/Stockholm' },
    maxWorkers: 1,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/data-contracts/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
});
