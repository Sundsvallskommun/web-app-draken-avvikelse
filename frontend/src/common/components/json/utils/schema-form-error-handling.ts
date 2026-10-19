import { findSchemaDefinition, type RJSFSchema, type RJSFValidationError } from '@rjsf/utils';

type RequiredParams = { missingProperty: string };
type LimitParams = { limit: number };
type PatternParams = { pattern: string };
type FormatParams = { format: string };

export interface SchemaFormError {
  fieldId: string;
  /**
   * Ids of the objects and lists enclosing the field, outermost first; empty for a field at the
   * root or outside the schema. An id alone cannot tell nesting apart from a name that happens
   * to contain the separator: `risk.level` and `risk_level` both become `root_risk_level`.
   */
  ancestorIds: readonly string[];
  label: string;
  message: string;
}

function getFieldPath(property: string): string[] {
  return property
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

// Only "#/..." pointers resolve here. Any other reference, such as a draft 2020-12 $anchor,
// keeps the raw key as its label rather than aborting the whole validation with an exception.
function withResolvedRef(node: RJSFSchema, rootSchema: RJSFSchema): RJSFSchema {
  if (!node.$ref) return node;
  try {
    return { ...findSchemaDefinition(node.$ref, rootSchema), ...node };
  } catch {
    return node;
  }
}

function getFieldLabels(schema: RJSFSchema, path: string[]): string[] {
  let current: RJSFSchema | undefined = schema;
  return path.map((part) => {
    if (current) current = withResolvedRef(current, schema);
    if (/^\d+$/.test(part)) {
      const item = Array.isArray(current?.items) ? current.items[Number(part)] : current?.items;
      current = typeof item === 'object' ? item : undefined;
      return `Rad ${Number(part) + 1}`;
    }
    const field = current?.properties?.[part];
    current = typeof field === 'object' ? field : undefined;
    if (current) current = withResolvedRef(current, schema);
    return current?.title ?? part;
  });
}

export function getSchemaFormErrors(
  schema: RJSFSchema,
  errors: readonly RJSFValidationError[],
  idPrefix: string
): SchemaFormError[] {
  const result: SchemaFormError[] = [];
  for (const error of errors) {
    // AJV also reports the failed conditional branch; the concrete field errors explain what to fix.
    if (error.name === 'if' && errors.some((candidate) => candidate.name !== 'if')) continue;
    const path = getFieldPath(error.property ?? '');
    const pathIds = path.map((_, depth) => [idPrefix, ...path.slice(0, depth + 1)].join('_'));
    const entry = {
      fieldId: pathIds.at(-1) ?? idPrefix,
      ancestorIds: pathIds.slice(0, -1),
      label: getFieldLabels(schema, path).join(' – ') || schema.title || 'Formuläret',
      message: error.message ?? 'Kontrollera uppgifterna.',
    };
    if (!result.some((existing) => existing.fieldId === entry.fieldId && existing.message === entry.message)) {
      result.push(entry);
    }
  }
  return result;
}

const isRequiredError = (e: RJSFValidationError): e is RJSFValidationError & { params: RequiredParams } => {
  const p = e.params as unknown;
  return e.name === 'required' && !!p && typeof (p as RequiredParams).missingProperty === 'string';
};

const hasLimit = (e: RJSFValidationError): e is RJSFValidationError & { params: LimitParams } => {
  const p = e.params as unknown;
  return !!p && typeof (p as LimitParams).limit === 'number';
};

const hasPattern = (e: RJSFValidationError): e is RJSFValidationError & { params: PatternParams } => {
  const p = e.params as unknown;
  return !!p && typeof (p as PatternParams).pattern === 'string';
};

const hasFormat = (e: RJSFValidationError): e is RJSFValidationError & { params: FormatParams } => {
  const p = e.params as unknown;
  return !!p && typeof (p as FormatParams).format === 'string';
};

function createJsonErrorTransformer(schema: RJSFSchema) {
  return (errors: RJSFValidationError[]): RJSFValidationError[] =>
    errors.map((e) => {
      const path = getFieldPath(e.property ?? '');
      const fieldTitle = getFieldLabels(schema, path).at(-1) ?? 'uppgiften';

      if (isRequiredError(e)) {
        return { ...e, message: `Vänligen ange ${fieldTitle}.` };
      }

      if (e.name === 'minLength' && hasLimit(e)) return { ...e, message: `Ange minst ${e.params.limit} tecken.` };
      if (e.name === 'maxLength' && hasLimit(e)) return { ...e, message: `Ange högst ${e.params.limit} tecken.` };

      if (e.name === 'minItems' && hasLimit(e)) return { ...e, message: `Välj minst ${e.params.limit} alternativ.` };
      if (e.name === 'maxItems' && hasLimit(e)) return { ...e, message: `Välj högst ${e.params.limit} alternativ.` };

      if (e.name === 'minimum' && hasLimit(e))
        return { ...e, message: `Värdet måste vara större eller lika med ${e.params.limit}.` };
      if (e.name === 'maximum' && hasLimit(e))
        return { ...e, message: `Värdet måste vara mindre eller lika med ${e.params.limit}.` };

      if (e.name === 'pattern' && hasPattern(e)) {
        return { ...e, message: `Värdet matchar inte det förväntade formatet.` };
      }

      if (e.name === 'format' && hasFormat(e)) {
        const f = e.params.format;
        if (f === 'email') return { ...e, message: 'Ange en giltig e-postadress.' };
        if (f === 'uri' || f === 'url') return { ...e, message: 'Ange en giltig länk (URL).' };
        if (f === 'date') return { ...e, message: 'Ange ett datum i giltigt format (ÅÅÅÅ-MM-DD).' };
        if (f === 'date-time') return { ...e, message: 'Ange datum och tid i giltigt format.' };
        return { ...e, message: `Värdet matchar inte formatet "${f}".` };
      }

      if (e.name === 'enum' || e.name === 'not' || e.name === 'const') {
        return { ...e, message: `Vänligen ange ${fieldTitle}.` };
      }

      if (e.name === 'oneOf' || e.name === 'anyOf' || e.name === 'if' || e.name === 'type') {
        return { ...e, message: 'Kontrollera att uppgiften är korrekt ifylld.' };
      }

      return e;
    });
}

export default createJsonErrorTransformer;
