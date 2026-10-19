// @vitest-environment jsdom
import { useUserStore } from '@stores/user-store';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { PlannedSupportMeasure } from './planned-measures';
import { PlannedMeasuresOverview } from './planned-measures-overview';
import type { PlannedMeasuresSnapshot } from './support-measure-service';

const mocks = vi.hoisted(() => ({
  read: vi.fn<() => Promise<PlannedMeasuresSnapshot>>(),
}));
vi.mock('@common/services/api-service', () => ({ apiService: {} }));
vi.mock('./support-measure-service', () => ({ getPlannedSupportMeasures: mocks.read }));

const planned: PlannedSupportMeasure = {
  id: 'measure-one',
  version: 3,
  type: 'EDUCATION',
  accept: 'TRUE',
  description: 'Utbilda personalen',
  goal: 'Säkrare arbetssätt',
  plannedStart: '2026-09-10T00:00:00+02:00',
  plannedComplete: '2099-09-30T00:00:00+02:00',
  responsibleUser: 'abc01abc',
  errand: { id: 'errand-one', errandNumber: 'VOF-2026-0001', status: 'ONGOING' },
};
const snapshot: PlannedMeasuresSnapshot = {
  measures: [
    planned,
    {
      ...planned,
      id: 'measure-two',
      accept: 'REWORK',
      description: 'Byt larmmatta',
      plannedStart: undefined,
      plannedComplete: '2020-01-01T00:00:00+01:00',
      responsibleUser: undefined,
      errand: { id: 'errand-two', errandNumber: 'VOF-2026-0002', status: 'ONGOING' },
    },
  ],
  metadata: {
    measureTypes: [{ id: 'type-one', name: 'EDUCATION', displayName: 'Utbildning', measureGroups: ['PREVENTIVE'] }],
    roles: [{ name: 'MANAGER', displayName: 'Enhetschef' }],
  },
  truncated: false,
};
// The app marks elements with data-cy for Playwright; the same hooks serve here.
configure({ testIdAttribute: 'data-cy' });

const axiosFailure = (status: number) =>
  Object.assign(new AxiosError('Request failed'), { response: { status, data: {} } as AxiosResponse });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_BASEPATH', '/vof');
  mocks.read.mockResolvedValue(snapshot);
  useUserStore.setState({
    administrators: [
      {
        id: '1',
        adAccount: 'abc01abc',
        displayName: 'Anna Andersson',
        firstName: 'Anna',
        lastName: 'Andersson',
        roleKeys: [],
      },
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

test('sorts the measures into time buckets and links every row to its errand', async () => {
  render(<PlannedMeasuresOverview />);
  expect(mocks.read).toHaveBeenCalledWith();
  const rows = await screen.findAllByTestId('planned-measure-row');
  expect(rows).toHaveLength(2);
  expect(screen.getByText('2 åtgärder · 1 försenade.')).toBeTruthy();

  // The late measure comes first, in its own bucket, with the bucket named and counted.
  const overdue = within(screen.getByTestId('planned-measures-overdue'));
  expect(overdue.getByRole('heading', { level: 2, name: /Försenade/ })).toBeTruthy();
  expect(overdue.getAllByTestId('planned-measure-row')).toHaveLength(1);
  const later = within(screen.getByTestId('planned-measures-later'));
  expect(later.getByRole('heading', { level: 2, name: /Senare/ })).toBeTruthy();
  expect(screen.queryByTestId('planned-measures-soon')).toBeNull();

  const lateRow = within(overdue.getByTestId('planned-measure-row'));
  expect(lateRow.getByText('1 jan 2020')).toBeTruthy();
  expect(lateRow.getByText(/dagar sedan/)).toBeTruthy();
  expect(lateRow.getByText('Utbildning')).toBeTruthy();
  expect(lateRow.getByRole('link', { name: 'Ärende VOF-2026-0002, öppna ärende i ny flik' }).getAttribute('href')).toBe(
    '/vof/arende/VOF-2026-0002'
  );
  expect(lateRow.getByText('Delvis godkänd')).toBeTruthy();

  // The summary alone: the unfolded part repeats the responsible person.
  const upcoming = within(later.getByTestId('planned-measure-row').querySelector('summary') as HTMLElement);
  expect(upcoming.getByText('30 sep 2099')).toBeTruthy();
  const link = upcoming.getByRole('link', { name: 'Ärende VOF-2026-0001, öppna ärende i ny flik' });
  expect(link.getAttribute('href')).toBe('/vof/arende/VOF-2026-0001');
  expect(link.getAttribute('target')).toBe('_blank');
  expect(upcoming.getByText('Anna Andersson')).toBeTruthy();
  expect(upcoming.getByText('Godkänd')).toBeTruthy();
});

test('unfolds a row in place to the whole measure and offers the errand as a button', async () => {
  render(<PlannedMeasuresOverview />);
  const rows = await screen.findAllByTestId('planned-measure-row');
  const row = rows.find((candidate) => candidate.textContent?.includes('VOF-2026-0001')) as HTMLDetailsElement;
  expect(row.open).toBe(false);
  fireEvent.click(within(row).getByText('Utbildning'));
  expect(row.open).toBe(true);
  const details = within(row);
  expect(details.getByText('Utbilda personalen')).toBeTruthy();
  expect(details.getByText('Säkrare arbetssätt')).toBeTruthy();
  expect(row.textContent).toContain('Påbörjas2026-09-10');
  expect(row.textContent).toContain('Klar senast2099-09-30');
  expect(details.getByRole('button', { name: 'Öppna ärendet' }).closest('a')?.getAttribute('href')).toBe(
    '/vof/arende/VOF-2026-0001'
  );
});

test('narrows the list by free text and explains an empty match', async () => {
  render(<PlannedMeasuresOverview />);
  await screen.findAllByTestId('planned-measure-row');
  const search = screen.getByRole('textbox', { name: 'Sök planerade åtgärder' });
  fireEvent.change(search, { target: { value: 'larmmatta' } });
  expect(screen.getAllByTestId('planned-measure-row')).toHaveLength(1);
  expect(screen.getByText('Visar 1 av 2 åtgärder.')).toBeTruthy();
  expect(screen.queryByTestId('planned-measures-later')).toBeNull();
  fireEvent.change(search, { target: { value: 'finns inte' } });
  expect(screen.queryAllByTestId('planned-measure-row')).toHaveLength(0);
  expect(screen.getByText('Inga planerade åtgärder matchar sökningen.')).toBeTruthy();
});

// Ö1. A span over the deadlines, with labelled date fields that work without a pointer.
test('narrows the list to the measures whose end date falls within a span, and clears it again', async () => {
  render(<PlannedMeasuresOverview />);
  await screen.findAllByTestId('planned-measure-row');
  const from = screen.getByLabelText('Slutdatum från');
  const to = screen.getByLabelText('Slutdatum till');
  expect(screen.getByRole('group', { name: 'Slutdatum inom datumspann' })).toBeTruthy();

  // The second measure was due in January 2020, the first later.
  fireEvent.change(to, { target: { value: '2020-12-31' } });
  expect(screen.getAllByTestId('planned-measure-row')).toHaveLength(1);
  expect(screen.getByText('Visar 1 av 2 åtgärder.')).toBeTruthy();
  // Each end keeps the other from being set past it.
  expect((from as HTMLInputElement).max).toBe('2020-12-31');

  fireEvent.change(from, { target: { value: '2020-06-01' } });
  expect(screen.queryAllByTestId('planned-measure-row')).toHaveLength(0);
  expect(screen.getByText('Inga planerade åtgärder matchar urvalet.')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Rensa datum' }));
  expect(screen.getAllByTestId('planned-measure-row')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Rensa datum' })).toBeNull();
});

test('says when there is nothing to work with and when the list is cut short', async () => {
  mocks.read.mockResolvedValue({ ...snapshot, measures: [], truncated: true });
  render(<PlannedMeasuresOverview />);
  expect(await screen.findByText('Det finns inga planerade åtgärder att arbeta med.')).toBeTruthy();
  expect(screen.getByText(/Listan är ofullständig/)).toBeTruthy();
});

test('shows denied access and other failures with a retry that reloads', async () => {
  mocks.read.mockRejectedValueOnce(axiosFailure(403));
  render(<PlannedMeasuresOverview />);
  expect(await screen.findByText('Du saknar behörighet att läsa åtgärder.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Försök igen' }));
  await screen.findAllByTestId('planned-measure-row');
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

test('refreshes when the window regains focus after a visit to an errand, keeping the list meanwhile', async () => {
  render(<PlannedMeasuresOverview />);
  await screen.findAllByTestId('planned-measure-row');
  mocks.read.mockResolvedValue({ ...snapshot, measures: [planned] });
  fireEvent(window, new Event('focus'));
  await waitFor(() => expect(screen.getAllByTestId('planned-measure-row')).toHaveLength(1));
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
