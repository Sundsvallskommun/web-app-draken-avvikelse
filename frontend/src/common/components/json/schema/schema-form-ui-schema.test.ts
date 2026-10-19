import assert from 'node:assert/strict';

import type { RJSFSchema } from '@rjsf/utils';
import { test } from 'vitest';

import { buildUiSchemaFromSchema } from './schema-form-ui-schema';

test('maps only the supported date and time string formats to specialized widgets', () => {
  const uiSchema = buildUiSchemaFromSchema({
    type: 'object',
    properties: {
      occurredAt: { type: 'string', format: 'time' },
      occurredOn: { type: ['string', 'null'], format: 'date' },
      contact: { type: 'string', format: 'email' },
      homepage: { type: 'string', format: 'uri' },
      comment: { type: 'string' },
    },
  });

  assert.deepEqual(uiSchema, {
    occurredAt: { 'ui:widget': 'time' },
    occurredOn: { 'ui:widget': 'date' },
    contact: { 'ui:widget': 'TextWidget' },
    homepage: { 'ui:widget': 'TextWidget' },
    comment: { 'ui:widget': 'TextWidget' },
  });
});

test('keeps an explicitly authored widget for a time-formatted field', () => {
  assert.deepEqual(
    // `widget` is a vendor extension buildUiSchemaFromSchema reads but RJSFSchema
    // (JSONSchema7) does not model, so the literal needs the cast.
    buildUiSchemaFromSchema({
      type: 'object',
      properties: {
        occurredAt: { type: 'string', format: 'time', widget: 'TextWidget' },
      },
    } as RJSFSchema),
    { occurredAt: { 'ui:widget': 'TextWidget' } }
  );
});
