import assert from 'node:assert/strict';

import { test } from 'vitest';

import { describeActiveFollowUpFilters } from './unit-follow-up-active-filters';
import {
  EMPTY_UNIT_FOLLOW_UP_FILTERS,
  type FollowUpFilterOptions,
  type UnitFollowUpFilters,
} from './unit-follow-up-filters';

const options: FollowUpFilterOptions = {
  reportTypes: [{ value: 'abuse', label: 'Missförhållande' }],
  units: [
    { value: 'granlunda-1', label: 'Granlunda 1' },
    { value: 'granlunda-2', label: 'Granlunda 2' },
  ],
  categories: [],
  subcategories: [],
  causeAreas: [],
  legalBases: [],
  statuses: [],
  measureTypes: [{ value: 'EDUCATION', label: 'Utbildning' }],
};

const filters = (chosen: Partial<UnitFollowUpFilters>): UnitFollowUpFilters => ({
  ...EMPTY_UNIT_FOLLOW_UP_FILTERS,
  ...chosen,
});

test('names nothing while nothing is chosen', () => {
  assert.deepEqual(describeActiveFollowUpFilters(EMPTY_UNIT_FOLLOW_UP_FILTERS, options, 'errands'), []);
});

test('names each chosen value by its filter, with the key figure first', () => {
  const chosen = filters({
    keyFigure: 'notStarted',
    units: ['granlunda-2', 'granlunda-1'],
    ivoNotification: ['yes'],
    riskValueHsl: '6',
    reportTypes: ['retired'],
  });

  assert.deepEqual(
    describeActiveFollowUpFilters(chosen, options, 'errands').map((filter) => filter.text),
    [
      'Ej påbörjade ärenden (>30 dagar)',
      // A value the period no longer offers is named by its key rather than hidden.
      'Rapporttyp: retired',
      'Enhet: Granlunda 2',
      'Enhet: Granlunda 1',
      'IVO-anmälan: Ja',
      'Riskvärde HSL: 6',
    ]
  );
});

test('a chip takes away its own value and nothing else', () => {
  const chosen = filters({ keyFigure: 'deviations', units: ['granlunda-1', 'granlunda-2'], riskValueSolLss: '9' });
  const [keyFigure, firstUnit, , risk] = describeActiveFollowUpFilters(chosen, options, 'errands');

  assert.deepEqual(keyFigure.without, { ...chosen, keyFigure: '' });
  assert.deepEqual(firstUnit.without, { ...chosen, units: ['granlunda-2'] });
  assert.deepEqual(risk.without, { ...chosen, riskValueSolLss: '' });
});

test('the police reports get a chip on the errands alone, where they narrow the list', () => {
  const chosen = filters({ policeReport: ['hsl', 'sol_lss'] });

  assert.deepEqual(
    describeActiveFollowUpFilters(chosen, options, 'errands').map((filter) => filter.text),
    ['Polisanmälan: Polisanmälan HSL', 'Polisanmälan: Polisanmälan SoL/LSS']
  );
  assert.deepEqual(describeActiveFollowUpFilters(chosen, options, 'measures'), []);
});

test("the measures' own filters get chips only where they narrow the list", () => {
  const chosen = filters({ measureTypes: ['EDUCATION'], measureStatuses: ['planned'], effects: ['no'] });

  assert.deepEqual(describeActiveFollowUpFilters(chosen, options, 'errands'), []);
  assert.deepEqual(
    describeActiveFollowUpFilters(chosen, options, 'measures').map((filter) => filter.text),
    ['Åtgärdstyp: Utbildning', 'Status: Planerad', 'Effekt: Nej']
  );
});
