import dayjs from 'dayjs';

import { buildErrandSearchQuery, escapeSearchTerm } from '@/services/support-errand-search-query';
import { formatOffsetDateTime } from '@/utils/util';

import { mockAdUsername, mockCitizenPartyId, mockPersonNumber } from './helpers/mock-data';

const FREE_TEXT_FIELDS = [
  'description',
  'title',
  'errandNumber',
  'stakeholders.firstName',
  'stakeholders.lastName',
  'stakeholders.address',
  'stakeholders.zipCode',
  'stakeholders.contactChannels.value',
  'stakeholders.organizationName',
  'stakeholders.externalId',
  'parameters.values',
];

describe('escapeSearchTerm', () => {
  it('makes every reserved character of the query syntax literal', () => {
    expect(escapeSearchTerm('a+b-c=d&e|f!g(h)i{j}k[l]m^n"o~p*q?r:s\\t/u')).toBe(
      'a\\+b\\-c\\=d\\&e\\|f\\!g\\(h\\)i\\{j\\}k\\[l\\]m\\^n\\"o\\~p\\*q\\?r\\:s\\\\t\\/u',
    );
  });

  it('drops the range characters, which cannot be escaped', () => {
    expect(escapeSearchTerm('<a>')).toBe('a');
  });
});

describe('buildErrandSearchQuery', () => {
  it('matches every errand when nothing is asked for', () => {
    expect(buildErrandSearchQuery({})).toBe('');
  });

  it('looks for the free text as a substring in each field the filter searched, every word in the same field', () => {
    const query = buildErrandSearchQuery({ query: 'Storgatan 12' });

    expect(query).toBe(`(${FREE_TEXT_FIELDS.map(field => `${field}:(*Storgatan* AND *12*)`).join(' OR ')})`);
  });

  it('strips the free text the way the filter did and escapes what is left', () => {
    const query = buildErrandSearchQuery({ query: ' KC-2601 (0001) ' });

    expect(query).toContain('errandNumber:(*KC\\-2601* AND *0001*)');
  });

  it('adds nothing for a free text with nothing searchable left', () => {
    expect(buildErrandSearchQuery({ query: '()*' })).toBe('');
  });

  it('also matches the party id the free text names', () => {
    const query = buildErrandSearchQuery({ query: mockPersonNumber, partyId: mockCitizenPartyId });

    expect(query.startsWith(`(description:(*${mockPersonNumber}*) OR `)).toBe(true);
    expect(query.endsWith(` OR stakeholders.externalId:(*${mockCitizenPartyId.replaceAll('-', '\\-')}*))`)).toBe(true);
  });

  it('finds the errands assigned to a user, and those they reported that nobody holds', () => {
    expect(buildErrandSearchQuery({ stakeholders: mockAdUsername })).toBe(
      `(assignedUserId:"${mockAdUsername}" OR (reporterUserId:"${mockAdUsername}" AND NOT _exists_:assignedUserId))`,
    );
  });

  it('asks for any one of the values of a comma-separated criterion', () => {
    expect(buildErrandSearchQuery({ priority: 'HIGH,LOW' })).toBe('priority:("HIGH" OR "LOW")');
    expect(buildErrandSearchQuery({ category: 'SALARY' })).toBe('category:("SALARY")');
    expect(buildErrandSearchQuery({ type: 'SALARY.UNCATEGORIZED' })).toBe('type:("SALARY.UNCATEGORIZED")');
    expect(buildErrandSearchQuery({ status: 'NEW,ONGOING,SOLVED' })).toBe('status:("NEW" OR "ONGOING" OR "SOLVED")');
  });

  it('takes channel and resolution as single values, as the filter does', () => {
    expect(buildErrandSearchQuery({ channel: 'EMAIL' })).toBe('channel:("EMAIL")');
    expect(buildErrandSearchQuery({ resolution: 'INFORMED' })).toBe('resolution:("INFORMED")');
  });

  it('quotes values so they cannot change the query around them', () => {
    expect(buildErrandSearchQuery({ status: 'NEW") OR (status:"SOLVED' })).toBe('status:("NEW\\") OR (status:\\"SOLVED")');
  });

  it('asks for one label of every group, by id', () => {
    expect(buildErrandSearchQuery({ labelIdGroups: [['hsl-id', 'sol-id'], ['deviation-id']] })).toBe(
      'labels.metadataLabelId:("hsl-id" OR "sol-id") AND labels.metadataLabelId:("deviation-id")',
    );
  });

  it('covers whole days of the creation range, either end left open', () => {
    const startOfDay = formatOffsetDateTime(dayjs('2026-01-15').startOf('day'));
    const endOfDay = formatOffsetDateTime(dayjs('2026-01-15').endOf('day'));

    expect(buildErrandSearchQuery({ start: '2026-01-15' })).toBe(`created:["${startOfDay}" TO *]`);
    expect(buildErrandSearchQuery({ end: '2026-01-15' })).toBe(`created:[* TO "${endOfDay}"]`);
    expect(buildErrandSearchQuery({ start: '2026-01-15', end: '2026-01-15' })).toBe(`created:["${startOfDay}" TO "${endOfDay}"]`);
  });

  it('requires every criterion it is given', () => {
    expect(buildErrandSearchQuery({ priority: 'HIGH', channel: 'EMAIL', status: 'NEW' })).toBe(
      'priority:("HIGH") AND channel:("EMAIL") AND status:("NEW")',
    );
  });
});
