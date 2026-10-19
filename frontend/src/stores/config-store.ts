import { create } from 'zustand';

interface ConfigState {
  municipalityId: string;
  isLoading: boolean;
  isCookieConsentOpen: boolean;
}

interface ConfigActions {
  setMunicipalityId: (municipalityId: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsCookieConsentOpen: (isOpen: boolean) => void;
  reset: () => void;
}

type ConfigStore = ConfigState & ConfigActions;

const initialState: ConfigState = {
  municipalityId: '',
  isLoading: false,
  isCookieConsentOpen: true,
};

export const useConfigStore = create<ConfigStore>((set) => ({
  ...initialState,
  setMunicipalityId: (municipalityId) => set({ municipalityId }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsCookieConsentOpen: (isCookieConsentOpen) => set({ isCookieConsentOpen }),
  reset: () => set(initialState),
}));
