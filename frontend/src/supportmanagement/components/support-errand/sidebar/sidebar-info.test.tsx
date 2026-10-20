// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { useSupportStore } from '../../../../stores/support-store';
import { useUserStore } from '../../../../stores/user-store';
import type { SupportErrand } from '../../../services/support-errand-service';
import { SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE } from '../../../services/support-errand-write-version';
import { useErrandSaveParticipantsStore } from '../errand-save/errand-save-participants';
import { SidebarInfo } from './sidebar-info.component';

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  read: vi.fn(),
  assign: vi.fn(),
  status: vi.fn(),
  phase: vi.fn(),
  toast: vi.fn(),
  handover: vi.fn(),
  push: vi.fn(),
  assignable: { administrators: [] as unknown[], roles: [] as unknown[] },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@supportmanagement/investigation/avvikelse/assignment/avvikelse-assignment-service', () => ({
  applyInvestigationHandover: mocks.handover,
}));
vi.mock('@stores/index', async () => ({
  ...(await import('../../../../stores/config-store')),
  ...(await import('../../../../stores/support-store')),
  ...(await import('../../../../stores/user-store')),
  useMetadataStore: (select: (state: { supportMetadata: undefined; setSupportMetadata: () => void }) => unknown) =>
    select({ supportMetadata: undefined, setSupportMetadata: () => undefined }),
}));
vi.mock('@common/services/user-service', async (original) => ({
  ...(await original<typeof import('@common/services/user-service')>()),
  getAssignableHandlers: async () => mocks.assignable,
}));
vi.mock('@common/components/handler-select/handler-select-options.component', async () => {
  const { handlerOptionValue } = await import('@common/components/handler-select/handler-option-value');
  return {
    // One option per role an administrator is listed under, valued as the real options are.
    HandlerSelectOptions: ({
      administrators,
    }: {
      administrators: { adAccount: string; displayName: string; roleKeys: string[] }[];
    }) => (
      <>
        <option>Välj handläggare</option>
        {administrators.flatMap((administrator) =>
          administrator.roleKeys.map((roleKey) => (
            <option
              key={handlerOptionValue(roleKey, administrator.adAccount)}
              value={handlerOptionValue(roleKey, administrator.adAccount)}
            >
              {administrator.displayName}
            </option>
          ))
        )}
      </>
    ),
  };
});
vi.mock('@common/components/lucide-icon-map/lucide-icon-map.component', () => ({ default: {} }));
vi.mock('@common/services/helper-service', () => ({
  hasDirtyFields: (fields: object) => Object.keys(fields).length > 0,
  prettyTime: () => '',
}));
vi.mock('@sk-web-gui/react', async (importOriginal) => {
  const gui = await importOriginal<typeof import('@sk-web-gui/react')>();
  return {
    Button: gui.Button,
    FormControl: gui.FormControl,
    FormLabel: gui.FormLabel,
    FormErrorMessage: gui.FormErrorMessage,
    Input: gui.Input,
    Select: gui.Select,
    Checkbox: gui.Checkbox,
    RadioButton: gui.RadioButton,
    Divider: gui.Divider,
    Label: gui.Label,
    useSnackbar: () => mocks.toast,
  };
});
vi.mock('@supportmanagement/services/support-errand-service', () => ({
  Status: { NEW: 'NEW', ASSIGNED: 'ASSIGNED', SUSPENDED: 'SUSPENDED', SOLVED: 'SOLVED', REOPENED: 'REOPENED' },
  getOngoingStatus: () => 'ONGOING',
  isSupportErrandLocked: () => false,
  supportErrandIsEmpty: () => false,
  validateAction: () => true,
  updateSupportErrand: mocks.save,
  getSupportErrandById: mocks.read,
  readSupportErrandWriteSnapshot: mocks.read,
  setSupportErrandAdmin: mocks.assign,
  setSupportErrandStatus: mocks.status,
  updateSupportErrandPhase: mocks.phase,
}));
vi.mock('@supportmanagement/services/support-metadata-service', () => ({
  getSupportMetadata: async () => ({ metadata: { phases: [] } }),
}));
vi.mock('./buttons/support-close-errand-button.component', () => ({ SupportCloseErrandButtonComponent: () => null }));
vi.mock('./buttons/support-resume-errand-button.component', () => ({ SupportResumeErrandButton: () => null }));
vi.mock('@supportmanagement/components/ongoing-support-errands/components/support-status-label.component', () => ({
  SupportStatusLabelComponent: () => null,
}));

const loaded: SupportErrand = {
  id: 'one',
  version: 1,
  title: 'Loaded title',
  status: 'NEW',
  priority: 'MEDIUM',
  category: '',
  type: '',
  subType: '',
  customer: [],
  contacts: [],
};
function Harness() {
  const form = useForm<SupportErrand & { admin: string }>({
    defaultValues: { ...loaded, admin: 'Välj handläggare' },
    mode: 'onChange',
  });
  return (
    <FormProvider {...form}>
      <input aria-label="Title" {...form.register('title')} />
      <output aria-label="Dirty">{String(form.formState.isDirty)}</output>
      <SidebarInfo hasUnsavedChanges={false} />
    </FormProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assignable = { administrators: [], roles: [] };
  mocks.save.mockReset().mockResolvedValue({ wrote: true });
  mocks.read.mockReset().mockResolvedValue({ errand: { ...loaded, title: 'Someone else changed this', version: 2 } });
  useSupportStore.setState({ supportErrand: { ...loaded } });
  useUserStore.setState({
    user: { ...useUserStore.getState().user, username: 'handler' },
    administrators: [],
    handlerRoles: [],
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useErrandSaveParticipantsStore.setState({ participants: {}, dirty: {} });
});

test.each([409, 412])('a save conflict (%s) retains the dirty draft and its original version', async (status) => {
  mocks.save.mockRejectedValue({ response: { status } });
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My unsaved title' } });
  const save = screen.getByRole('button', { name: 'Spara ärende' });
  await waitFor(() => expect(save).toHaveProperty('disabled', false));
  fireEvent.click(save);
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' })));
  expect(screen.getByLabelText('Title')).toHaveProperty('value', 'My unsaved title');
  expect(screen.getByLabelText('Dirty').textContent).toBe('true');
  expect(useSupportStore.getState().supportErrand).toMatchObject({ title: 'Loaded title', version: 1 });
  expect(mocks.read).not.toHaveBeenCalled();
});

test('Starta handläggning stops when the prerequisite save fails', async () => {
  mocks.save.mockRejectedValue({ response: { status: 412 } });
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Starta handläggning' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' })));
  expect(mocks.assign).not.toHaveBeenCalled();
  expect(mocks.phase).not.toHaveBeenCalled();
  expect(mocks.status).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveProperty('value', 'My draft');
});

// Starting writes nothing of an untouched form: a read, not a write that changes nothing, confirms the errand is as loaded.
test('Starta handläggning writes nothing of an untouched form and starts the errand as loaded', async () => {
  mocks.read.mockResolvedValue({ errand: { ...loaded } });
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Starta handläggning' }));
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Handläggning startad', status: 'success' })
    )
  );
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.status).toHaveBeenCalledOnce();
});

test('Starta handläggning stops, writing nothing, when somebody else changed the errand since it was loaded', async () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Starta handläggning' }));
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: SUPPORT_ERRAND_WRITE_CONFLICT_MESSAGE, status: 'error' })
    )
  );
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.assign).not.toHaveBeenCalled();
  expect(mocks.phase).not.toHaveBeenCalled();
  expect(mocks.status).not.toHaveBeenCalled();
});

test('Starta handläggning saves a draft first, and starts the errand as saved', async () => {
  mocks.read.mockResolvedValue({ errand: { ...loaded, title: 'My draft', version: 2 } });
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Starta handläggning' }));
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Handläggning startad', status: 'success' })
    )
  );
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'My draft' }),
    1,
    undefined,
    expect.objectContaining({ title: true })
  );
  expect(mocks.status).toHaveBeenCalledOnce();
});

test('only a fully confirmed save replaces the form baseline', async () => {
  mocks.read.mockResolvedValue({ errand: { ...loaded, title: 'My saved title', version: 2 } });
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My saved title' } });
  const save = screen.getByRole('button', { name: 'Spara ärende' });
  await waitFor(() => expect(save).toHaveProperty('disabled', false));
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByLabelText('Dirty').textContent).toBe('false'));
  expect(useSupportStore.getState().supportErrand).toMatchObject({ title: 'My saved title', version: 2 });
});

const lexManager = {
  displayName: 'Lena LEX',
  firstName: 'Lena',
  lastName: 'LEX',
  adAccount: 'lena.lex',
  id: 'lena',
  roleKeys: ['lex-ansvarig'],
};

/** Offers LEX-ansvarig as a handover, picks her - with a draft of the title too, when asked - and presses Spara ärende. */
const handToLex = async ({ editTitle = false } = {}) => {
  mocks.assignable = {
    administrators: [{ ...lexManager, handoverStep: 'assign-lex' }],
    roles: [{ key: 'lex-ansvarig', label: 'LEX-ansvarig' }],
  };
  mocks.read.mockResolvedValue({ errand: { ...loaded }, version: 3 });
  useUserStore.setState({
    administrators: [
      {
        displayName: 'Handläggare',
        firstName: 'H',
        lastName: 'L',
        adAccount: 'handler',
        id: 'h',
        roleKeys: ['enhetschef'],
      },
      lexManager,
    ],
  });
  render(<Harness />);

  const handlerSelect = await screen.findByLabelText('Tilldela handläggare');
  await waitFor(() => expect(screen.getByRole('option', { name: 'Lena LEX' })).toBeTruthy());
  fireEvent.change(handlerSelect, { target: { value: 'lex-ansvarig:lena.lex' } });
  if (editTitle) fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My draft' } });
  const save = screen.getByRole('button', { name: 'Spara ärende' });
  await waitFor(() => expect(save).toHaveProperty('disabled', false));
  fireEvent.click(save);
};

/**
 * Waiting for the handover to LEX, a manager of the place who is also LEX-ansvarig is offered twice: as the manager,
 * and as the handover. Picks her under the given role and presses Spara ärende.
 */
const chooseManagerWhoIsAlsoLex = async (roleKey: string) => {
  const nora = { displayName: 'Nora Chef', firstName: 'Nora', lastName: 'Chef', adAccount: 'nora.chef', id: 'nora' };
  mocks.assignable = {
    administrators: [
      { ...nora, roleKeys: ['verksamhetschef'] },
      { ...nora, roleKeys: ['lex-ansvarig'], handoverStep: 'assign-lex' },
    ],
    roles: [
      { key: 'verksamhetschef', label: 'Verksamhetschef' },
      { key: 'lex-ansvarig', label: 'LEX-ansvarig' },
    ],
  };
  mocks.read.mockResolvedValue({ errand: { ...loaded }, version: 3 });
  useUserStore.setState({
    administrators: [
      {
        displayName: 'Handläggare',
        firstName: 'H',
        lastName: 'L',
        adAccount: 'handler',
        id: 'h',
        roleKeys: ['enhetschef'],
      },
    ],
  });
  render(<Harness />);

  const handlerSelect = await screen.findByLabelText('Tilldela handläggare');
  await waitFor(() => expect(screen.getAllByRole('option', { name: 'Nora Chef' })).toHaveLength(2));
  fireEvent.change(handlerSelect, { target: { value: `${roleKey}:nora.chef` } });
  const save = screen.getByRole('button', { name: 'Spara ärende' });
  await waitFor(() => expect(save).toHaveProperty('disabled', false));
  fireEvent.click(save);
};

test('giving the errand to someone under their LEX heading is the handover, not an assignment', async () => {
  await chooseManagerWhoIsAlsoLex('lex-ansvarig');

  await waitFor(() => expect(mocks.handover).toHaveBeenCalledWith('one', 'assign-lex', 3, 'nora.chef'));
  expect(mocks.assign).not.toHaveBeenCalled();
});

test('giving the errand to the same person under their manager heading is an ordinary assignment', async () => {
  await chooseManagerWhoIsAlsoLex('verksamhetschef');

  await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith('one', 'nora.chef', 1, 'ASSIGNED', 'handler'));
  expect(mocks.handover).not.toHaveBeenCalled();
});

// Only what changed is written: Ansvarig is the assignment, and the errand itself holds no draft, so nothing of it
// is written and the assignment is conditioned on the version the page loaded.
test('choosing a new handler alone writes the assignment and nothing of the errand', async () => {
  await chooseManagerWhoIsAlsoLex('verksamhetschef');

  await waitFor(() => expect(mocks.assign).toHaveBeenCalledOnce());
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.assign).toHaveBeenCalledWith('one', 'nora.chef', loaded.version, 'ASSIGNED', 'handler');
});

test('a draft of the errand is written before the assignment, which follows the version it left', async () => {
  const nora = { displayName: 'Nora Chef', firstName: 'Nora', lastName: 'Chef', adAccount: 'nora.chef', id: 'nora' };
  mocks.assignable = {
    administrators: [{ ...nora, roleKeys: ['verksamhetschef'] }],
    roles: [{ key: 'verksamhetschef', label: 'Verksamhetschef' }],
  };
  mocks.read.mockResolvedValue({ errand: { ...loaded }, version: 3 });
  useUserStore.setState({
    administrators: [
      {
        displayName: 'Handläggare',
        firstName: 'H',
        lastName: 'L',
        adAccount: 'handler',
        id: 'h',
        roleKeys: ['enhetschef'],
      },
    ],
  });
  render(<Harness />);

  const handlerSelect = await screen.findByLabelText('Tilldela handläggare');
  await waitFor(() => expect(screen.getByRole('option', { name: 'Nora Chef' })).toBeTruthy());
  fireEvent.change(handlerSelect, { target: { value: 'verksamhetschef:nora.chef' } });
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My draft' } });
  const save = screen.getByRole('button', { name: 'Spara ärende' });
  await waitFor(() => expect(save).toHaveProperty('disabled', false));
  fireEvent.click(save);

  await waitFor(() => expect(mocks.assign).toHaveBeenCalledOnce());
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'My draft' }),
    loaded.version,
    undefined,
    expect.not.objectContaining({ admin: expect.anything() })
  );
  expect(mocks.assign).toHaveBeenCalledWith('one', 'nora.chef', 3, 'ASSIGNED', 'handler');
});

/** A part of the errand holding a draft, as the MAS/MAR select or an investigation document would. */
const registerDraft = (save: () => Promise<boolean>) => {
  const { register, setDirty } = useErrandSaveParticipantsStore.getState();
  register('draft', { label: 'MAS/MAR', save, reveal: () => undefined });
  setDirty('draft', true);
};

test('giving the errand to a candidate whose assignment is a handover takes that step and leaves the errand', async () => {
  await handToLex();

  await waitFor(() => expect(mocks.handover).toHaveBeenCalledWith('one', 'assign-lex', 3, 'lena.lex'));
  expect(mocks.assign).not.toHaveBeenCalled();
  expect(mocks.push).toHaveBeenCalledWith('/oversikt');
});

test('a handover is the last write of a save, since the errand is out of reach afterwards', async () => {
  const order: string[] = [];
  mocks.save.mockImplementation(async () => {
    order.push('errand');
    return { wrote: true };
  });
  registerDraft(async () => {
    order.push('draft');
    return true;
  });
  mocks.handover.mockImplementation(async () => {
    order.push('handover');
  });
  await handToLex({ editTitle: true });

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/oversikt'));
  // The errand's own fields first: they are conditioned on the version the form was loaded with,
  // which the drafts' writes would move on.
  expect(order).toEqual(['errand', 'draft', 'handover']);
});

test('a draft that cannot be saved stops the handover', async () => {
  registerDraft(async () => false);
  await handToLex();

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' })));
  expect(mocks.handover).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});

test('a failed handover stays on the errand and says so', async () => {
  mocks.handover.mockRejectedValue({ response: { status: 412 } });
  await handToLex();

  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' })));
  expect(mocks.push).not.toHaveBeenCalled();
});
