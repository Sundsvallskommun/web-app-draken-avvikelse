/**
 * The key a persisted store is saved under in the browser. Two deployments may share an origin under
 * different base paths, so the base path keeps their stores apart.
 */
export const persistedStoreKey = (storeName: string): string =>
  `${process.env.NEXT_PUBLIC_BASEPATH || 'app'}-${storeName}`;
