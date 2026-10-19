import assert from 'node:assert/strict';

import dayjs from 'dayjs';
import { test } from 'vitest';

import {
  countFollowUpKeyFigures,
  type FollowUpKeyFigureContext,
  followUpKeyFigureLabel,
  followUpKeyFiguresOf,
} from './unit-follow-up-key-figures';

const context: FollowUpKeyFigureContext = { today: dayjs('2026-05-24'), notStartedStatuses: ['NEW'] };

test('reads report type from the label paths, and legal base from the classifying investigation', () => {
  assert.deepEqual(
    followUpKeyFiguresOf({ labelPaths: ['REPORT_TYPE/DEVIATION', 'PROVISION/SOL'], legalBases: ['HSL'] }, context),
    ['deviations', 'legalBaseHsl']
  );
  // A misconduct LEX took over carries ABUSE, and counts as reported misconduct.
  assert.deepEqual(followUpKeyFiguresOf({ labelPaths: ['REPORT_TYPE/ABUSE'], legalBases: ['LSS'] }, context), [
    'misconducts',
    'legalBaseSolLss',
  ]);
  // The legal base the report was filed under is not what the investigation found.
  assert.deepEqual(
    followUpKeyFiguresOf({ labelPaths: ['REPORT_TYPE/ADVERSE_INCIDENT', 'PROVISION/HSL'], legalBases: [] }, context),
    ['misconducts']
  );
  assert.deepEqual(followUpKeyFiguresOf({ labelPaths: [], legalBases: [] }, context), []);
});

test('an errand is not started once it has waited in its first status for more than thirty days', () => {
  const waiting = (created: string, status = 'NEW') =>
    followUpKeyFiguresOf({ labelPaths: [], legalBases: [], status, created }, context);

  assert.deepEqual(waiting('2026-04-23'), ['notStarted']);
  assert.deepEqual(waiting('2026-04-24'), []);
  assert.deepEqual(waiting('2026-01-01', 'INQUIRY'), []);
  assert.deepEqual(followUpKeyFiguresOf({ labelPaths: [], legalBases: [], status: 'NEW' }, context), []);
});

test('counts each card, and warns only while errands wait unstarted', () => {
  const figures = countFollowUpKeyFigures([
    { keyFigures: ['deviations', 'legalBaseHsl'] },
    { keyFigures: ['deviations', 'notStarted'] },
    { keyFigures: ['misconducts', 'legalBaseSolLss'] },
  ]);

  assert.deepEqual(
    figures.map(({ key, count, warning }) => [key, count, warning]),
    [
      ['deviations', 2, false],
      ['misconducts', 1, false],
      ['legalBaseHsl', 1, false],
      ['legalBaseSolLss', 1, false],
      ['notStarted', 1, true],
    ]
  );
  assert.equal(countFollowUpKeyFigures([]).find((figure) => figure.key === 'notStarted')?.warning, false);
  assert.equal(followUpKeyFigureLabel('notStarted'), 'Ej påbörjade ärenden (>30 dagar)');
});
