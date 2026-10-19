'use client';

import { useEffect, useRef } from 'react';

import { type ErrandSaveParticipant, useErrandSaveParticipantsStore } from './errand-save-participants';

/**
 * Takes part in Spara ärende for as long as the component is mounted. The participant may change on
 * every render; the sidebar always reaches the latest one. It joins once, so the parts keep the order
 * they were mounted in however their drafts come and go.
 */
export function useErrandSaveParticipant(id: string, dirty: boolean, participant: ErrandSaveParticipant) {
  const latest = useRef(participant);
  useEffect(() => {
    latest.current = participant;
  });

  useEffect(() => {
    const store = useErrandSaveParticipantsStore.getState();
    store.register(id, {
      get label() {
        return latest.current.label;
      },
      save: () => latest.current.save(),
      reveal: () => latest.current.reveal(),
    });
    return () => store.unregister(id);
  }, [id]);

  useEffect(() => {
    useErrandSaveParticipantsStore.getState().setDirty(id, dirty);
  }, [id, dirty]);
}
