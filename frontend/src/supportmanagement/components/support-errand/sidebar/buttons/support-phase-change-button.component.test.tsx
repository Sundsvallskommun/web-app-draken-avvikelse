// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { SupportPhaseChangeButtonComponent } from './support-phase-change-button.component';

const mocks = vi.hoisted(() => ({
  closesErrand: true,
  closingReminder: undefined as string | undefined,
}));
vi.mock('@supportmanagement/components/support-errand/ui-phase/use-support-phase-transition', () => ({
  useSupportPhaseTransition: () => ({
    availableTransitions: mocks.closesErrand ? [] : [{ transition: { id: 'next', description: 'Skicka till beslut' } }],
    selectedTransitionId: '',
    setSelectedTransitionId: vi.fn(),
    entersWorkflow: false,
    isSaving: false,
    controlsDisabled: false,
    canAdvance: true,
    closeRefusal: undefined,
    advancePhase: vi.fn(),
    closesErrand: mocks.closesErrand,
    closeErrand: vi.fn(),
    heldActionLabel: undefined,
    phaseEntryRequirementDialog: null,
  }),
}));
vi.mock('@supportmanagement/investigation/investigation-variant-registry', () => ({
  getInvestigationClosingReminder: () => mocks.closingReminder,
}));

const reminder = 'Återkoppla till rapportören hur det har gått med rapporten.';

beforeEach(() => {
  mocks.closesErrand = true;
  mocks.closingReminder = undefined;
});
afterEach(cleanup);

// Ä5: the manager who closes the errand is reminded to tell the reporter what came of the report.
test("describes the button that closes the errand with the variant's reminder", () => {
  mocks.closingReminder = reminder;
  render(<SupportPhaseChangeButtonComponent disabled={false} hasUnsavedChanges={false} />);

  const closeButton = screen.getByRole('button', { name: 'Avsluta ärendet' });
  const describedBy = closeButton.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  expect(document.getElementById(describedBy!)?.textContent).toBe(reminder);
});

test('a variant without a reminder leaves the button that closes the errand alone', () => {
  render(<SupportPhaseChangeButtonComponent disabled={false} hasUnsavedChanges={false} />);

  expect(screen.getByRole('button', { name: 'Avsluta ärendet' }).hasAttribute('aria-describedby')).toBe(false);
  expect(screen.queryByText(reminder)).toBeNull();
});

test('a button that only changes phase carries no reminder', () => {
  mocks.closesErrand = false;
  mocks.closingReminder = reminder;
  render(<SupportPhaseChangeButtonComponent disabled={false} hasUnsavedChanges={false} />);

  expect(screen.getByRole('button', { name: 'Skicka till beslut' }).hasAttribute('aria-describedby')).toBe(false);
  expect(screen.queryByText(reminder)).toBeNull();
});
