import type { RJSFSchema, UiSchema } from '@rjsf/utils';

interface AutoUiSchemaProperty {
  type?: string | readonly string[];
  format?: string;
  oneOf?: ReadonlyArray<{ const?: unknown }>;
  enum?: readonly unknown[];
  items?: AutoUiSchemaProperty;
  widget?: string;
}

const asProperty = (value: unknown): AutoUiSchemaProperty | undefined =>
  typeof value === 'object' && value !== null ? (value as AutoUiSchemaProperty) : undefined;

const hasType = (property: AutoUiSchemaProperty | undefined, type: string): boolean => {
  if (typeof property?.type === 'string') return property.type === type;
  return Array.isArray(property?.type) && property.type.includes(type);
};

const isOneOfStrings = (property: AutoUiSchemaProperty | undefined): boolean =>
  Array.isArray(property?.oneOf) && property.oneOf.every((option) => typeof option.const === 'string');

const isEnumStrings = (property: AutoUiSchemaProperty | undefined): boolean =>
  Array.isArray(property?.enum) && property.enum.every((value) => typeof value === 'string');

const hasStringChoices = (property: AutoUiSchemaProperty | undefined): boolean =>
  isOneOfStrings(property) || isEnumStrings(property);

const getDefaultWidget = (property: AutoUiSchemaProperty): string | undefined => {
  if (property.widget) return property.widget;

  const arrayItems = property.items;
  if (
    hasType(property, 'array') &&
    arrayItems &&
    (hasType(arrayItems, 'string') || !arrayItems.type) &&
    hasStringChoices(arrayItems)
  ) {
    return 'ComboboxWidget';
  }

  if (hasType(property, 'boolean')) return 'checkbox';
  if (!hasType(property, 'string')) return undefined;
  if (property.format === 'date') return 'date';
  if (property.format === 'time') return 'time';
  return hasStringChoices(property) ? 'select' : 'TextWidget';
};

/**
 * Builds the design-system widget defaults used when a schema has no authored UI schema.
 * Explicit schema widgets win, and only the date/time formats override the ordinary string widget.
 */
export function buildUiSchemaFromSchema(schema: RJSFSchema): UiSchema {
  const ui: UiSchema = {};
  const properties = schema.properties ?? {};

  for (const [key, rawProperty] of Object.entries(properties)) {
    const property = asProperty(rawProperty);
    if (!property) continue;

    const widget = getDefaultWidget(property);
    if (widget) ui[key] = { 'ui:widget': widget };
  }

  return ui;
}
