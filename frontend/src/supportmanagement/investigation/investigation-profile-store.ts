import { create } from 'zustand';

import type { InvestigationProfile } from './investigation-profile';

export type InvestigationProfileStatus = 'idle' | 'loading' | 'ready' | 'error' | 'disabled';

interface InvestigationProfileState {
  status: InvestigationProfileStatus;
  profile: InvestigationProfile | null;
  /**
   * jsonParameter keys a variant UI is currently rendering. Ärendeuppgifter skips these so the same
   * document is not shown twice - it needs no knowledge of which variant put them here.
   */
  handledJsonParameterKeys: Readonly<Record<string, boolean>>;
  startLoading: () => void;
  setProfile: (profile: InvestigationProfile) => void;
  setError: () => void;
  setDisabled: () => void;
  setJsonParameterHandled: (key: string, handled: boolean) => void;
  reset: () => void;
}

const initialState: Pick<InvestigationProfileState, 'profile' | 'status'> = {
  status: 'idle',
  profile: null,
};

export const useInvestigationProfileStore = create<InvestigationProfileState>((set) => ({
  ...initialState,
  handledJsonParameterKeys: {},
  startLoading: () => set({ status: 'loading', profile: null, handledJsonParameterKeys: {} }),
  setProfile: (profile) => set({ status: 'ready', profile, handledJsonParameterKeys: {} }),
  setError: () => set({ status: 'error', profile: null, handledJsonParameterKeys: {} }),
  setDisabled: () => set({ status: 'disabled', profile: null, handledJsonParameterKeys: {} }),
  setJsonParameterHandled: (key, handled) =>
    set((state) =>
      state.handledJsonParameterKeys[key] === handled
        ? state
        : { handledJsonParameterKeys: { ...state.handledJsonParameterKeys, [key]: handled } }
    ),
  reset: () => set({ ...initialState, handledJsonParameterKeys: {} }),
}));
