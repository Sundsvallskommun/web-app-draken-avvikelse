import { persistedStoreKey } from '@common/utils/persisted-store-key';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PersistedState {
  filter: Record<string, string | boolean>;
  sort: Record<string, string | number>;
  attestationFilter: Record<string, string | boolean>;
  selectedErrandStatuses: string[];
  sidebarLabel: string;
  /** Whether the overview's filter checkbox, where the investigation offers one, is checked. Checked until unchecked. */
  overviewFilterToggleChecked: boolean;
}

interface UiState extends PersistedState {
  newErrands: number | null;
  ongoingErrands: number | null;
  assignedErrands: number | null;
  closedErrands: number | null;
}

interface UiActions {
  setFilter: (filter: Record<string, string | boolean>) => void;
  setSort: (sort: Record<string, string | number>) => void;
  setAttestationFilter: (filter: Record<string, string | boolean>) => void;

  setSelectedErrandStatuses: (statuses: string[]) => void;
  setSidebarLabel: (label: string) => void;
  setOverviewFilterToggleChecked: (checked: boolean) => void;
  setNewErrands: (count: number | null) => void;
  setOngoingErrands: (count: number | null) => void;
  setAssignedErrands: (count: number | null) => void;
  setClosedErrands: (count: number | null) => void;
}

type UiSettingsStore = UiState & UiActions;

const initialState: UiState = {
  filter: {},
  sort: {},
  attestationFilter: {},

  selectedErrandStatuses: ['NEW'],
  sidebarLabel: 'Nya ärenden',
  overviewFilterToggleChecked: true,
  newErrands: 0,
  ongoingErrands: 0,
  assignedErrands: 0,
  closedErrands: 0,
};

export const useUiSettingsStore = create(
  persist<UiSettingsStore>(
    (set) => ({
      ...initialState,

      setFilter: (filter) => set({ filter }),
      setSort: (sort) => set({ sort }),
      setAttestationFilter: (attestationFilter) => set({ attestationFilter }),

      setSelectedErrandStatuses: (selectedErrandStatuses) => set({ selectedErrandStatuses }),
      setSidebarLabel: (sidebarLabel) => set({ sidebarLabel }),
      setOverviewFilterToggleChecked: (overviewFilterToggleChecked) => set({ overviewFilterToggleChecked }),
      setNewErrands: (newErrands) => set({ newErrands }),
      setOngoingErrands: (ongoingErrands) => set({ ongoingErrands }),
      setAssignedErrands: (assignedErrands) => set({ assignedErrands }),
      setClosedErrands: (closedErrands) => set({ closedErrands }),
    }),
    {
      name: persistedStoreKey('ui-settings'),
      partialize: (state) =>
        ({
          filter: state.filter,
          sort: state.sort,
          attestationFilter: state.attestationFilter,
          selectedErrandStatuses: state.selectedErrandStatuses,
          sidebarLabel: state.sidebarLabel,
          overviewFilterToggleChecked: state.overviewFilterToggleChecked,
        } as UiSettingsStore),
    }
  )
);
