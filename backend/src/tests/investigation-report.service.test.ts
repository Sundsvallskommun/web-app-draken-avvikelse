import type { JsonSchema } from '@/data-contracts/jsonschema/data-contracts';
import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';
import { buildInvestigationReportModel, EMPTY_VALUE, investigationReportFileName } from '@/services/investigation-report.service';
import { INVESTIGATION_REPORT_TEMPLATE, renderInvestigationReportTemplate } from '@/services/investigation-report.template';
import type { JsonObject } from '@/services/schema-bound-json.service';

const schema = {
  id: '2281_utredning-test_1.0',
  name: 'utredning-test',
  version: '1.0',
  value: {
    title: 'Utredning test',
    type: 'object',
    'x-draken-completion': { field: 'completed', reportsField: 'reports' },
    properties: {
      legalBases: {
        title: 'Lagrum',
        type: 'array',
        items: {
          type: 'string',
          oneOf: [
            { const: 'HSL', title: 'HSL' },
            { const: 'SOL', title: 'SoL' },
          ],
        },
      },
      eventDescription: { title: 'Händelsebeskrivning', type: 'string', contentMediaType: 'text/html' },
      individualNotified: { title: 'Är den enskilde underrättad?', $ref: '#/$defs/yesNo' },
      participants: {
        title: 'Deltagare',
        type: 'array',
        items: { type: 'object', properties: { role: { title: 'Roll', type: 'string' }, unit: { title: 'Enhet', type: 'string' } } },
      },
      risk: {
        title: 'Riskbedömning',
        type: 'object',
        properties: {
          probability: { title: 'Sannolikhet', type: 'integer' },
          calculatedRiskValue: { title: 'Riskvärde', type: 'integer', readOnly: true },
        },
      },
      note: { title: 'Anteckning', type: 'string' },
      completed: { title: 'Är utredningen klar?', $ref: '#/$defs/yesNo' },
      reports: { title: 'Rapporter', type: 'array', 'x-draken-server-owned': true, items: { type: 'object' } },
      decidedAt: { title: 'Beslutat', type: 'string', 'x-draken-server-timestamp': 'created' },
      unplaced: { title: 'Oplacerat fält', type: 'string' },
    },
    $defs: {
      yesNo: {
        type: 'string',
        oneOf: [
          { const: 'yes', title: 'Ja' },
          { const: 'no', title: 'Nej' },
        ],
      },
    },
  },
} as unknown as JsonSchema;

const uiSchema = {
  'ui:sections': [
    { id: 'a', title: 'Kategorisering', fields: ['legalBases', '$external:errandClassification', 'individualNotified'] },
    { id: 'b', title: 'Händelsen', fields: ['eventDescription', 'participants', 'risk', 'note'] },
    { id: 'c', title: 'Rapport', fields: ['completed', '$external:investigationReport', 'reports', 'decidedAt'] },
  ],
  note: { 'ui:widget': 'hidden' },
};

const errand: Errand = {
  errandNumber: 'IAF-2026-0001',
  title: 'Avvikelse på boendet',
  labels: [
    { classification: 'PROVISION', resourceName: 'HSL', displayName: 'HSL' },
    { classification: 'PROVISION', resourceName: 'SOL', displayName: 'SoL' },
    { classification: 'REPORT_TYPE', resourceName: 'DEVIATION', displayName: 'Avvikelse' },
    { classification: 'CATEGORY', resourceName: 'REHAB', displayName: 'Rehab' },
    { classification: 'TYPE', resourceName: 'ASSESSMENT', displayName: 'Utebliven bedömning' },
  ],
} as Errand;

const build = (value: JsonObject) =>
  buildInvestigationReportModel({
    schema,
    uiSchema,
    value,
    errand,
    definition: { tabLabel: 'Utredning test', ownerLabel: 'Enhetschef' },
    sequence: 2,
    generatedAt: '2026-09-11 14:30',
    generatedBy: 'Test Testsson',
  });

describe('investigation report model', () => {
  it('renders every placed field under its section with codes translated and nothing from the errand but its number', () => {
    const model = build({
      legalBases: ['HSL', 'SOL'],
      eventDescription: '<p>Fall i duschen.</p>',
      individualNotified: 'yes',
      participants: [{ role: 'Analysledare', unit: 'MAS' }],
      risk: { probability: 2, calculatedRiskValue: 4 },
      completed: 'yes',
      reports: [{ fileName: 'x' }],
      decidedAt: '2026-01-01T00:00:00Z',
      unplaced: 'kvar',
    });

    expect(model.errand).toEqual({ errandNumber: 'IAF-2026-0001' });
    expect(model.title).toBe('Utredning test');
    expect(model.sequence).toBe(2);
    expect(model.sections.map(section => section.title)).toEqual(['Kategorisering', 'Händelsen', 'Övrigt']);
    expect(model.sections[0].fields).toEqual([
      { label: 'Lagrum', kind: 'list', items: ['HSL', 'SoL'] },
      { label: 'Är den enskilde underrättad?', kind: 'text', text: 'Ja' },
    ]);
    expect(model.sections[1].fields).toEqual([
      { label: 'Händelsebeskrivning', kind: 'html', html: '<p>Fall i duschen.</p>' },
      { label: 'Deltagare', kind: 'table', columns: ['Roll', 'Enhet'], rows: [['Analysledare', 'MAS']] },
      {
        label: 'Riskbedömning',
        kind: 'group',
        fields: [
          { label: 'Sannolikhet', kind: 'text', text: '2' },
          { label: 'Riskvärde', kind: 'text', text: '4' },
        ],
      },
    ]);
    // The completion fields, server-owned values and stamps are not part of the report; a
    // property the UI schema never placed is reported last.
    expect(model.sections[2].fields).toEqual([{ label: 'Oplacerat fält', kind: 'text', text: 'kvar' }]);
  });

  it('leaves a group the document does not hold out of the report, and reports one that is begun', () => {
    // A risk assessment that was never part of the investigation is not listed as unanswered questions.
    expect(build({ eventDescription: '<p>x</p>' }).sections[1].fields.map(field => field.label)).toEqual(['Händelsebeskrivning', 'Deltagare']);
    expect(build({ risk: { probability: 2 } }).sections[1].fields.at(-1)).toEqual({
      label: 'Riskbedömning',
      kind: 'group',
      fields: [
        { label: 'Sannolikhet', kind: 'text', text: '2' },
        { label: 'Riskvärde', kind: 'text', text: EMPTY_VALUE },
      ],
    });
  });

  it('reports missing answers as not given rather than dropping the field', () => {
    const model = build({});
    expect(model.sections[0].fields[0]).toEqual({ label: 'Lagrum', kind: 'list', items: [] });
    expect(model.sections[0].fields[1]).toEqual({ label: 'Är den enskilde underrättad?', kind: 'text', text: EMPTY_VALUE });
    expect(model.sections[1].fields[0]).toEqual({ label: 'Händelsebeskrivning', kind: 'text', text: EMPTY_VALUE });
    expect(model.sections[2].fields[0]).toEqual({ label: 'Oplacerat fält', kind: 'text', text: EMPTY_VALUE });
    expect(
      buildInvestigationReportModel({
        schema,
        uiSchema,
        value: {},
        errand: {} as Errand,
        definition: { tabLabel: 'T', ownerLabel: 'O' },
        sequence: 1,
        generatedAt: '',
        generatedBy: '',
      }).errand,
    ).toEqual({ errandNumber: EMPTY_VALUE });
  });

  it.each([
    ['Utredning Lex Sarah', 'Utredning_Lex_Sarah_2.pdf'],
    ['Händelseanalys HSL', 'Handelseanalys_HSL_2.pdf'],
    ['Utredning SoL/LSS', 'Utredning_SoL_LSS_2.pdf'],
    ['  Åtgärd\tÖversyn\u00a0 HSL  ', 'Atgard_Oversyn_HSL_2.pdf'],
    ['Ha\u0308ndelseanalys HSL', 'Handelseanalys_HSL_2.pdf'],
    ['../Beslut\\ "Lex":*?<>|\r\nSarah%20.pdf', 'Beslut_Lex_Sarah_20_pdf_2.pdf'],
    ['___', 'Utredning_2.pdf'],
  ])('normalizes %j into an ASCII attachment name', (label, expected) => {
    expect(investigationReportFileName(label, 2)).toBe(expected);
  });

  it('expands the field fragment into the template with one loop variable per nesting level', () => {
    const template = renderInvestigationReportTemplate();
    expect(INVESTIGATION_REPORT_TEMPLATE).toContain('{% include "field"');
    expect(template).not.toContain('{% include');
    expect(template).not.toContain('__NESTED__');
    expect(template).toContain('{% for field2 in field.fields %}');
    expect(template).toContain('{% for field3 in field2.fields %}');
    expect(template).toContain('{{ field.html | raw }}');
    expect(template).toContain('{{ field3.label }}');
  });
});
