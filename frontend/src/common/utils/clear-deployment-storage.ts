import { isDeploymentStorageKey, persistedStoreKey, STORES_KEPT_ON_LOGOUT } from './persisted-store-key';

type KeyedStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>;

/** Every key in the storage this deployment saved, read in full before anything is removed. */
const deploymentKeys = (storage: KeyedStorage): string[] =>
  Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
    (key): key is string => key !== null && isDeploymentStorageKey(key)
  );

/**
 * Clears what this deployment keeps in the browser for whoever was signed in. Two deployments may share an origin,
 * so only this deployment's keys go - another deployment's, and anything else on the origin, stay - and the stores
 * kept on logout stay too.
 */
export const clearDeploymentStorageOnLogout = (storages: readonly KeyedStorage[]): void => {
  const keptKeys = Object.values(STORES_KEPT_ON_LOGOUT).map(persistedStoreKey);
  for (const storage of storages) {
    deploymentKeys(storage)
      .filter((key) => !keptKeys.includes(key))
      .forEach((key) => storage.removeItem(key));
  }
};
