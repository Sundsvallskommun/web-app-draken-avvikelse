// @vitest-environment jsdom
import type { Measure } from '@common/data-contracts/supportmanagement/data-contracts';
import { emptyUser } from '@common/services/user-service';
import { useSupportStore } from '@stores/support-store';
import { useUserStore } from '@stores/user-store';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { MeasuresSnapshot } from './support-measure-service';
import { SupportMeasuresTab } from './support-measures-tab';

const mocks = vi.hoisted(() => ({
  read: vi.fn<() => Promise<MeasuresSnapshot>>(),
  update: vi.fn<(...args: unknown[]) => Promise<void>>(),
  followUp: vi.fn<(...args: unknown[]) => Promise<void>>(),
  changeEnd: vi.fn<(...args: unknown[]) => Promise<void>>(),
  dirty: vi.fn(),
  locked: false,
}));
vi.mock('@common/services/api-service', () => ({ apiService: {} }));
vi.mock('@supportmanagement/services/support-errand-service', () => ({
  isSupportErrandLocked: () => mocks.locked,
}));
vi.mock('./support-measure-service', () => ({
  getSupportMeasures: mocks.read,
  updateSupportMeasure: mocks.update,
  followUpSupportMeasure: mocks.followUp,
  changeSupportMeasurePlannedComplete: mocks.changeEnd,
  createSupportMeasure: vi.fn(),
  decideSupportMeasure: vi.fn(),
}));

const measure: Measure = {
  id: 'measure-one',
  version: 3,
  type: 'EDUCATION',
  addedByUser: 'creator',
  addedByRole: 'MANAGER',
  accept: 'TRUE',
  description: 'Utbilda personalen',
  goal: 'Säkrare arbetssätt',
  plannedStart: '2026-09-10T00:00:00+02:00',
  plannedComplete: '2026-09-30T00:00:00+02:00',
  responsibleUser: 'Anna',
};
const snapshot: MeasuresSnapshot = {
  measures: [measure],
  errandVersion: 4,
  metadata: {
    measureTypes: [{ id: 'type-one', name: 'EDUCATION', displayName: 'Utbildning', measureGroups: ['PREVENTIVE'] }],
    roles: [{ name: 'MANAGER', displayName: 'Enhetschef' }],
  },
  creationRoles: [{ name: 'MANAGER', displayName: 'Enhetschef' }],
  registration: {
    status: 'ready',
    roleTypes: [{ roleName: 'MANAGER', measureTypes: ['EDUCATION'], decides: true }],
  },
  canWrite: true,
  mayFollowUp: true,
};
const errand = { id: 'errand-one', version: 4 } as SupportErrand;

function Harness({ active = true, followUp = true }: { active?: boolean; followUp?: boolean }) {
  const methods = useForm<SupportErrand>({ defaultValues: errand });
  return (
    <FormProvider {...methods}>
      <SupportMeasuresTab
        errand={errand}
        municipalityId="2281"
        onDirtyChange={mocks.dirty}
        isActive={active}
        followUp={followUp}
      />
    </FormProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.locked = false;
  mocks.read.mockResolvedValue(snapshot);
  mocks.update.mockResolvedValue(undefined);
  mocks.followUp.mockResolvedValue(undefined);
  mocks.changeEnd.mockResolvedValue(undefined);
  useSupportStore.setState({ supportErrand: undefined });
  useUserStore.setState({
    user: {
      ...emptyUser,
      username: 'creator',
      permissions: { ...emptyUser.permissions, canEditSupportManagement: true },
    },
  });
});
afterEach(cleanup);

test('follow-up shows only planned approved measures and offers completion instead of editing', async () => {
  mocks.read.mockResolvedValue({
    ...snapshot,
    measures: [
      measure,
      { ...measure, id: 'partial', accept: 'REWORK', description: 'Delvis godkänd åtgärd' },
      { ...measure, id: 'proposal', accept: undefined, description: 'Ett nytt förslag' },
      { ...measure, id: 'rejected', accept: 'FALSE', description: 'Avslagen åtgärd' },
      { ...measure, id: 'unplanned', plannedStart: undefined, plannedComplete: undefined, description: 'Ej planerad' },
    ],
  });
  render(<Harness />);
  await screen.findByText('Utbilda personalen');
  expect(screen.getByRole('heading', { name: 'Uppföljning' })).toBeTruthy();
  expect(screen.getByText('Delvis godkänd åtgärd')).toBeTruthy();
  expect(screen.queryByText('Ett nytt förslag')).toBeNull();
  expect(screen.queryByText('Avslagen åtgärd')).toBeNull();
  expect(screen.queryByText('Ej planerad')).toBeNull();
  expect(screen.queryByRole('button', { name: /Lägg till|Bedöm förslag|Redigera/ })).toBeNull();
  expect(screen.getAllByRole('checkbox', { name: 'Utförd: Utbildning' })).toHaveLength(2);
  // Ä12. The filters are named for what they filter, and their values are the words on the cards.
  const filterOptions = (name: string) =>
    within(screen.getByRole('combobox', { name }))
      .getAllByRole('option')
      .map((option) => option.textContent);
  expect(filterOptions('Genomförande')).toEqual(['Alla', 'Planerad', 'Genomförd']);
  expect(filterOptions('Godkännande')).toEqual(['Alla', 'Ej bedömd', 'Godkänd', 'Avslagen', 'Delvis godkänd']);
  expect(screen.getByRole('combobox', { name: 'Registrerad av' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Åtgärdstyp' })).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Godkännande' }), { target: { value: 'accepted' } });
  expect(screen.queryByText('Delvis godkänd åtgärd')).toBeNull();
});

test('the follow-up is titled in the dialog header, and the title is read first', async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Utförd: Utbildning' }));
  const dialog = await screen.findByRole('dialog', { name: 'Följ upp åtgärd' });
  const title = within(dialog).getByText('Följ upp åtgärd');
  expect(title.closest('.sk-modal-dialog-header')).not.toBeNull();
  expect(within(dialog).getAllByText('Följ upp åtgärd')).toHaveLength(1);
  await waitFor(() => expect(document.activeElement).toBe(title));
});

test.each(['Ja', 'Nej'])(
  'completion requires both answers and saves %s without changing the original measure',
  async (answer) => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Utförd: Utbildning' }));
    const dialog = await screen.findByRole('dialog', { name: 'Följ upp åtgärd' });
    await waitFor(() => expect(mocks.dirty).toHaveBeenLastCalledWith(true));
    const save = within(dialog).getByRole('button', { name: 'Spara uppföljning' });
    fireEvent.click(save);
    await within(dialog).findByRole('alert');
    expect(mocks.followUp).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('radio', { name: answer }));
    fireEvent.click(save);
    expect(mocks.followUp).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Beskriv åtgärdens effekt (Obligatoriskt)' }), {
      target: { value: '  Personalen har fått utbildning.  ' },
    });
    const result = { desiredEffectAchieved: answer === 'Ja', followUpDescription: 'Personalen har fått utbildning.' };
    mocks.read.mockResolvedValue({
      ...snapshot,
      measures: [
        {
          ...measure,
          result: answer === 'Ja' ? 'COMPLETED' : 'NOT_COMPLETED',
          resultText: result.followUpDescription,
          executed: '2026-09-11T12:00:00Z',
        },
      ],
    });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.followUp).toHaveBeenCalledWith('2281', 'errand-one', 'measure-one', 3, result));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.dirty).toHaveBeenLastCalledWith(false);
    expect(await screen.findByText('Utförd')).toBeTruthy();
    expect(screen.getByText('Åtgärdens effekt:')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  }
);

test('cancel leaves the measure incomplete and does not save', async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Utförd: Utbildning' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Avbryt' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(mocks.followUp).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox')).toBeTruthy();
  expect(mocks.dirty).toHaveBeenLastCalledWith(false);
});

test('a follow-up whose response was lost is recognised as saved from the reloaded measure', async () => {
  const answers = { desiredEffectAchieved: false, followUpDescription: 'Sparat före avbrottet' };
  mocks.followUp.mockRejectedValueOnce(
    new AxiosError('Unavailable', 'ERR_BAD_RESPONSE', undefined, undefined, {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {},
    })
  );
  render(<Harness />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Utförd: Utbildning' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Nej' }));
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: answers.followUpDescription } });
  mocks.read.mockResolvedValue({
    ...snapshot,
    measures: [
      {
        ...measure,
        version: 4,
        executed: '2026-09-11T12:00:00Z',
        result: 'NOT_COMPLETED',
        resultText: answers.followUpDescription,
      },
    ],
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Spara uppföljning' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(mocks.followUp).toHaveBeenCalledTimes(1);
  expect(mocks.followUp).toHaveBeenCalledWith('2281', 'errand-one', 'measure-one', 3, answers);
  expect(await screen.findByText('Utförd')).toBeTruthy();
  expect(screen.getByText(answers.followUpDescription)).toBeTruthy();
});

test('a version conflict preserves answers and never replaces someone else’s recorded follow-up', async () => {
  mocks.followUp.mockRejectedValueOnce(
    new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 412,
      statusText: 'Precondition Failed',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: {},
    })
  );
  render(<Harness />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Utförd: Utbildning' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Nej' }));
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Mina svar' } });
  mocks.read.mockResolvedValue({
    ...snapshot,
    measures: [
      {
        ...measure,
        version: 4,
        executed: '2026-09-11T12:00:00Z',
        result: 'COMPLETED',
        resultText: 'Tidigare sparat svar',
      },
    ],
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Spara uppföljning' }));
  await within(dialog).findByRole('alert');
  expect(within(dialog).getByDisplayValue('Mina svar')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Spara uppföljning' }));
  expect(mocks.followUp).toHaveBeenCalledTimes(1);
});

test('the follow-up is offered by role, whoever registered the measure', async () => {
  useUserStore.setState({ user: { ...useUserStore.getState().user, username: 'unit-manager' } });
  render(<Harness />);
  expect(await screen.findByRole('button', { name: 'Ändra slutdatum Utbildning' })).toBeTruthy();
});

test.each(['no-follow-up-role', 'read-only', 'locked'])(
  'follow-up respects %s editing restrictions',
  async (restriction) => {
    if (restriction === 'no-follow-up-role') {
      mocks.read.mockResolvedValue({ ...snapshot, mayFollowUp: false });
    } else if (restriction === 'read-only') {
      useUserStore.setState({ user: { ...useUserStore.getState().user, permissions: emptyUser.permissions } });
    } else mocks.locked = true;
    render(<Harness />);
    await screen.findByText('Utbilda personalen');
    expect(screen.queryByRole('button', { name: /Redigera åtgärd/ })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Ändra slutdatum/ })).toBeNull();
  }
);

// The start is part of the decision; only the end may slip, and whoever follows the measure up moves it.
test('the follow-up moves the end date and shows the decided start without offering it', async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ändra slutdatum Utbildning' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('2026-09-10')).toBeTruthy();
  expect(within(dialog).queryByDisplayValue('2026-09-10')).toBeNull();
  const end = within(dialog).getByLabelText('När ska åtgärden vara klar? (Obligatoriskt)');
  expect((end as HTMLInputElement).value).toBe('2026-09-30');

  fireEvent.change(end, { target: { value: '2026-09-01' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Spara slutdatum' }));
  expect(await within(dialog).findByText('Slutdatum får inte vara före startdatum.')).toBeTruthy();
  expect(mocks.changeEnd).not.toHaveBeenCalled();

  mocks.read.mockResolvedValue({
    ...snapshot,
    measures: [{ ...measure, version: 4, plannedComplete: '2026-10-15T00:00:00+02:00' }],
  });
  fireEvent.change(end, { target: { value: '2026-10-15' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Spara slutdatum' }));
  await waitFor(() =>
    expect(mocks.changeEnd).toHaveBeenCalledWith(
      '2281',
      'errand-one',
      'measure-one',
      3,
      expect.stringMatching(/^2026-10-15T00:00:00[+-]\d{2}:\d{2}$/),
      // The description was left as it was, so it is not sent.
      undefined
    )
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText('Planerat datum: 2026-09-10 – 2026-10-15')).toBeTruthy();
});

// Ä11. Moving the end date opens the description, so the one moving it can write why.
test('the description can be rewritten when the end date is moved, and is saved with it', async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ändra slutdatum Utbildning' }));
  const dialog = await screen.findByRole('dialog');
  const description = within(dialog).getByRole('textbox', { name: 'Beskrivning av åtgärd (Obligatoriskt)' });
  const save = within(dialog).getByRole('button', { name: 'Spara slutdatum' });
  expect((description as HTMLTextAreaElement).value).toBe('Utbilda personalen');

  // The step is the date's: a description rewritten on its own is not saved from here.
  fireEvent.change(description, { target: { value: 'Utbilda personalen. Flyttas: föreläsaren är sjuk.' } });
  expect(save).toHaveProperty('disabled', true);

  fireEvent.change(within(dialog).getByLabelText('När ska åtgärden vara klar? (Obligatoriskt)'), {
    target: { value: '2026-10-15' },
  });
  fireEvent.change(description, { target: { value: '   ' } });
  fireEvent.click(save);
  expect(await within(dialog).findByText('Beskriv vad åtgärden innebär.')).toBeTruthy();
  expect(mocks.changeEnd).not.toHaveBeenCalled();

  fireEvent.change(description, { target: { value: 'Utbilda personalen. Flyttas: föreläsaren är sjuk.' } });
  fireEvent.click(save);
  await waitFor(() =>
    expect(mocks.changeEnd).toHaveBeenCalledWith(
      '2281',
      'errand-one',
      'measure-one',
      3,
      expect.stringMatching(/^2026-10-15T00:00:00[+-]\d{2}:\d{2}$/),
      'Utbilda personalen. Flyttas: föreläsaren är sjuk.'
    )
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('editing an approved measure leaves both dates alone, and the measures view offers moving the end', async () => {
  render(<Harness followUp={false} />);
  expect(await screen.findByRole('button', { name: 'Ändra slutdatum Utbildning' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Redigera åtgärd Utbildning' }));
  const start = await screen.findByLabelText(/När ska åtgärden påbörjas\?/);
  expect((start as HTMLInputElement).readOnly).toBe(true);
  expect(screen.getByText('Startdatumet kan inte ändras.')).toBeTruthy();
  expect((screen.getByLabelText(/När ska åtgärden vara klar\?/) as HTMLInputElement).readOnly).toBe(true);
  expect(screen.getByText('Slutdatumet ändras med Ändra slutdatum, av den som följer upp åtgärden.')).toBeTruthy();
});

test('lists the latest added measure first, and gathers the measures per person when asked to', async () => {
  mocks.read.mockResolvedValue({
    ...snapshot,
    measures: [
      { ...measure, id: 'middle', created: '2026-09-11T09:00:00+02:00', addedByUser: 'CREATOR', description: 'Sedan' },
      { ...measure, id: 'early', created: '2026-09-10T09:00:00+02:00', addedByUser: 'other', description: 'Först' },
      { ...measure, id: 'late', created: '2026-09-12T09:00:00+02:00', description: 'Senast' },
    ],
  });
  render(<Harness followUp={false} />);
  const descriptions = (list: HTMLElement) =>
    within(list)
      .getAllByRole('listitem')
      .map((card) => within(card).getByText(/^(Först|Sedan|Senast)$/).textContent);

  expect(descriptions(await screen.findByRole('list', { name: 'Registrerade åtgärder' }))).toEqual([
    'Senast',
    'Sedan',
    'Först',
  ]);

  fireEvent.change(screen.getByRole('combobox', { name: 'Sortera efter' }), { target: { value: 'person' } });
  // One account whatever its case, and each person's own measures still with the latest added first.
  expect(descriptions(screen.getByRole('list', { name: /^creator \(2\)$/i }))).toEqual(['Senast', 'Sedan']);
  expect(descriptions(screen.getByRole('list', { name: 'other (1)' }))).toEqual(['Först']);
  expect(screen.queryByRole('list', { name: 'Registrerade åtgärder' })).toBeNull();

  // The order is not a filter, so clearing the filters leaves it as chosen.
  fireEvent.change(screen.getByRole('searchbox', { name: 'Sök' }), { target: { value: 'Först' } });
  fireEvent.click(screen.getByRole('button', { name: 'Rensa filter' }));
  expect(screen.getByRole('list', { name: /^creator \(2\)$/i })).toBeTruthy();
});

// B3. The handler saves the errand with the tab open and then changes a measure: both are their own writes, and the
// next save must not be refused as somebody else's change.
test('the errand’s known version follows a measure changed after the errand was saved with the tab open', async () => {
  const moveEndDate = async (date: string) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Ändra slutdatum Utbildning' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('När ska åtgärden vara klar? (Obligatoriskt)'), {
      target: { value: date },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spara slutdatum' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };
  const knownVersion = () => useSupportStore.getState().supportErrand?.version;
  useSupportStore.setState({ supportErrand: { ...errand } });
  render(<Harness />);
  await screen.findByText('Utbilda personalen');

  // Spara ärende in the sidebar: the errand is at 5 now, and the list on screen was read at 4.
  act(() => useSupportStore.setState({ supportErrand: { ...errand, version: 5 } }));
  mocks.read.mockResolvedValue({ ...snapshot, errandVersion: 6 });
  await moveEndDate('2026-10-15');
  await waitFor(() => expect(knownVersion()).toBe(6));

  // Two steps where the handler made one: somebody else wrote too, and the errand has to find that out itself.
  mocks.read.mockResolvedValue({ ...snapshot, errandVersion: 8 });
  await moveEndDate('2026-10-20');
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
  expect(knownVersion()).toBe(6);
});

test('returning to a tab reloads measures changed in the other view', async () => {
  const view = render(<Harness active={false} />);
  expect(mocks.read).not.toHaveBeenCalled();
  view.rerender(<Harness />);
  await screen.findByText('Utbilda personalen');
  view.rerender(<Harness active={false} />);
  mocks.read.mockResolvedValue({ ...snapshot, measures: [{ ...measure, responsibleUser: 'Erik' }] });
  view.rerender(<Harness />);
  await screen.findByText('Erik');
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

test('follow-up explains load failures and supports retry and empty results', async () => {
  mocks.read.mockRejectedValueOnce(new Error('Unavailable'));
  render(<Harness />);
  await screen.findByRole('alert');
  mocks.read.mockResolvedValue({ ...snapshot, measures: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }));
  await screen.findByText('Det finns inga planerade och godkända åtgärder att följa upp.');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('the original measures view retains registration and proposal decisions', async () => {
  mocks.read.mockResolvedValue({ ...snapshot, measures: [{ ...measure, accept: undefined }] });
  render(<Harness followUp={false} />);
  expect(await screen.findByRole('button', { name: 'Bedöm förslag Utbildning' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Lägg till åtgärd' })).toBeTruthy();
});
