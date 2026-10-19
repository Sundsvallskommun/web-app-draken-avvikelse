// @vitest-environment jsdom
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ArrayObjectFieldTemplate } from '../fields/array-object-field-template.componant';
import SchemaForm from './schema-form.component';

// These tests exercise the form engine; the place API is covered separately.
vi.mock('../fields/facility-search-field.componant', () => ({ FacilitySearchField: () => null }));

beforeEach(() => {
  // jsdom has no layout or scrolling, but focus remains observable.
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const answerSchema: RJSFSchema = {
  type: 'object',
  properties: { answer: { type: 'string', title: 'Svar' } },
};

test.each([
  ['TextWidget', undefined],
  ['DateWidget', 'date'],
  ['TimeWidget', 'time'],
])('validates required %s on save without marking untouched fields invalid', async (widget, format) => {
  const onSubmit = vi.fn();
  render(
    <SchemaForm
      schema={{
        type: 'object',
        required: ['answer'],
        properties: { answer: { type: 'string', title: 'Svar', format } },
      }}
      uiSchema={{ answer: { 'ui:widget': widget } }}
      submitButtonOptions={{ label: 'Spara' }}
      onSubmit={onSubmit}
      onError={() => undefined}
    />
  );
  const input = screen.getByLabelText(/Svar/) as HTMLInputElement;
  expect(input.getAttribute('aria-required')).toBe('true');
  expect(input.getAttribute('aria-invalid')).toBe('false');
  expect(input.validity.valueMissing).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Spara' }));
  await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('keeps investigation object and array instructions in the shared templates', () => {
  render(
    <SchemaForm
      schema={{
        type: 'object',
        properties: {
          details: {
            type: 'object',
            title: 'Utredning',
            description: 'Beskriv händelsen.',
            properties: { answer: { type: 'string' } },
          },
          people: {
            type: 'array',
            title: 'Deltagare',
            description: 'Ange berörda personer.',
            items: { type: 'object', properties: { name: { type: 'string' } } },
          },
        },
      }}
      uiSchema={{ details: { 'ui:options': { showObjectFieldset: true } } }}
      readonly
    />
  );
  expect(screen.getByRole('group', { name: 'Utredning' }).textContent).toContain('Beskriv händelsen.');
  expect(screen.getByRole('group', { name: 'Deltagare' }).textContent).toContain('Ange berörda personer.');
  expect(screen.queryByRole('button', { name: 'Lägg till' })).toBeNull();
});

test.each([false, true])(
  'preserves hidden metadata without empty rows or sections (sections: %s)',
  async (sections) => {
    const onSubmit = vi.fn();
    const metadata = { savedBy: 'test-user' };
    const revisions = [{ savedBy: 'earlier-user' }];
    render(
      <SchemaForm
        schema={{
          ...answerSchema,
          properties: {
            ...answerSchema.properties,
            metadata: { type: 'object', properties: { savedBy: { type: 'string' } } },
            revisions: { type: 'array', items: { type: 'object', properties: { savedBy: { type: 'string' } } } },
            timestamp: { type: 'string' },
          },
        }}
        // The application's ui:rows layout extension differs from RJSF's numeric textarea option.
        uiSchema={
          {
            metadata: { 'ui:widget': 'hidden' },
            revisions: { 'ui:widget': 'hidden' },
            timestamp: { 'ui:widget': 'hidden' },
            'ui:rows': [{ fields: ['timestamp', 'answer'] }],
            'ui:options': { showSectionCompletion: false },
            ...(sections
              ? {
                  'ui:sections': [
                    { id: 'metadata', title: 'Dold metadata', fields: ['metadata', 'revisions'] },
                    { id: 'answer', title: 'Synlig sektion', fields: ['timestamp', 'answer'], defaultOpen: true },
                  ],
                }
              : {}),
          } as unknown as UiSchema
        }
        formData={{ metadata, revisions, timestamp: 'saved', answer: 'Bevarat svar' }}
        arrayFieldTemplate={ArrayObjectFieldTemplate}
        onSubmit={onSubmit}
      />
    );
    expect(screen.queryByRole('heading', { name: 'Dold metadata' })).toBeNull();
    expect(screen.queryByDisplayValue('test-user')).toBeNull();
    expect(screen.queryByDisplayValue('earlier-user')).toBeNull();
    expect(document.querySelectorAll('.schema-field-cell')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toEqual({ metadata, revisions, timestamp: 'saved', answer: 'Bevarat svar' });
  }
);

test.each([false, true])(
  'locks fields and hides submit while keeping adjacent actions (extra content: %s)',
  (extra) => {
    render(
      <SchemaForm
        schema={{
          type: 'object',
          properties: {
            answer: { type: 'string', title: 'Svar' },
            choice: { type: 'string', title: 'Val', enum: ['A', 'B'] },
          },
        }}
        formData={{ answer: 'Sparat', choice: 'A' }}
        readonly
        submitButtonOptions={{ label: 'Spara' }}
        submitButtonActions={<button type="button">Visa historik</button>}
        extraContent={extra ? <p>Extra information</p> : undefined}
      />
    );
    expect(screen.getByRole('textbox', { name: 'Svar' }).getAttribute('readonly')).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Val' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Spara' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Visa historik' })).toBeTruthy();
  }
);

test('adds and removes array entries while keeping the submitted values', async () => {
  const onSubmit = vi.fn();
  render(
    <SchemaForm
      schema={{
        type: 'object',
        properties: {
          people: {
            type: 'array',
            title: 'Deltagare',
            items: {
              type: 'object',
              title: 'Deltagare',
              properties: { name: { type: 'string', title: 'Namn' } },
            },
          },
        },
      }}
      submitButtonOptions={{ label: 'Spara' }}
      onSubmit={onSubmit}
    />
  );
  expect(screen.getByText('Inga poster har lagts till.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Namn' }), { target: { value: 'Anna' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Namn' })[1], { target: { value: 'Bertil' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ta bort deltagare 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Spara' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  expect(onSubmit.mock.calls[0][0]).toEqual({ people: [{ name: 'Bertil' }] });
});

test('submits editable forms with extra content and a configured save button', async () => {
  const onSubmit = vi.fn();
  render(
    <SchemaForm
      schema={answerSchema}
      extraContent={<p>Giltighet</p>}
      submitButtonOptions={{ label: 'Spara insats', leadingIcon: false }}
      onSubmit={onSubmit}
    />
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Svar' }), { target: { value: 'Ny insats' } });
  fireEvent.click(screen.getByRole('button', { name: 'Spara insats' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  expect(onSubmit.mock.calls[0][0]).toEqual({ answer: 'Ny insats' });
  expect(screen.getByText('Giltighet')).toBeTruthy();
});

test('displays labels for saved combobox selections in a locked form', () => {
  render(
    <SchemaForm
      schema={{
        type: 'object',
        properties: {
          choices: {
            type: 'array',
            title: 'Val',
            uniqueItems: true,
            items: {
              type: 'string',
              oneOf: [
                { const: 'a', title: 'Första' },
                { const: 'b', title: 'Andra' },
              ],
            },
          },
        },
      }}
      formData={{ choices: ['a', 'b'] }}
      readonly
    />
  );
  expect(screen.getByDisplayValue('Första, Andra').hasAttribute('readonly')).toBe(true);
});

test('opens a closed section and focuses the field selected in the error summary', async () => {
  render(
    <SchemaForm
      schema={answerSchema}
      idPrefix="document"
      uiSchema={{ 'ui:sections': [{ id: 'answers', title: 'Uppgifter', fields: ['answer'], defaultOpen: false }] }}
      validationErrors={[
        { fieldId: 'document_answer', ancestorIds: [], label: 'Svar', message: 'Vänligen ange Svar.' },
      ]}
    />
  );
  expect(screen.queryByRole('textbox', { name: 'Svar' })).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Svar: Vänligen ange Svar.' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Svar' })));
});

test('opens only the section that encloses the error field, not one whose field name is a prefix of it', async () => {
  render(
    <SchemaForm
      schema={{
        type: 'object',
        properties: {
          risk: { type: 'string', title: 'Risk' },
          risk_level: { type: 'object', properties: { value: { type: 'string', title: 'Risknivå' } } },
        },
      }}
      idPrefix="document"
      uiSchema={{
        'ui:sections': [
          { id: 'risk', title: 'Risk', fields: ['risk'], defaultOpen: false },
          { id: 'level', title: 'Nivå', fields: ['risk_level'], defaultOpen: false },
        ],
      }}
      validationErrors={[
        {
          fieldId: 'document_risk_level_value',
          ancestorIds: ['document_risk_level'],
          label: 'Risknivå',
          message: 'Vänligen ange Risknivå.',
        },
      ]}
    />
  );
  fireEvent.click(screen.getByRole('link', { name: 'Risknivå: Vänligen ange Risknivå.' }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Risknivå' })));
  expect(screen.queryByRole('textbox', { name: 'Risk' })).toBeNull();
});

test('respects conditional choices and renders schema-positioned external fields', () => {
  render(
    <SchemaForm
      schema={{
        type: 'object',
        properties: {
          choice: { type: 'string', title: 'Val', enum: ['yes', 'no'] },
          details: { type: 'string', title: 'Beskrivning' },
        },
        allOf: [
          { if: { properties: { choice: { enum: ['yes'] } }, required: ['choice'] }, then: { required: ['details'] } },
        ],
      }}
      uiSchema={{ 'ui:order': ['choice', '$external:classification', 'details'] }}
      externalFields={{ classification: <p>Extern klassificering</p> }}
    />
  );
  expect(screen.queryByRole('textbox', { name: /Beskrivning/ })).toBeNull();
  expect(screen.getByText('Extern klassificering')).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Val' }), { target: { value: 'yes' } });
  expect(screen.getByRole('textbox', { name: /Beskrivning/ })).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Val' }), { target: { value: 'no' } });
  expect(screen.queryByRole('textbox', { name: /Beskrivning/ })).toBeNull();
});

test.each([false, true])(
  'renders an external control once at the root and preserves nested data (explicit placement: %s)',
  async (explicitPlacement) => {
    const onSubmit = vi.fn();
    const formData = { details: { answer: 'Svar' }, people: [{ name: 'Anna' }, { name: 'Bertil' }] };
    const view = render(
      <SchemaForm
        schema={{
          type: 'object',
          properties: {
            details: { type: 'object', properties: { answer: { type: 'string' } } },
            people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
          },
        }}
        idPrefix="document"
        formData={formData}
        uiSchema={{
          'ui:order': explicitPlacement ? ['$external:classification', '*', 'people'] : ['*', 'people'],
        }}
        externalFields={{ classification: <button type="button">Extern klassificering</button> }}
        submitButtonOptions={{ label: 'Spara' }}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getAllByRole('button', { name: 'Extern klassificering' })).toHaveLength(1);
    const fieldOrder = Array.from(
      view.container.querySelectorAll(
        '#document_details__field, #document_people__field, [data-cy="schema-external-field-classification"]'
      )
    ).map((element) => element.id || 'external');
    expect(fieldOrder).toEqual(
      explicitPlacement
        ? ['external', 'document_details__field', 'document_people__field']
        : ['document_details__field', 'document_people__field', 'external']
    );
    fireEvent.click(screen.getByRole('button', { name: 'Spara' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toEqual(formData);
  }
);

test.each([
  { order: undefined, expected: ['root_first', 'external', 'root_last'] },
  { order: ['first', 'last'], expected: ['root_first', 'external', 'root_last'] },
  { order: ['*', 'last'], expected: ['root_first', 'external', 'root_last'] },
  { order: ['$external:classification', '*'], expected: ['external', 'root_first', 'root_last'] },
])('places external section fields using ui:order only when explicit ($order)', ({ order, expected }) => {
  const view = render(
    <SchemaForm
      schema={{ type: 'object', properties: { first: { type: 'string' }, last: { type: 'string' } } }}
      uiSchema={{
        'ui:order': order,
        'ui:sections': [
          {
            id: 'section',
            title: 'Sektion',
            defaultOpen: true,
            fields: ['first', '$external:classification', 'last'],
          },
        ],
      }}
      externalFields={{ classification: <button type="button">Extern klassificering</button> }}
    />
  );
  const fieldOrder = Array.from(
    view.container.querySelectorAll('#root_first, #root_last, [data-cy="schema-external-field-classification"]')
  ).map((element) => element.id || 'external');
  expect(fieldOrder).toEqual(expected);
});

test('keeps consecutive external section fields in order when their preceding field is hidden', () => {
  const view = render(
    <SchemaForm
      schema={{ type: 'object', properties: { first: { type: 'string' }, last: { type: 'string' } } }}
      uiSchema={{
        first: { 'ui:widget': 'hidden' },
        'ui:sections': [
          {
            id: 'section',
            title: 'Sektion',
            defaultOpen: true,
            fields: ['first', '$external:classification', '$external:report', 'last'],
          },
        ],
      }}
      externalFields={{ classification: <p>Klassificering</p>, report: <p>Rapport</p> }}
    />
  );
  const fieldOrder = Array.from(view.container.querySelectorAll('[data-cy^="schema-external-field-"], #root_last')).map(
    (element) => element.id || element.textContent
  );
  expect(fieldOrder).toEqual(['Klassificering', 'Rapport', 'root_last']);
});

test.each(['order', 'section'])(
  'keeps explicitly nested external controls in their object or list row without a root fallback (%s)',
  (placement) => {
    const externalPlacement = (name: string): UiSchema =>
      placement === 'order'
        ? { 'ui:order': [`$external:${name}`, '*'] }
        : {
            'ui:sections': [{ id: 'external', title: name, defaultOpen: true, fields: [`$external:${name}`] }],
          };
    const view = render(
      <SchemaForm
        schema={{
          type: 'object',
          properties: {
            details: { type: 'object', properties: { answer: { type: 'string' } } },
            people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
          },
        }}
        formData={{ details: { answer: 'Svar' }, people: [{ name: 'Anna' }, { name: 'Bertil' }] }}
        uiSchema={{ details: externalPlacement('classification'), people: { items: externalPlacement('report') } }}
        externalFields={{ classification: <p>Klassificering</p>, report: <p>Rapport</p> }}
      />
    );
    expect(screen.getAllByText('Klassificering')).toHaveLength(1);
    expect(screen.getAllByText('Rapport')).toHaveLength(2);
    expect(view.container.querySelector('#root_details__field')?.contains(screen.getByText('Klassificering'))).toBe(
      true
    );
    screen.getAllByText('Rapport').forEach((report, index) => {
      expect(view.container.querySelector(`#root_people_${index}__field`)?.contains(report)).toBe(true);
    });
  }
);

test('checkbox groups preserve value types and enforce the maximum number of choices', async () => {
  const onSubmit = vi.fn();
  render(
    <SchemaForm
      schema={{
        type: 'object',
        properties: {
          choices: {
            type: 'array',
            title: 'Alternativ',
            uniqueItems: true,
            maxItems: 1,
            items: { type: 'number', enum: [1, 2] },
          },
        },
      }}
      uiSchema={{ choices: { 'ui:widget': 'CheckboxGroupWidget' } }}
      onSubmit={onSubmit}
    />
  );
  fireEvent.click(screen.getByRole('checkbox', { name: '1' }));
  expect(screen.getByRole('checkbox', { name: '2' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  expect(onSubmit.mock.calls[0][0]).toEqual({ choices: [1] });
});

test.each([
  ['time', `09:15:00${dayjs().format('Z')}`],
  [undefined, '09:15'],
])('normalizes time only when required by the schema (%s)', async (format, expected) => {
  const onSubmit = vi.fn();
  render(
    <SchemaForm
      schema={{ type: 'object', properties: { time: { type: 'string', title: 'Tid', format } } }}
      uiSchema={format ? undefined : { time: { 'ui:widget': 'TimeWidget' } }}
      onSubmit={onSubmit}
    />
  );
  fireEvent.change(screen.getByLabelText('Tid'), { target: { value: '09:15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  expect(onSubmit.mock.calls[0][0]).toEqual({ time: expected });
});

test('shows a stored time with offset in a read-only form', () => {
  render(
    <SchemaForm
      schema={{ type: 'object', properties: { time: { type: 'string', title: 'Tid', format: 'time' } } }}
      formData={{ time: '10:57:00+02:00' }}
      disabled
    />
  );
  expect((screen.getByLabelText('Tid') as HTMLInputElement).value).toBe('10:57');
});
