import { create } from 'zustand';

/**
 * A part of the errand that keeps its own draft and is saved with Spara ärende in the sidebar - an
 * investigation document, say. The part validates and saves itself, and says why when it cannot;
 * the sidebar only asks it to.
 */
export interface ErrandSaveParticipant {
  /** What the handler calls the part, for the message when it could not be saved. */
  readonly label: string;
  /** Saves the part's draft and answers whether it was saved. */
  readonly save: () => Promise<boolean>;
  /** Brings the part into view, so the handler sees why its save failed. */
  readonly reveal: () => void;
}

interface ErrandSaveParticipantsState {
  participants: Readonly<Record<string, ErrandSaveParticipant>>;
  dirty: Readonly<Record<string, boolean>>;
  register: (id: string, participant: ErrandSaveParticipant) => void;
  unregister: (id: string) => void;
  setDirty: (id: string, dirty: boolean) => void;
}

export const useErrandSaveParticipantsStore = create<ErrandSaveParticipantsState>((set) => ({
  participants: {},
  dirty: {},
  register: (id, participant) => set((state) => ({ participants: { ...state.participants, [id]: participant } })),
  unregister: (id) =>
    set((state) => {
      const { [id]: _participant, ...participants } = state.participants;
      const { [id]: _dirty, ...dirty } = state.dirty;
      return { participants, dirty };
    }),
  setDirty: (id, dirty) =>
    set((state) => (state.dirty[id] === dirty ? state : { dirty: { ...state.dirty, [id]: dirty } })),
}));

/** Whether any part of the errand holds a draft that Spara ärende would save. */
export const selectHasDirtyParticipant = (state: Pick<ErrandSaveParticipantsState, 'dirty'>): boolean =>
  Object.values(state.dirty).some(Boolean);

/** The parts that hold a draft, in the order they joined. */
export const selectDirtyParticipants = (
  state: Pick<ErrandSaveParticipantsState, 'participants' | 'dirty'>
): ErrandSaveParticipant[] =>
  Object.entries(state.participants)
    .filter(([id]) => state.dirty[id])
    .map(([, participant]) => participant);

/** What the handler is told when parts could not be saved; each part shows why in its own place. */
export const unsavedParticipantsMessage = (unsaved: readonly Pick<ErrandSaveParticipant, 'label'>[]): string => {
  const labels = unsaved.map(({ label }) => label);
  const named = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} och ${labels[labels.length - 1]}` : labels[0];
  return `${named} kunde inte sparas. Orsaken visas där.`;
};

/**
 * Saves the parts one at a time - a write moves the errand's version, which the next one may be
 * conditioned on - and all of them even when one fails, since a failure in one part is no reason to
 * leave another's draft unsaved. Answers the parts that were not saved.
 */
export async function saveParticipantsInTurn(
  participants: readonly ErrandSaveParticipant[]
): Promise<ErrandSaveParticipant[]> {
  const unsaved: ErrandSaveParticipant[] = [];
  for (const participant of participants) {
    const saved = await participant.save().catch(() => false);
    if (!saved) unsaved.push(participant);
  }
  return unsaved;
}
