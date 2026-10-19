import { create } from 'zustand';

interface ConfigState {
  isLoading: boolean;
  isCookieConsentOpen: boolean;
}

interface ConfigActions {
  setIsLoading: (isLoading: boolean) => void;
  setIsCookieConsentOpen: (isOpen: boolean) => void;
  reset: () => void;
}

type ConfigStore = ConfigState & ConfigActions;

const initialState: ConfigState = {
  isLoading: false,
  isCookieConsentOpen: true,
};

export const useConfigStore = create<ConfigStore>((set) => ({
  ...initialState,
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsCookieConsentOpen: (isCookieConsentOpen) => set({ isCookieConsentOpen }),
  reset: () => set(initialState),
}));
