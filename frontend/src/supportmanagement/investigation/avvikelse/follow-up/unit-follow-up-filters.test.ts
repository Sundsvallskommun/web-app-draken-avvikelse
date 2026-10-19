import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  distinctFollowUpOptions,
  EMPTY_UNIT_FOLLOW_UP_FILTERS,
  hasActiveFollowUpFilters,
  matchesFollowUpErrandFilters,
  matchesFollowUpMeasureFilters,
  toggleFollowUpKeyFigure,
  type UnitFollowUpFilters,
} from './unit-follow-up-filters';
import type { FollowUpErrandRow, FollowUpMeasureRow } from './unit-follow-up-rows';

const errand: FollowUpErrandRow = {
  id: 'e1',
  errandNumber: 'VOF-2026-0011',
  unit: { value: 'granlunda-2', label: 'Granlunda 2' },
  reportType: { value: 'abuse', label: 'Missförhållande' },
  causeAreas: [{ value: 'procedures_routines_guidelines', label: 'Processer' }],
  created: '2026-05-24',
  riskValueSolLss: 9,
  ivoNotification: { value: 'yes', label: 'Ja' },
  status: { value: 'INQUIRY', label: 'Pågående' },
  legalBases: [{ value: 'SOL', label: 'SoL – Socialtjänstlagen' }],
  categories: [],
  subcategories: [],
  policeReports: [{ value: 'sol_lss', label: 'Polisanmälan SoL/LSS' }],
  measureCount: 1,
  labelPaths: ['REPORT_TYPE/ABUSE', 'PROVISION/SOL'],
  keyFigures: ['misconducts', 'legalBaseSolLss'],
};

const measure: FollowUpMeasureRow = {
  key: 'e1:m1',
  errand,
  type: { value: 'TRAINING', label: 'Utbildning' },
  status: { value: 'executed', label: 'Genomförd' },
  effect: { value: 'no', label: 'Nej' },
};

const filters = (chosen: Partial<UnitFollowUpFilters>): UnitFollowUpFilters => ({
  ...EMPTY_UNIT_FOLLOW_UP_FILTERS,
  ...chosen,
});

test('shows every errand while nothing is chosen', () => {
  assert.equal(matchesFollowUpErrandFilters(errand, EMPTY_UNIT_FOLLOW_UP_FILTERS), true);
  assert.equal(hasActiveFollowUpFilters(EMPTY_UNIT_FOLLOW_UP_FILTERS), false);
});

test('keeps an errand that carries any of the chosen values', () => {
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ reportTypes: ['deviation', 'abuse'] })), true);
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ legalBases: ['HSL'] })), false);
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ ivoNotification: ['no'] })), false);
});

// Polisanmälan HSL or Polisanmälan SoL/LSS: an errand is kept when it calls for either of the chosen ones.
test('keeps an errand that calls for any of the chosen police reports', () => {
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ policeReport: ['sol_lss'] })), true);
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ policeReport: ['hsl', 'sol_lss'] })), true);
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ policeReport: ['hsl'] })), false);
  assert.equal(
    matchesFollowUpErrandFilters({ ...errand, policeReports: [] }, filters({ policeReport: ['sol_lss'] })),
    false
  );
});

test('narrows no measure by the police reports, which are the errands alone', () => {
  const withoutPoliceReport = { ...measure, errand: { ...errand, policeReports: [] } };
  assert.equal(matchesFollowUpMeasureFilters(withoutPoliceReport, filters({ policeReport: ['hsl'] })), true);
});

test('keeps an errand on any of the chosen units', () => {
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ units: ['granlunda-1', 'granlunda-2'] })), true);
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ units: ['nacksta'] })), false);
});

test('keeps an errand behind the chosen key figure', () => {
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ keyFigure: 'misconducts' })), true);
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ keyFigure: 'notStarted' })), false);
  assert.equal(matchesFollowUpMeasureFilters(measure, filters({ keyFigure: 'legalBaseHsl' })), false);
  assert.equal(hasActiveFollowUpFilters(filters({ keyFigure: 'deviations' })), true);
});

test('a key figure lets go of every filter but the units, and choosing it again lets it go', () => {
  const chosen = toggleFollowUpKeyFigure(
    filters({ units: ['granlunda-2'], reportTypes: ['deviation'], riskValueHsl: '6', effects: ['yes'] }),
    'notStarted'
  );
  assert.deepEqual(chosen, filters({ units: ['granlunda-2'], keyFigure: 'notStarted' }));
  assert.deepEqual(toggleFollowUpKeyFigure(chosen, 'notStarted'), filters({ units: ['granlunda-2'] }));
  assert.equal(toggleFollowUpKeyFigure(chosen, 'deviations').keyFigure, 'deviations');
});

test('matches a chosen risk value exactly, and only on the errand that has one', () => {
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ riskValueSolLss: '9' })), true);
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ riskValueSolLss: '12' })), false);
  assert.equal(matchesFollowUpErrandFilters(errand, filters({ riskValueHsl: '9' })), false);
  assert.equal(hasActiveFollowUpFilters(filters({ riskValueHsl: '9' })), true);
});

test('filters a measure on its errand as well as on itself', () => {
  assert.equal(
    matchesFollowUpMeasureFilters(measure, filters({ measureStatuses: ['executed'], effects: ['no'] })),
    true
  );
  assert.equal(matchesFollowUpMeasureFilters(measure, filters({ effects: ['yes'] })), false);
  assert.equal(matchesFollowUpMeasureFilters(measure, filters({ reportTypes: ['deviation'] })), false);
});

test('offers each value once, by name', () => {
  assert.deepEqual(
    distinctFollowUpOptions([
      { value: 'b', label: 'Öst' },
      undefined,
      { value: 'a', label: 'Ankarsvik' },
      { value: 'b', label: 'Öst' },
    ]),
    [
      { value: 'a', label: 'Ankarsvik' },
      { value: 'b', label: 'Öst' },
    ]
  );
});
