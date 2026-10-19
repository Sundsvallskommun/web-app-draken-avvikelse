import { create } from 'zustand';

interface BadgeState {
  notesCount: number;
  serviceNotesCount: number;
}

interface BadgeActions {
  setNotesCount: (count: number) => void;
  setServiceNotesCount: (count: number) => void;
  reset: () => void;
}

type BadgeStore = BadgeState & BadgeActions;

const initialState: BadgeState = {
  notesCount: 0,
  serviceNotesCount: 0,
};

export const useBadgeStore = create<BadgeStore>((set) => ({
  ...initialState,
  setNotesCount: (notesCount) => set({ notesCount }),
  setServiceNotesCount: (serviceNotesCount) => set({ serviceNotesCount }),
  reset: () => set(initialState),
}));
