// @vitest-environment jsdom
import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { getUserEmployments, type UserEmploymentDTO } from '@common/services/employee-service';
import Form from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { useMetadataStore } from '@stores/metadata-store';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { FacilitySearchField } from './facility-search-field.componant';

vi.mock('@common/services/employee-service', () => ({ getUserEmployments: vi.fn() }));

const label = (id: string, name: string, labels: Label[] = []): Label => ({
  id,
  classification: 'PLACE',
  displayName: name,
  resourceName: name,
  resourcePath: `PLACE/${id}`,
  labels,
});
const departments = Array.from({ length: 7 }, (_, index) => label(`unit-${index}`, `Enhet ${index}`));
const place = label('place', 'Boendet', departments);
const root = label('root', 'Platsstruktur', [
  label('administration', 'Förvaltning', [
    label('activity', 'Verksamhet', [label('area', 'Område', [place, label('other', 'Annan plats')])]),
  ]),
]);
const schema: RJSFSchema = { type: 'object', properties: { facility: { type: 'object' } } };
const uiSchema = { facility: { 'ui:field': 'FacilitySearchWidget' } };
const fields = { FacilitySearchWidget: FacilitySearchField };

beforeEach(() => {
  vi.mocked(getUserEmployments).mockReset().mockResolvedValue([]);
  useMetadataStore.setState({ supportMetadata: { labels: { labelStructure: [root] } } });
});
afterEach(() => {
  cleanup();
  useMetadataStore.setState({ supportMetadata: undefined });
});

test('shows saved place and department from the label structure', () => {
  render(
    <Form
      schema={schema}
      uiSchema={uiSchema}
      fields={fields}
      validator={validator}
      formData={{ facility: { orgName: 'Enhet 0', parentOrgName: 'Boendet' } }}
      readonly
    />
  );
  expect(screen.getByText('Boendet')).toBeTruthy();
  expect(screen.getByText(/Avdelning:/).parentElement?.textContent).toContain('Enhet 0');
  expect(screen.queryByRole('button', { name: 'Ändra plats' })).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
});

test.each([undefined, {}])('keeps saved names readable when place metadata is unavailable (%s)', (metadata) => {
  useMetadataStore.setState({ supportMetadata: metadata });
  render(
    <Form
      schema={schema}
      uiSchema={uiSchema}
      fields={fields}
      validator={validator}
      formData={{ facility: { orgName: 'Sparad enhet', parentOrgName: 'Sparad plats' } }}
      readonly
    />
  );
  expect(screen.getByText('Sparad plats Sparad enhet')).toBeTruthy();
});

test('a late employment response does not overwrite a newer place selection', async () => {
  let complete: (employments: UserEmploymentDTO[]) => void = () => {
    throw new Error('Request not started');
  };
  vi.mocked(getUserEmployments).mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const onChange = vi.fn();
  const view = render(
    <Form
      schema={schema}
      uiSchema={uiSchema}
      fields={fields}
      validator={validator}
      formData={{ facility: {} }}
      onChange={onChange}
    />
  );
  view.rerender(
    <Form
      schema={schema}
      uiSchema={uiSchema}
      fields={fields}
      validator={validator}
      formData={{ facility: { orgName: 'Annan plats' } }}
      onChange={onChange}
    />
  );
  onChange.mockClear();
  await act(async () => {
    complete([{ orgId: 42, orgName: 'Boendet' }]);
  });
  expect(screen.getByText('Annan plats')).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();
});
