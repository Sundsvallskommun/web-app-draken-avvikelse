// @vitest-environment jsdom
import { getRjsfSchema, getUiSchemaForSchema } from '@common/components/json/utils/schema-utils';
import type { JsonNode, JsonParameter } from '@common/data-contracts/supportmanagement/data-contracts';
import type { RJSFSchema } from '@rjsf/utils';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { JsonParametersDisplay } from './json-parameters-display.component';

vi.mock('@common/components/json/utils/schema-utils', () => ({
  getRjsfSchema: vi.fn(),
  getUiSchemaForSchema: vi.fn(),
}));
vi.mock('../fields/facility-search-field.componant', () => ({ FacilitySearchField: () => null }));
// The real editor is Quill behind next/dynamic; what it is handed is what this display decides.
vi.mock('@common/components/dynamic-text-editor', () => ({
  default: ({ name, value }: { name: string; value: { markup: string } }) => (
    <div data-testid={`editor-${name}`}>{value.markup}</div>
  ),
}));

beforeEach(() => {
  vi.mocked(getRjsfSchema).mockReset();
  vi.mocked(getUiSchemaForSchema).mockReset().mockResolvedValue({});
});
afterEach(cleanup);

test('shows loading before a schema failure and then explains which document could not be displayed', async () => {
  let fail: (error: Error) => void = () => {
    throw new Error('Request not started');
  };
  vi.mocked(getRjsfSchema).mockReturnValue(
    new Promise((_, reject) => {
      fail = reject;
    })
  );
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    render(
      <JsonParametersDisplay
        municipalityId="2281"
        jsonParameters={[{ key: 'Document', schemaId: 'schema-id', value: {} }]}
      />
    );
    expect(screen.getByText('Laddar schema...')).toBeTruthy();
    expect(screen.queryByText(/kunde inte visas/)).toBeNull();
    await act(async () => {
      fail(new Error('Schema unavailable'));
    });
    expect(await screen.findByText(/Uppgifterna för Document kunde inte visas/)).toBeTruthy();
  } finally {
    errorLog.mockRestore();
  }
});

test('displays the saved data read-only when the optional UI schema is unavailable', async () => {
  const schema: RJSFSchema = { type: 'object', properties: { answer: { type: 'string', title: 'Svar' } } };
  // The shared display must still accept the existing Support Management API contract.
  // The generated contract types value as Jackson's JsonNode, but the API sends the saved form data as plain JSON.
  const savedFormData = { answer: 'Sparat svar' } as unknown as JsonNode;
  const jsonParameters: JsonParameter[] = [{ key: 'Document', schemaId: 'schema-id', value: savedFormData }];
  vi.mocked(getRjsfSchema).mockResolvedValue(schema);
  vi.mocked(getUiSchemaForSchema).mockRejectedValue(new Error('No UI schema'));
  render(<JsonParametersDisplay municipalityId="2281" jsonParameters={jsonParameters} />);
  const input = await screen.findByDisplayValue('Sparat svar');
  expect(input.hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Lägg till' })).toBeNull();
  expect(screen.queryByText(/kunde inte visas/)).toBeNull();
});

test('shows a plain-text answer with the line breaks it was written with', async () => {
  const schema: RJSFSchema = {
    type: 'object',
    properties: {
      event: { type: 'string', title: 'Beskriv händelsen' },
      oneLine: { type: 'string', title: 'Förslag' },
      markup: { type: 'string', title: 'Utredningstext', contentMediaType: 'text/html' },
      editorText: { type: 'string', title: 'Skriven i redigeraren' },
    },
  };
  vi.mocked(getRjsfSchema).mockResolvedValue(schema);
  vi.mocked(getUiSchemaForSchema).mockResolvedValue({
    event: { 'ui:widget': 'textarea' },
    oneLine: { 'ui:widget': 'textarea' },
    markup: { 'ui:widget': 'textarea' },
    editorText: { 'ui:widget': 'textarea' },
  });
  const value = {
    event: 'Brukaren föll.\n\nPersonalen var inte på plats < 5 minuter.',
    oneLine: 'En rad',
    // Declared as HTML, so it is markup whatever it looks like.
    markup: 'rad ett\nrad två',
    editorText: '<p>Redan\nmarkup</p>',
  } as unknown as JsonNode;
  render(<JsonParametersDisplay municipalityId="2281" jsonParameters={[{ key: 'report', schemaId: 'id', value }]} />);

  expect((await screen.findByTestId('editor-report_event')).textContent).toBe(
    '<p>Brukaren föll.</p><p><br></p><p>Personalen var inte på plats &lt; 5 minuter.</p>'
  );
  expect(screen.getByTestId('editor-report_oneLine').textContent).toBe('En rad');
  expect(screen.getByTestId('editor-report_markup').textContent).toBe('rad ett\nrad två');
  expect(screen.getByTestId('editor-report_editorText').textContent).toBe('<p>Redan\nmarkup</p>');
});

// Ä4. The schema's instructions are written for whoever fills the form in - Katla's reporter, for one.
test('shows the saved answers without the descriptions and help texts that told how to give them', async () => {
  const schema: RJSFSchema = {
    type: 'object',
    properties: {
      place: { type: 'string', title: 'Plats', description: 'Beskrivning från schemat' },
      other: { type: 'string', title: 'Övrigt' },
    },
  };
  vi.mocked(getRjsfSchema).mockResolvedValue(schema);
  vi.mocked(getUiSchemaForSchema).mockResolvedValue({
    place: { 'ui:help': 'Ange vilken enhet eller avdelning händelsen inträffade' },
    other: { 'ui:description': 'Beskrivning från UI-schemat' },
  });
  const value = { place: 'Hemtjänst Norr', other: 'Inget' } as unknown as JsonNode;
  render(<JsonParametersDisplay municipalityId="2281" jsonParameters={[{ key: 'report', schemaId: 'id', value }]} />);

  expect(await screen.findByDisplayValue('Hemtjänst Norr')).toBeTruthy();
  expect(screen.getByText('Plats')).toBeTruthy();
  expect(screen.queryByText('Ange vilken enhet eller avdelning händelsen inträffade')).toBeNull();
  expect(screen.queryByText('Beskrivning från schemat')).toBeNull();
  expect(screen.queryByText('Beskrivning från UI-schemat')).toBeNull();
});

// The instructions of a collection and of a grouped answer are as much for whoever fills the form in.
test('leaves out the instructions of collections and grouped answers as well', async () => {
  const schema: RJSFSchema = {
    type: 'object',
    properties: {
      participants: {
        type: 'array',
        title: 'Deltagare',
        items: { type: 'object', title: 'Person', properties: { name: { type: 'string', title: 'Namn' } } },
      },
      details: {
        type: 'object',
        title: 'Detaljer',
        description: 'Beskriv detaljerna i händelsen',
        properties: { where: { type: 'string', title: 'Var' } },
      },
    },
  };
  vi.mocked(getRjsfSchema).mockResolvedValue(schema);
  vi.mocked(getUiSchemaForSchema).mockResolvedValue({
    participants: { 'ui:options': { description: 'Lägg till alla som deltog' } },
    details: { 'ui:options': { showObjectFieldset: true } },
  });
  const value = { participants: [{ name: 'Anna Andersson' }], details: { where: 'Korridoren' } } as unknown as JsonNode;
  render(<JsonParametersDisplay municipalityId="2281" jsonParameters={[{ key: 'report', schemaId: 'id', value }]} />);

  expect(await screen.findByDisplayValue('Anna Andersson')).toBeTruthy();
  expect(screen.getByDisplayValue('Korridoren')).toBeTruthy();
  expect(screen.getByText('Deltagare')).toBeTruthy();
  expect(screen.getByText('Detaljer')).toBeTruthy();
  expect(screen.queryByText('Lägg till alla som deltog')).toBeNull();
  expect(screen.queryByText('Beskriv detaljerna i händelsen')).toBeNull();
});
