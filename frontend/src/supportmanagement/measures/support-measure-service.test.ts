import { apiService } from '@common/services/api-service';
import { beforeEach, expect, test, vi } from 'vitest';

import {
  changeSupportMeasurePlannedComplete,
  createSupportMeasure,
  decideSupportMeasure,
  followUpSupportMeasure,
  updateSupportMeasure,
} from './support-measure-service';

vi.mock('@common/services/api-service', () => ({ apiService: { patch: vi.fn(), post: vi.fn() } }));

beforeEach(() => vi.resetAllMocks());

test('sends only follow-up answers to the dedicated route with the measure version', async () => {
  const answers = { desiredEffectAchieved: false, followUpDescription: 'Ingen förbättring.' };
  await followUpSupportMeasure('2281', 'errand/id', 'measure/id', 0, answers);
  expect(apiService.patch).toHaveBeenCalledWith(
    'supporterrands/2281/errand%2Fid/measures/measure%2Fid/follow-up',
    answers,
    {
      headers: { 'If-Match': '"0"' },
    }
  );
});

test('moves only the end date, through its own route and with the measure version', async () => {
  await changeSupportMeasurePlannedComplete('2281', 'errand/id', 'measure/id', 4, '2026-10-15T00:00:00+02:00');
  expect(apiService.patch).toHaveBeenCalledWith(
    'supporterrands/2281/errand%2Fid/measures/measure%2Fid/planned-complete',
    { plannedComplete: '2026-10-15T00:00:00+02:00' },
    { headers: { 'If-Match': '"4"' } }
  );
});

// Ä11. The one moving the date says why in the description, and both are saved in the one request.
test('sends a rewritten description with the end date it explains', async () => {
  await changeSupportMeasurePlannedComplete(
    '2281',
    'errand/id',
    'measure/id',
    4,
    '2026-10-15T00:00:00+02:00',
    'Utbildningen flyttas: föreläsaren är sjuk.'
  );
  expect(apiService.patch).toHaveBeenLastCalledWith(
    'supporterrands/2281/errand%2Fid/measures/measure%2Fid/planned-complete',
    { plannedComplete: '2026-10-15T00:00:00+02:00', description: 'Utbildningen flyttas: föreläsaren är sjuk.' },
    { headers: { 'If-Match': '"4"' } }
  );
});

test('does not follow up a measure without its version', async () => {
  await expect(
    followUpSupportMeasure('2281', 'errand', 'measure', undefined, {
      desiredEffectAchieved: true,
      followUpDescription: 'Klart.',
    })
  ).rejects.toThrow('measure version');
  expect(apiService.patch).not.toHaveBeenCalled();
});

test('creates with a type name and role key without an errand version or browser-supplied creator', async () => {
  const data = {
    type: 'EDUCATION',
    addedByRole: 'NURSE',
    goal: 'Säkrare arbetssätt',
    description: 'Gemensam utbildning',
  };
  await createSupportMeasure('2281', 'errand-id', data);
  expect(apiService.post).toHaveBeenCalledWith('supporterrands/2281/errand-id/measures', data);
});

test('sends the edited measure version and type name in separate header and body fields', async () => {
  const changes = { type: 'EDUCATION' };
  await updateSupportMeasure('2281', 'errand-id', 'measure-id', 3, changes);
  expect(apiService.patch).toHaveBeenCalledWith('supporterrands/2281/errand-id/measures/measure-id', changes, {
    headers: { 'If-Match': '"3"' },
  });
});

test('accepts the initial measure version zero', async () => {
  await updateSupportMeasure('2281', 'errand-id', 'measure-id', 0, { goal: 'Revised' });
  expect(apiService.patch).toHaveBeenCalledWith(
    expect.any(String),
    { goal: 'Revised' },
    { headers: { 'If-Match': '"0"' } }
  );
});

test.each([undefined, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
  'does not write with an invalid measure version: %s',
  async (version) => {
    await expect(updateSupportMeasure('2281', 'errand-id', 'measure-id', version, { goal: 'Revised' })).rejects.toThrow(
      'measure version'
    );
    expect(apiService.patch).not.toHaveBeenCalled();
  }
);

test('sends only the decision to the dedicated route using the measure version', async () => {
  const decision = {
    accept: 'REWORK' as const,
    acceptMotivation: 'Genomför del A, del B utgår därför att…',
    plannedStart: '2026-10-12T00:00:00+02:00',
    plannedComplete: '2026-11-30T00:00:00+01:00',
  };
  await decideSupportMeasure('2281', 'errand/id', 'measure/id', 0, decision);
  expect(apiService.patch).toHaveBeenCalledWith(
    'supporterrands/2281/errand%2Fid/measures/measure%2Fid/decision',
    decision,
    {
      headers: { 'If-Match': '"0"' },
    }
  );
});

test.each([undefined, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
  'does not decide without a valid measure version: %s',
  async (version) => {
    const approval = {
      accept: 'TRUE' as const,
      plannedStart: '2026-10-12T00:00:00+02:00',
      plannedComplete: '2026-11-30T00:00:00+01:00',
    };
    await expect(decideSupportMeasure('2281', 'errand-id', 'measure-id', version, approval)).rejects.toThrow(
      'measure version'
    );
    expect(apiService.patch).not.toHaveBeenCalled();
  }
);
