export interface AppConfig {
  applicationName: string;
  /**
   * Relaterade rapporter shows example reports instead of the brukare's own, for a test environment where CaseStatus
   * cannot see the application's reports. Never on in production.
   */
  useRelatedReportsMock: boolean;
}

// JSON.parse prevents the minifier from folding placeholder comparisons at build time.
// This ensures entrypoint.sh can replace placeholders in the built files at runtime.
const envBool = (val: string | undefined): boolean => {
  try {
    return JSON.parse(val || 'false') === true;
  } catch {
    return false;
  }
};

export const appConfig: AppConfig = {
  applicationName: process.env.NEXT_PUBLIC_APPLICATION_NAME || 'appen',
  useRelatedReportsMock: envBool(process.env.NEXT_PUBLIC_USE_RELATED_REPORTS_MOCK),
};
