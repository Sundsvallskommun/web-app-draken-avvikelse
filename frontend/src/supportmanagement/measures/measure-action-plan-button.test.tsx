// @vitest-environment jsdom
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { MeasureActionPlanButton } from './measure-action-plan-button';
import type { CreatedMeasureActionPlan } from './measure-action-plan-service';

const mocks = vi.hoisted(() => ({
  create: vi.fn<(municipalityId: string, errandId: string) => Promise<CreatedMeasureActionPlan>>(),
  refresh: vi.fn<(municipalityId: string, errandId: string) => Promise<void>>(),
  snackbar: vi.fn(),
}));
vi.mock('./measure-action-plan-service', () => ({
  createMeasureActionPlan: mocks.create,
  refreshSupportAttachments: mocks.refresh,
}));
vi.mock('@sk-web-gui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sk-web-gui/react')>()),
  useSnackbar: () => mocks.snackbar,
}));

const errand = { id: 'errand-one', version: 4 } as SupportErrand;
const fileName = 'Handlingsplan_IAF-2026-0001_1.pdf';
const axiosFailure = (status: number, message?: string) =>
  Object.assign(new AxiosError('Request failed'), {
    response: { status, data: message ? { message } : {} } as AxiosResponse,
  });

const button = () => screen.getByRole('button', { name: 'Skapa handlingsplan' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(undefined);
});
afterEach(cleanup);

test('is disabled with an explanation while the errand has no measures', () => {
  render(<MeasureActionPlanButton errand={errand} municipalityId="2281" measureCount={0} />);
  expect(button()).toHaveProperty('disabled', true);
  expect(screen.getByText('Handlingsplanen kan skapas när ärendet har minst en åtgärd.')).toBeTruthy();
  fireEvent.click(button());
  expect(mocks.create).not.toHaveBeenCalled();
});

test('creates the plan from the stored measures, names the attached file and refreshes the attachments', async () => {
  mocks.create.mockResolvedValue({ fileName, attachmentId: 'plan-1' });
  const onCreated = vi.fn(async () => undefined);
  render(<MeasureActionPlanButton errand={errand} municipalityId="2281" measureCount={2} onCreated={onCreated} />);
  expect(button()).toHaveProperty('disabled', false);
  expect(screen.getByText('Alla registrerade åtgärder samlas i en PDF som läggs som bilaga på ärendet.')).toBeTruthy();

  fireEvent.click(button());

  await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('2281', 'errand-one'));
  await waitFor(() =>
    expect(mocks.snackbar).toHaveBeenCalledWith({
      message: `Handlingsplanen ${fileName} har skapats och lagts som en bilaga på ärendet.`,
      status: 'success',
    })
  );
  expect(mocks.refresh).toHaveBeenCalledWith('2281', 'errand-one');
  // The plan is an attachment on the errand: the tab is told, so the errand's version follows the handler's write.
  expect(onCreated).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(button()).toHaveProperty('disabled', false));
  expect(mocks.create).toHaveBeenCalledTimes(1);
});

test.each([
  [
    'the server reason',
    axiosFailure(409, 'Det finns inga åtgärder att ta med i handlingsplanen.'),
    'Det finns inga åtgärder att ta med i handlingsplanen.',
  ],
  ['a permission denial', axiosFailure(403, 'Forbidden'), 'Du saknar behörighet att skapa handlingsplanen.'],
  [
    'a generic fallback',
    axiosFailure(502),
    'Handlingsplanen kunde inte skapas. Försök igen eller kontakta support om felet kvarstår.',
  ],
  [
    'a client-side message',
    new Error('Handlingsplanen returnerade ett oväntat svar.'),
    'Handlingsplanen returnerade ett oväntat svar.',
  ],
])('explains a failed plan with %s and leaves the attachments alone', async (_case, failure, message) => {
  mocks.create.mockRejectedValue(failure);
  render(<MeasureActionPlanButton errand={errand} municipalityId="2281" measureCount={1} />);

  fireEvent.click(button());

  await waitFor(() => expect(mocks.snackbar).toHaveBeenCalledWith({ message, status: 'error' }));
  expect(mocks.refresh).not.toHaveBeenCalled();
  await waitFor(() => expect(button()).toHaveProperty('disabled', false));
});
