import assert from 'node:assert/strict';

import dayjs from 'dayjs';
import { test } from 'vitest';

import { type FollowUpRowContext, measureStatus, toFollowUpRows } from './unit-follow-up-rows';
import type { UnitFollowUpErrand } from './unit-follow-up-service';

const context: FollowUpRowContext = {
  labelStructure: [],
  vocabulary: {
    legalBases: new Map([['LSS', 'LSS – Lagen om stöd och service till vissa funktionshindrade']]),
    causeAreas: new Map([['procedures_routines_guidelines', 'Processer, rutiner, arbetssätt, riktlinjer']]),
    misconductDegrees: new Map([['serious_misconduct', 'Allvarligt missförhållande']]),
    riskValuesHsl: [],
    riskValuesSolLss: [],
  },
  statusName: (status) => ({ INQUIRY: 'Pågående' }[status]),
  personName: (account) => ({ nin01per: 'Nina Persson' }[account]),
  measureTypes: [{ name: 'TRAINING', displayName: 'Utbildning' }],
  keyFigures: { today: dayjs('2026-07-01'), notStartedStatuses: ['NEW'] },
};

const errand: UnitFollowUpErrand = {
  id: 'e1',
  errandNumber: 'VOF-2026-0011',
  status: 'INQUIRY',
  created: '2026-05-24T10:15:00.000+02:00',
  // As Support Management spells the classifications: report-type, category and type.
  labels: [
    { id: 'abuse', classification: 'report-type', displayName: 'Missförhållande', resourcePath: 'REPORT_TYPE/ABUSE' },
    { id: 'sol', classification: 'PROVISION', displayName: 'SoL', resourcePath: '/provision/sol/' },
    { id: 'cat', classification: 'category', displayName: 'Brister i rättssäkerhet' },
    { id: 'sub', classification: 'type', displayName: 'Bristande handläggning' },
    { id: 'vof', classification: 'LOCATION', displayName: 'VOF' },
    { id: 'unit', classification: 'LOCATION', displayName: 'Granlunda 2' },
  ],
  investigation: {
    // LEX found the misconduct falls under LSS, whatever the report was filed under.
    legalBases: ['LSS'],
    riskValueSolLss: 9,
    causeAreas: ['procedures_routines_guidelines', 'retired_code'],
    ivoNotification: 'yes',
    decidedMisconductDegree: 'serious_misconduct',
  },
  measures: [
    {
      id: 'm1',
      type: 'TRAINING',
      addedByUser: 'nin01per',
      accept: 'TRUE',
      plannedStart: '2026-02-01',
      executed: '2026-03-02',
      result: 'COMPLETED',
    },
    { id: 'm2', type: 'UNKNOWN', accept: 'TRUE' },
  ],
};

test('shows an errand by its unit, report type, causes, risk, decision and measure count', () => {
  const [row] = toFollowUpRows([errand], context).errands;

  assert.deepEqual(row.unit, { value: 'unit', label: 'Granlunda 2' });
  assert.equal(row.reportType?.label, 'Missförhållande');
  assert.deepEqual(
    row.causeAreas.map((option) => option.label),
    ['Processer, rutiner, arbetssätt, riktlinjer', 'retired_code']
  );
  assert.equal(row.created, '2026-05-24');
  assert.equal(row.riskValueHsl, undefined);
  assert.equal(row.riskValueSolLss, 9);
  assert.equal(row.ivoNotification?.label, 'Ja');
  assert.equal(row.decidedMisconduct?.label, 'Allvarligt missförhållande');
  assert.equal(row.status?.label, 'Pågående');
  assert.deepEqual(row.legalBases, [
    { value: 'LSS', label: 'LSS – Lagen om stöd och service till vissa funktionshindrade' },
  ]);
  assert.deepEqual(row.categories, [{ value: 'cat', label: 'Brister i rättssäkerhet' }]);
  assert.deepEqual(row.subcategories, [{ value: 'sub', label: 'Bristande handläggning' }]);
  assert.equal(row.measureCount, 2);
  assert.deepEqual(row.labelPaths, ['REPORT_TYPE/ABUSE', 'PROVISION/SOL']);
  assert.deepEqual(row.keyFigures, ['misconducts', 'legalBaseSolLss']);
});

test('names the police reports the investigations answer Ja to, HSL from the unit manager and SoL/LSS from LEX', () => {
  const policeReports = (policeReportHsl?: string, policeReportSolLss?: string) =>
    toFollowUpRows(
      [{ ...errand, investigation: { ...errand.investigation, policeReportHsl, policeReportSolLss } }],
      context
    ).errands[0].policeReports;

  assert.deepEqual(policeReports('yes', 'not_applicable'), [{ value: 'hsl', label: 'Polisanmälan HSL' }]);
  assert.deepEqual(policeReports('not_applicable', 'yes'), [{ value: 'sol_lss', label: 'Polisanmälan SoL/LSS' }]);
  assert.deepEqual(
    policeReports('yes', 'yes').map(({ value }) => value),
    ['hsl', 'sol_lss']
  );
  // Nej, as older lex Sarah investigations answered, calls for none.
  assert.deepEqual(policeReports(undefined, 'no'), []);
});

test('counts an errand still new more than thirty days after it was registered as not started', () => {
  const [waiting] = toFollowUpRows([{ ...errand, status: 'NEW' }], context).errands;
  assert.equal(waiting.keyFigures.includes('notStarted'), true);

  const [taken] = toFollowUpRows([errand], context).errands;
  assert.equal(taken.keyFigures.includes('notStarted'), false);
});

test('lists each measure with its type, author, status, dates and effect', () => {
  const [executed, planned] = toFollowUpRows([errand], context).measures;

  assert.equal(executed.type.label, 'Utbildning');
  assert.equal(executed.addedBy, 'Nina Persson');
  assert.equal(executed.status.label, 'Genomförd');
  assert.equal(executed.started, '2026-02-01');
  assert.equal(executed.completed, '2026-03-02');
  assert.equal(executed.effect?.label, 'Ja');
  assert.equal(executed.errand.errandNumber, 'VOF-2026-0011');
  // A type the namespace no longer knows is shown by its code rather than dropped.
  assert.equal(planned.type.label, 'UNKNOWN');
  assert.equal(planned.status.label, 'Planerad');
  assert.equal(planned.effect, undefined);
});

test('a measure stands where its execution and decision leave it', () => {
  assert.equal(measureStatus({ executed: '2026-03-02', accept: null }), 'executed');
  assert.equal(measureStatus({ accept: 'REWORK' }), 'planned');
  assert.equal(measureStatus({ accept: 'FALSE' }), 'rejected');
  assert.equal(measureStatus({ accept: null }), 'proposed');
});
