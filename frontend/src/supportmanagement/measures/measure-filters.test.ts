import { expect, test } from 'vitest';

import { measureDecision } from './measure-decision';
import {
  emptyMeasureFilters,
  filterMeasures,
  isMeasureFilterActive,
  measureFilterOptions,
  measureStatus,
} from './measure-filters';

const types = [
  { id: 't-education', name: 'EDUCATION', displayName: 'Utbildningsinsats', measureGroups: ['PREVENTIVE'] },
  { id: 't-routine', name: 'ROUTINE', displayName: 'Översyn/uppdatering av rutin', measureGroups: ['PREVENTIVE'] },
];
const roles = [
  { name: 'UNIT_MANAGER', displayName: 'Enhetschef' },
  { name: 'LEX_INVESTIGATOR', displayName: 'Lex Sarah' },
];
const measures = [
  {
    id: '1',
    type: 'EDUCATION',
    description: 'Utbildning i dokumentation',
    goal: 'Korrekt journal',
    plannedStart: '2026-09-12T00:00:00Z',
    addedByRole: 'LEX_INVESTIGATOR',
    responsibleUser: 'Max',
  },
  {
    id: '2',
    type: 'ROUTINE',
    description: 'Rutinen ses över',
    goal: 'Samma rutin',
    executed: '2026-09-08T00:00:00Z',
    addedByRole: 'UNIT_MANAGER',
    accept: 'TRUE',
  },
  {
    id: '3',
    type: 'EDUCATION',
    description: 'Kompetens',
    goal: 'Mer kunskap',
    addedByRole: 'LEX_INVESTIGATOR',
    accept: 'REWORK',
    acceptMotivation: 'Endast dokumentationsutbildningen ska genomföras.',
  },
];

test('classifies status and decision the way the cards label them', () => {
  expect(measures.map(measureStatus)).toEqual(['planned', 'executed', 'unscheduled']);
  expect(measures.map(measureDecision)).toEqual(['proposal', 'accepted', 'rework']);
  expect(measureDecision({ accept: 'SOMETHING_NEW' })).toBeUndefined();
});

test('filters combine and free text searches type, description, goal and responsible', () => {
  const ids = (filters: Partial<typeof emptyMeasureFilters>) =>
    filterMeasures(measures, { ...emptyMeasureFilters, ...filters }, types).map((measure) => measure.id);
  expect(ids({})).toEqual(['1', '2', '3']);
  expect(ids({ status: 'planned' })).toEqual(['1']);
  expect(ids({ decision: 'proposal' })).toEqual(['1']);
  expect(ids({ role: 'LEX_INVESTIGATOR' })).toEqual(['1', '3']);
  expect(ids({ role: 'LEX_INVESTIGATOR', decision: 'rework' })).toEqual(['3']);
  expect(ids({ type: 'EDUCATION', text: 'kunskap' })).toEqual(['3']);
  expect(ids({ text: 'UTBILDNINGS' })).toEqual(['1', '3']);
  expect(ids({ text: 'max' })).toEqual(['1']);
  expect(ids({ text: 'dokumentationsutbildningen' })).toEqual(['3']);
  expect(ids({ text: '   ' })).toEqual(['1', '2', '3']);
});

test('offers only roles and types that occur in the list, sorted by label', () => {
  expect(measureFilterOptions(measures.slice(0, 2), types, roles)).toEqual({
    roles: [
      { value: 'UNIT_MANAGER', label: 'Enhetschef' },
      { value: 'LEX_INVESTIGATOR', label: 'Lex Sarah' },
    ],
    types: [
      { value: 'EDUCATION', label: 'Utbildningsinsats' },
      { value: 'ROUTINE', label: 'Översyn/uppdatering av rutin' },
    ],
  });
  expect(isMeasureFilterActive(emptyMeasureFilters)).toBe(false);
  expect(isMeasureFilterActive({ ...emptyMeasureFilters, text: ' ' })).toBe(false);
  expect(isMeasureFilterActive({ ...emptyMeasureFilters, status: 'executed' })).toBe(true);
});
