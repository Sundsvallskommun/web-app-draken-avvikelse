import type { Locator, Page } from '@playwright/test';

/**
 * A toast by its message. The snackbar renders the message twice, once visually and once for screen readers, so
 * the visible element is the one named. The newest one is taken: an action repeated while its earlier toast is still
 * on screen shows the same message twice, and the latest is the one the action under test produced.
 */
export const toast = (page: Page, message: string): Locator =>
  page.locator('.sk-snackbar-text').filter({ hasText: message }).last();
