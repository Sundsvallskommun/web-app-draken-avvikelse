import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  type ErrandSaveParticipant,
  saveParticipantsInTurn,
  selectDirtyParticipants,
  selectHasDirtyParticipant,
  unsavedParticipantsMessage,
  useErrandSaveParticipantsStore,
} from './errand-save-participants';

const participant = (label: string, save: () => Promise<boolean>): ErrandSaveParticipant => ({
  label,
  save,
  reveal: () => undefined,
});

test('saves the parts one at a time, in order', async () => {
  const calls: string[] = [];
  const slow = participant('Utredning', async () => {
    calls.push('utredning:start');
    await new Promise((resolve) => setTimeout(resolve, 5));
    calls.push('utredning:end');
    return true;
  });
  const fast = participant('Beslut', async () => {
    calls.push('beslut');
    return true;
  });

  assert.deepEqual(await saveParticipantsInTurn([slow, fast]), []);
  assert.deepEqual(calls, ['utredning:start', 'utredning:end', 'beslut']);
});

test('saves every part even when one fails, and answers the parts that were not saved', async () => {
  const refused = participant('Utredning', async () => false);
  const broken = participant('LEX-utredning', async () => {
    throw new Error('Nätverksfel');
  });
  let laterSaved = false;
  const later = participant('Beslut', async () => {
    laterSaved = true;
    return true;
  });

  assert.deepEqual(await saveParticipantsInTurn([refused, broken, later]), [refused, broken]);
  assert.equal(laterSaved, true);
});

test('offers only the parts that hold a draft, in the order they joined, and forgets a part that leaves', () => {
  const store = useErrandSaveParticipantsStore.getState();
  const first = participant('Enhetschefens utredning', async () => true);
  const second = participant('LEX-utredning', async () => true);
  store.register('first', first);
  store.register('second', second);

  assert.equal(selectHasDirtyParticipant(useErrandSaveParticipantsStore.getState()), false);

  store.setDirty('second', true);
  store.setDirty('first', true);
  assert.deepEqual(selectDirtyParticipants(useErrandSaveParticipantsStore.getState()), [first, second]);

  store.unregister('first');
  assert.deepEqual(selectDirtyParticipants(useErrandSaveParticipantsStore.getState()), [second]);
  store.unregister('second');
  assert.equal(selectHasDirtyParticipant(useErrandSaveParticipantsStore.getState()), false);
});

test('names the parts that were not saved', () => {
  assert.equal(
    unsavedParticipantsMessage([{ label: 'Enhetschefens utredning' }]),
    'Enhetschefens utredning kunde inte sparas. Orsaken visas där.'
  );
  assert.equal(
    unsavedParticipantsMessage([{ label: 'Enhetschefens utredning' }, { label: 'LEX-utredning' }, { label: 'Beslut' }]),
    'Enhetschefens utredning, LEX-utredning och Beslut kunde inte sparas. Orsaken visas där.'
  );
});
