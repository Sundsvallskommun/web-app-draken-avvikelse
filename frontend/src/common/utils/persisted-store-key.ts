const deploymentKeyPrefix = (): string => `${process.env.NEXT_PUBLIC_BASEPATH || 'app'}-`;

/**
 * The key something this deployment keeps in the browser is saved under. Two deployments may share an origin under
 * different base paths, so the base path keeps their keys apart - and lets logging out clear this deployment's alone.
 */
export const deploymentStorageKey = (name: string): string => `${deploymentKeyPrefix()}${name}`;

/** Whether a key in the browser's storage is one this deployment saved. */
export const isDeploymentStorageKey = (key: string): boolean => key.startsWith(deploymentKeyPrefix());

/** The key a persisted store is saved under in the browser. */
export const persistedStoreKey = (storeName: string): string => deploymentStorageKey(storeName);

/**
 * The stores that outlive logging out, by name. The color scheme belongs to the device rather than to whoever signed
 * in; everything else this deployment keeps goes with the user.
 */
export const STORES_KEPT_ON_LOGOUT = {
  colorScheme: 'color-scheme',
} as const;
