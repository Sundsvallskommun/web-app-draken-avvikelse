import type { Measure, MeasureType, Role } from '@/data-contracts/supportmanagement/data-contracts';
import {
  buildMeasureActionPlanModel,
  formatActionPlanDate,
  formatActionPlanTimestamp,
  measureActionPlanFileName,
  nextMeasureActionPlanSequence,
} from '@/services/measure-action-plan.service';
import { MEASURE_ACTION_PLAN_TEMPLATE } from '@/services/measure-action-plan.template';

import { mockAdUsername, mockSupportErrandNumber } from './helpers/mock-data';

const educationId = 'dd000000-0000-4000-8000-000000000100';
const measureTypes: MeasureType[] = [{ id: educationId, name: 'EDUCATION', displayName: 'Utbildning', measureGroups: ['PREVENTIVE'] }];
const roles: Role[] = [{ name: 'MANAGER', displayName: 'Enhetschef' }];
const displayName = (username: string) => (username === mockAdUsername ? 'Anna Andersson' : undefined);

const executed: Measure = {
  id: 'm-1',
  type: 'EDUCATION',
  addedByUser: mockAdUsername,
  addedByRole: 'MANAGER',
  accept: 'TRUE',
  acceptMotivation: '  Genomförs enligt plan.  ',
  description: 'Gemensam utbildning\nför alla team',
  goal: 'Säkrare arbetssätt',
  responsibleUser: 'Erik',
  plannedStart: '2026-09-01T00:00:00+02:00',
  executed: '2026-09-09T00:00:00+02:00',
  created: '2026-09-07T22:30:00Z',
};
const planned: Measure = {
  id: 'm-2',
  type: 'RETIRED_TYPE',
  addedByUser: 'someone.else',
  addedByRole: 'UNKNOWN_ROLE',
  description: 'Ny rutin',
  goal: 'Färre fall',
  plannedStart: '2026-09-08T00:00:00+02:00',
  plannedComplete: '2026-09-10T00:00:00+02:00',
};
const unscheduled: Measure = { id: 'm-3', addedByRole: 'MANAGER', accept: 'FALSE', acceptMotivation: 'Ingår redan i ordinarie arbete.' };

describe('buildMeasureActionPlanModel', () => {
  it('lists every measure in stored order with the tab wording for timing, decision and attribution', () => {
    const model = buildMeasureActionPlanModel({
      measures: [executed, planned, unscheduled],
      measureTypes,
      roles,
      errand: { errandNumber: mockSupportErrandNumber, title: '  Fall i duschen ' },
      sequence: 2,
      generatedAt: '2026-09-11 14:30',
      generatedBy: 'Anna Andersson',
      displayName,
    });

    expect(model).toMatchObject({
      title: 'Handlingsplan',
      sequence: 2,
      generatedAt: '2026-09-11 14:30',
      generatedBy: 'Anna Andersson',
      errand: { errandNumber: mockSupportErrandNumber, title: 'Fall i duschen' },
      counts: { total: 3, executed: 1, planned: 1, unscheduled: 1 },
    });
    expect(model.measures).toEqual([
      {
        number: 1,
        type: 'Utbildning',
        status: 'Genomförd',
        dates: '2026-09-09',
        decision: 'Godkänd',
        decisionCommentLabel: 'Motivering till godkännande',
        decisionComment: 'Genomförs enligt plan.',
        responsible: 'Erik',
        goal: 'Säkrare arbetssätt',
        description: 'Gemensam utbildning\nför alla team',
        registeredBy: 'Anna Andersson (Enhetschef)',
        created: '2026-09-08',
      },
      {
        number: 2,
        // An unknown type id falls back to the stored type name; an unknown role and account stay as stored.
        type: 'RETIRED_TYPE',
        status: 'Planerad',
        dates: '2026-09-08 – 2026-09-10',
        decision: 'Förslag',
        decisionCommentLabel: 'Beslutskommentar',
        decisionComment: '',
        responsible: 'Ej angivet',
        goal: 'Färre fall',
        description: 'Ny rutin',
        registeredBy: 'someone.else (UNKNOWN_ROLE)',
        created: '',
      },
      {
        number: 3,
        type: 'Typ saknas',
        status: 'Ej tidsatt',
        dates: 'Ej angivet',
        decision: 'Avslagen',
        decisionCommentLabel: 'Motivering till avslag',
        decisionComment: 'Ingår redan i ordinarie arbete.',
        responsible: 'Ej angivet',
        goal: 'Ej angivet',
        description: 'Ej angivet',
        registeredBy: 'Enhetschef',
        created: '',
      },
    ]);
  });

  it('shows a partial approval and an unknown decision value without inventing a meaning', () => {
    const model = buildMeasureActionPlanModel({
      measures: [
        { ...planned, accept: 'REWORK', acceptMotivation: 'Endast dokumentationsdelen.' },
        { ...planned, accept: 'MAYBE' },
        { ...planned, plannedStart: '2026-09-08T00:00:00+02:00', plannedComplete: '2026-09-08T00:00:00+02:00' },
      ],
      measureTypes,
      roles,
      errand: {},
      sequence: 1,
      generatedAt: '2026-09-11 14:30',
      generatedBy: 'Anna Andersson',
    });

    expect(model.errand).toEqual({ errandNumber: 'Ej angivet', title: '' });
    expect(model.measures.map(measure => [measure.decision, measure.decisionCommentLabel, measure.decisionComment])).toEqual([
      ['Delvis godkänd', 'Detta ska justeras', 'Endast dokumentationsdelen.'],
      ['MAYBE', 'Beslutskommentar', ''],
      ['Förslag', 'Beslutskommentar', ''],
    ]);
    // A plan with the same start and end shows one date, as the tab does.
    expect(model.measures[2].dates).toBe('2026-09-08');
    // Without a directory the stored account is shown as it is.
    expect(model.measures[0].registeredBy).toBe('someone.else (UNKNOWN_ROLE)');
  });
});

describe('date formatting', () => {
  it('formats instants in Swedish local time and leaves unparsable values as stored', () => {
    expect(formatActionPlanDate('2026-09-07T22:30:00Z')).toBe('2026-09-08');
    expect(formatActionPlanDate('2026-01-15T23:30:00Z')).toBe('2026-01-16');
    expect(formatActionPlanDate('not a date')).toBe('not a date');
    expect(formatActionPlanDate(undefined)).toBeUndefined();
    expect(formatActionPlanTimestamp(new Date('2026-09-11T12:30:00.000Z'))).toBe('2026-09-11 14:30');
    expect(formatActionPlanTimestamp(new Date('2026-01-15T23:05:00.000Z'))).toBe('2026-01-16 00:05');
  });
});

describe('action plan attachment names', () => {
  it('numbers the next plan after the highest one already attached, ignoring other attachments', () => {
    expect(nextMeasureActionPlanSequence([])).toBe(1);
    expect(
      nextMeasureActionPlanSequence([
        { fileName: 'Handlingsplan_KC-2026-000001_2.pdf' },
        { fileName: 'Handlingsplan_1.pdf' },
        { fileName: 'Utredning_HSL_9.pdf' },
        { fileName: 'handlingsplan_gammal_5.PDF' },
        { fileName: 'Handlingsplan_KC-2026-000001_x.pdf' },
        {},
      ]),
    ).toBe(6);
  });

  it('builds ASCII file names from the errand number and round-trips through the sequence reader', () => {
    expect(measureActionPlanFileName(mockSupportErrandNumber, 3)).toBe(`Handlingsplan_${mockSupportErrandNumber}_3.pdf`);
    expect(measureActionPlanFileName('Ärende Å 1/2', 1)).toBe('Handlingsplan_Arende_A_1_2_1.pdf');
    expect(measureActionPlanFileName(undefined, 1)).toBe('Handlingsplan_1.pdf');
    expect(measureActionPlanFileName('   ', 4)).toBe('Handlingsplan_4.pdf');
    const attached = [{ fileName: measureActionPlanFileName(mockSupportErrandNumber, 3) }];
    expect(nextMeasureActionPlanSequence(attached)).toBe(4);
  });
});

describe('MEASURE_ACTION_PLAN_TEMPLATE', () => {
  it('places the plan model and hides fields the model left empty', () => {
    expect(MEASURE_ACTION_PLAN_TEMPLATE).toContain('{{ plan.title }}');
    expect(MEASURE_ACTION_PLAN_TEMPLATE).toContain('{% for measure in plan.measures %}');
    expect(MEASURE_ACTION_PLAN_TEMPLATE).toContain('{% if measure.decisionComment != "" %}');
    expect(MEASURE_ACTION_PLAN_TEMPLATE).toContain('{% if plan.errand.title != "" %}');
    expect(MEASURE_ACTION_PLAN_TEMPLATE).toContain('{{ plan.counts.total }}');
    // Every value is plain text: nothing is rendered raw, so Pebble's escaping covers the whole plan.
    expect(MEASURE_ACTION_PLAN_TEMPLATE).not.toContain('| raw');
  });
});
