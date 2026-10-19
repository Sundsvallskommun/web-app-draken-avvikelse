import { persistedStoreKey, STORES_KEPT_ON_LOGOUT } from '@common/utils/persisted-store-key';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ColorSchemeStore {
  colorScheme: string;
  setColorScheme: (colorScheme: string) => void;
}

/**
 * The color scheme chosen in the user menu. It belongs to the device rather than to whoever signed in, so it has a
 * store of its own that logging out leaves in place, apart from the UI settings that go with the user.
 */
export const useColorSchemeStore = create(
  persist<ColorSchemeStore>(
    (set) => ({
      colorScheme: 'system',
      setColorScheme: (colorScheme) => set({ colorScheme }),
    }),
    {
      name: persistedStoreKey(STORES_KEPT_ON_LOGOUT.colorScheme),
    }
  )
);
