// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { act, createElement, type ReactNode, useCallback, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import WarnIfUnsavedChanges from '../../../common/utils/warnIfUnsavedChanges';
import { useSupportStore } from '../../../stores/support-store';
import { useUserStore } from '../../../stores/user-store';
import {
  saveParticipantsInTurn,
  selectDirtyParticipants,
  useErrandSaveParticipantsStore,
} from '../../components/support-errand/errand-save/errand-save-participants';
import type { InvestigationAccessState } from '../investigation-access';
import { useInvestigationProfileStore } from '../investigation-profile-store';
import type { InvestigationFormData } from './investigation-document';
import { SupportErrandInvestigationTab } from './support-errand-investigation-tab';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  errand: vi.fn(),
  save: vi.fn(),
  preview: vi.fn(),
  generate: vi.fn(),
  attachments: vi.fn(),
  completion: vi.fn<() => { field: string; reportsField: string } | undefined>(),
  refresh: vi.fn(),
  revealTab: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
  snackbar: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@common/services/api-service', () => ({
  apiService: { get: vi.fn(), put: vi.fn(), patch: vi.fn() },
  withRequestGroup: <T,>(action: () => Promise<T>) => action(),
}));
vi.mock('@stores/index', async () => ({
  ...(await import('../../../stores/config-store')),
  ...(await import('../../../stores/support-store')),
  ...(await import('../../../stores/user-store')),
  useMetadataStore: (selector: (state: { supportMetadata: undefined }) => unknown) =>
    selector({ supportMetadata: undefined }),
}));
vi.mock('@supportmanagement/services/support-errand-service', () => ({
  getSupportErrandById: mocks.errand,
  isSupportErrandLocked: () => false,
  isSupportErrandOpenToHandover: () => true,
}));
vi.mock('react-hook-form', async (original) => ({
  ...(await original<typeof import('react-hook-form')>()),
  useFormContext: () => ({ register: vi.fn(), resetField: vi.fn(), getValues: () => 1 }),
}));
vi.mock('@sk-web-gui/react', async (importOriginal) => {
  const gui = await importOriginal<typeof import('@sk-web-gui/react')>();
  return {
    Tabs: gui.Tabs,
    Button: gui.Button,
    Alert: gui.Alert,
    cx: gui.cx,
    Spinner: gui.Spinner,
    Label: gui.Label,
    // The question before a template overwrites written text; no template is chosen here, so it is never shown.
    Modal: gui.Modal,
    // No template is chosen here, so nothing ever asks before replacing the investigation text.
    useConfirm: () => ({ showConfirmation: async () => false }),
    useSnackbar: () => mocks.snackbar,
  };
});
vi.mock('@common/components/json/schema/schema-form.component', () => ({
  default: ({
    formData,
    onChange,
    readonly,
    idPrefix,
    externalFields,
    onSubmit,
  }: {
    formData: InvestigationFormData;
    onChange: (data: InvestigationFormData) => void;
    readonly: boolean;
    idPrefix: string;
    externalFields?: Readonly<Record<string, ReactNode>>;
    onSubmit: (data: InvestigationFormData) => void;
  }) =>
    createElement(
      'form',
      {
        onSubmit: (event: { preventDefault: () => void }) => {
          event.preventDefault();
          onSubmit(formData);
        },
      },
      createElement('textarea', {
        'aria-label': idPrefix,
        value: String(formData.answer ?? ''),
        readOnly: readonly,
        onChange: (event: { target: { value: string } }) => onChange({ ...formData, answer: event.target.value }),
      }),
      createElement('button', { type: 'button', onClick: () => onSubmit(formData) }, 'Save document'),
      externalFields?.investigationReport
    ),
}));
vi.mock('@common/components/json/utils/schema-utils', () => ({
  getRjsfSchema: async () => ({ type: 'object' }),
  getLatestRjsfSchema: async () => ({ schema: { type: 'object' }, schemaId: 'schema' }),
  getUiSchemaForSchema: async () => ({}),
}));
vi.mock('./investigation-classification', () => ({
  isReportedMisconductErrand: () => false,
  getInvestigationDocumentApplicability: () => undefined,
  isInvestigationClassificationOwner: () => false,
  getInvestigationClassificationSchemaContract: () => undefined,
  getInvestigationClassificationUiSchema: () => ({}),
  getInvestigationLegalBaseRules: () => [],
  getInvestigationLegalBases: () => [],
  normalizeContextualInvestigationFormData: (
    _key: string,
    _name: string,
    _schema: unknown,
    data: InvestigationFormData
  ) => data,
}));
vi.mock('./investigation-form-data', async (original) => ({
  ...(await original<typeof import('./investigation-form-data')>()),
  getInvestigationRenderingSchema: (_name: string, schema: unknown) => schema,
  getInvestigationServerTimestamps: () => [],
  getInvestigationCompletion: mocks.completion,
  getInvestigationReports: () => [],
  getHslRiskValue: () => undefined,
  investigationDefaultFormStateBehavior: {},
  investigationRequiredIndicator: ' (Obligatorisk)',
}));
vi.mock('@supportmanagement/services/support-attachment-service', () => ({
  getSupportAttachments: mocks.attachments,
}));
vi.mock('./investigation-schema-debug-panel.component', () => ({
  investigationSchemaDebugIsVisible: () => false,
  InvestigationSchemaDebugPanel: () => null,
}));
vi.mock('./support-investigation-service', () => ({
  getSupportInvestigationDocument: mocks.read,
  isSupportInvestigationAccessDenied: () => false,
  isSupportInvestigationConflict: () => false,
  saveSupportInvestigationDocument: mocks.save,
  createSupportInvestigationReport: mocks.generate,
  previewSupportInvestigationReport: mocks.preview,
}));

const grants = (
  first: 'edit' | 'read' | 'hidden' = 'edit',
  second: 'edit' | 'read' | 'hidden' = 'edit'
): InvestigationAccessState => ({
  status: 'ready',
  access: {
    errandId: 'one',
    documents: new Map([
      ['first', first],
      ['second', second],
    ]),
  },
});

function Harness({ access }: { access: InvestigationAccessState }) {
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const onDirtyChange = useCallback((key: string, value: boolean) => {
    setDirty((current) => (current[key] === value ? current : { ...current, [key]: value }));
  }, []);
  return (
    <WarnIfUnsavedChanges showWarning={Object.values(dirty).some(Boolean)}>
      <SupportErrandInvestigationTab
        access={access}
        onDirtyChange={onDirtyChange}
        refreshAccess={mocks.refresh}
        revealTab={mocks.revealTab}
      />
    </WarnIfUnsavedChanges>
  );
}

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.completion.mockReset();
  mocks.preview.mockReset();
  mocks.generate.mockReset();
  mocks.snackbar.mockReset();
  mocks.attachments.mockReset().mockResolvedValue([]);
  mocks.save.mockReset();
  mocks.errand.mockReset().mockResolvedValue({ errand: { id: 'one', labels: [] } });
  sessionStorage.clear();
  mocks.read.mockReset().mockImplementation(async (_errand: string, key: string) => ({
    document: { key, schemaId: 'schema', value: { answer: `Saved ${key}` } },
    etag: '"1"',
  }));
  mocks.refresh.mockClear();
  mocks.revealTab.mockClear();
  useSupportStore.setState({
    supportErrand: { id: 'one', version: 1, category: '', type: '', subType: '', customer: [], contacts: [] },
  });
  useUserStore.setState({ user: { ...useUserStore.getState().user, username: 'handler' } });
  useInvestigationProfileStore.setState({
    status: 'ready',
    profile: {
      state: 'active',
      registration: { mode: 'enabled' },
      documents: ['first', 'second'].map((key) => ({
        key,
        schemaName: key,
        tabLabel: key,
        ownerLabel: 'Owner',
        placement: 'investigation',
        appliesTo: 'all',
      })),
    },
  });
});
afterEach(cleanup);

test.each(['Skapa rapport', 'Förhandsgranska rapport'])('shows the report service error for %s', async (button) => {
  mocks.completion.mockReturnValue({ field: 'completed', reportsField: 'reports' });
  mocks.read.mockImplementation(async (_errand: string, key: string) => ({
    document: { key, schemaId: 'schema', value: { answer: `Saved ${key}`, completed: 'yes' } },
    etag: '"1"',
  }));
  const message = 'Rapporttjänsten nekade applikationens åtkomst. Kontakta support.';
  const error = new AxiosError('Request failed with status code 502', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status: 502,
    statusText: 'Bad Gateway',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
    data: { message },
  });
  mocks.preview.mockRejectedValue(error);
  mocks.generate.mockRejectedValue(error);
  render(createElement(Harness, { access: grants() }));
  await screen.findByDisplayValue('Saved first');
  fireEvent.click(screen.getAllByRole('button', { name: button })[0]);
  expect(await screen.findByText(message)).toBeTruthy();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.queryByText('Request failed with status code 502')).toBeNull();
});

test('an access failure hides data, retains the draft and keeps the reload warning active', async () => {
  const { rerender } = render(createElement(Harness, { access: grants() }));
  await screen.findByDisplayValue('Saved first');
  fireEvent.change(screen.getByLabelText('first', { selector: 'textarea' }), { target: { value: 'Unsaved work' } });
  rerender(createElement(Harness, { access: { status: 'error' } }));
  expect(screen.queryByDisplayValue('Unsaved work')).toBeNull();
  expect(screen.getByText(/osparade ändringar i ett dokument/)).toBeTruthy();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Kontrollera behörigheter igen' }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  rerender(createElement(Harness, { access: grants() }));
  expect(await screen.findByDisplayValue('Unsaved work')).toBeTruthy();
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

test('removing an earlier document does not move or erase the next document draft', async () => {
  const { rerender } = render(createElement(Harness, { access: grants() }));
  await screen.findByDisplayValue('Saved second');
  fireEvent.change(screen.getByLabelText('second', { selector: 'textarea' }), { target: { value: 'Second draft' } });
  rerender(createElement(Harness, { access: grants('hidden', 'edit') }));
  expect(screen.queryByLabelText('first', { selector: 'textarea' })).toBeNull();
  expect(screen.getByDisplayValue('Second draft')).toBeTruthy();
  rerender(createElement(Harness, { access: grants('hidden', 'hidden') }));
  expect(screen.queryByDisplayValue('Second draft')).toBeNull();
  rerender(createElement(Harness, { access: grants('edit', 'read') }));
  expect(await screen.findByDisplayValue('Second draft')).toHaveProperty('readOnly', true);
});

test('initially hidden documents are not fetched', async () => {
  render(createElement(Harness, { access: grants('hidden', 'read') }));
  await screen.findByDisplayValue('Saved second');
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('first', { selector: 'textarea' })).toBeNull();
});

test('a new user cannot inherit the previous user draft', async () => {
  const { rerender } = render(createElement(Harness, { access: grants() }));
  await screen.findByDisplayValue('Saved first');
  fireEvent.change(screen.getByLabelText('first', { selector: 'textarea' }), { target: { value: 'Private draft' } });
  rerender(createElement(Harness, { access: { status: 'denied' } }));
  act(() => useUserStore.setState({ user: { ...useUserStore.getState().user, username: 'another-handler' } }));
  await waitFor(() => expect(screen.queryByText(/osparade ändringar i ett dokument/)).toBeNull());
  rerender(createElement(Harness, { access: grants() }));
  expect(await screen.findByDisplayValue('Saved first')).toBeTruthy();
  expect(screen.queryByDisplayValue('Private draft')).toBeNull();
});

test('a report leaves the errand as the page knows it', async () => {
  mocks.completion.mockReturnValue({ field: 'completed', reportsField: 'reports' });
  mocks.read.mockResolvedValue({
    document: { key: 'first', schemaId: 'schema', value: { answer: 'Saved first', completed: 'yes' } },
    etag: '"1"',
  });
  useSupportStore.setState((state) => ({ supportErrand: { ...state.supportErrand!, title: 'Old title' } }));
  mocks.generate.mockResolvedValue({
    document: { key: 'first', schemaId: 'schema', value: { answer: 'Saved first', completed: 'yes' } },
    etag: '"2"',
    report: { fileName: 'report.pdf' },
  });
  render(createElement(Harness, { access: grants('edit', 'hidden') }));
  fireEvent.click(await screen.findByRole('button', { name: 'Skapa rapport' }));
  // The report is confirmed in a toast, not in an alert at the top of the document.
  await waitFor(() =>
    expect(mocks.snackbar).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/Rapporten report.pdf har skapats/), status: 'success' })
    )
  );
  expect(useSupportStore.getState().supportErrand).toMatchObject({ title: 'Old title', version: 1 });
});

test('a report retry retains its publication identity after a lost response', async () => {
  mocks.completion.mockReturnValue({ field: 'completed', reportsField: 'reports' });
  mocks.read.mockResolvedValue({
    document: { key: 'first', schemaId: 'schema', value: { answer: 'Saved first', completed: 'yes' } },
    etag: '"1"',
  });
  mocks.generate.mockRejectedValue(new Error('Lost response'));
  const view = render(createElement(Harness, { access: grants('edit', 'hidden') }));
  fireEvent.click(await screen.findByRole('button', { name: 'Skapa rapport' }));
  await screen.findByText('Lost response');
  const operationId = mocks.generate.mock.calls[0][2];
  view.unmount();
  render(createElement(Harness, { access: grants('edit', 'hidden') }));
  fireEvent.click(await screen.findByRole('button', { name: 'Skapa rapport' }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
  expect(mocks.generate.mock.calls[1][2]).toBe(operationId);
  expect(operationId).toMatch(/^[a-f0-9-]{36}$/);
});

// The BFF marks the errand with what follows from a saved document - a high HSL risk - in the same call, so the page
// takes in the labels the errand has now, and what it has seen of them. Nothing else of the errand: its other fields,
// and what the page has seen of them, stay as the page shows them.
test('a document save takes in the errand’s labels and leaves the rest of it as the page knows it', async () => {
  const risk = { id: 'risk', resourcePath: 'RISK/HIGH_HSL' };
  mocks.save.mockResolvedValue({
    document: { key: 'first', schemaId: 'schema', value: { answer: 'New answer' } },
    etag: '"2"',
  });
  mocks.errand.mockResolvedValue({
    errand: {
      id: 'one',
      title: 'Somebody else’s title',
      version: 5,
      labels: [risk],
      facts: { title: 'their-title', labels: 'with-risk', routingLabels: 'routed' },
    },
  });
  useSupportStore.setState((state) => ({
    supportErrand: {
      ...state.supportErrand!,
      title: 'Old title',
      facts: { title: 'old-title', labels: 'without-risk', routingLabels: 'routed' },
    },
  }));
  render(createElement(Harness, { access: grants('edit', 'hidden') }));
  fireEvent.change(await screen.findByLabelText('first', { selector: 'textarea' }), {
    target: { value: 'New answer' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save document' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText('Osparade ändringar')).toBeNull());
  await waitFor(() => expect(useSupportStore.getState().supportErrand?.labels).toEqual([risk]));
  expect(useSupportStore.getState().supportErrand).toMatchObject({
    title: 'Old title',
    version: 1,
    facts: { title: 'old-title', labels: 'with-risk', routingLabels: 'routed' },
  });
});

test('a failed attachment refresh still reports the publication as successful', async () => {
  mocks.completion.mockReturnValue({ field: 'completed', reportsField: 'reports' });
  mocks.read.mockResolvedValue({
    document: { key: 'first', schemaId: 'schema', value: { answer: 'Saved first', completed: 'yes' } },
    etag: '"1"',
  });
  mocks.generate.mockResolvedValue({
    document: { key: 'first', schemaId: 'schema', value: { answer: 'Saved first', completed: 'yes' } },
    etag: '"2"',
    report: { fileName: 'report.pdf' },
  });
  mocks.attachments.mockRejectedValue(new Error('List unavailable'));
  render(createElement(Harness, { access: grants('edit', 'hidden') }));
  fireEvent.click(await screen.findByRole('button', { name: 'Skapa rapport' }));
  await screen.findByText(/Rapporten report.pdf har skapats, men bilagelistan kunde inte uppdateras/);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('List unavailable')).toBeNull();
});

const dirtyParticipants = () => selectDirtyParticipants(useErrandSaveParticipantsStore.getState());

test('Spara ärende saves a document draft through its form', async () => {
  mocks.save.mockResolvedValue({
    document: { key: 'first', schemaId: 'schema', value: { answer: 'Sidebar answer' } },
    etag: '"2"',
  });
  render(createElement(Harness, { access: grants('edit', 'hidden') }));
  expect(screen.queryByRole('button', { name: /Spara utredning/u })).toBeNull();
  fireEvent.change(await screen.findByLabelText('first', { selector: 'textarea' }), {
    target: { value: 'Sidebar answer' },
  });
  await waitFor(() => expect(dirtyParticipants().map(({ label }) => label)).toEqual(['first']));

  expect(await saveParticipantsInTurn(dirtyParticipants())).toEqual([]);
  expect(mocks.save).toHaveBeenCalledWith(
    'one',
    'first',
    { schemaId: 'schema', value: { answer: 'Sidebar answer' } },
    '"1"'
  );
  await waitFor(() => expect(dirtyParticipants()).toEqual([]));
});

test('a document Spara ärende could not save is shown with why', async () => {
  mocks.save.mockRejectedValue(new Error('Lost connection'));
  render(createElement(Harness, { access: grants('edit', 'hidden') }));
  fireEvent.change(await screen.findByLabelText('first', { selector: 'textarea' }), {
    target: { value: 'Unsaved answer' },
  });
  await waitFor(() => expect(dirtyParticipants()).toHaveLength(1));

  const unsaved = await saveParticipantsInTurn(dirtyParticipants());
  expect(unsaved.map(({ label }) => label)).toEqual(['first']);
  expect(screen.getByDisplayValue('Unsaved answer')).toBeTruthy();
  act(() => unsaved[0].reveal());
  expect(mocks.revealTab).toHaveBeenCalledOnce();
});

test('a draft that is out of reach is no draft for Spara ärende', async () => {
  const { rerender } = render(createElement(Harness, { access: grants() }));
  fireEvent.change(await screen.findByLabelText('first', { selector: 'textarea' }), {
    target: { value: 'Hidden draft' },
  });
  await waitFor(() => expect(dirtyParticipants()).toHaveLength(1));
  rerender(createElement(Harness, { access: { status: 'error' } }));
  await waitFor(() => expect(dirtyParticipants()).toEqual([]));
});
