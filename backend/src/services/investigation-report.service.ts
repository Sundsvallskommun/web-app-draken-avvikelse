import type { JsonSchema } from '@/data-contracts/jsonschema/data-contracts';
import type { Errand } from '@/data-contracts/supportmanagement/data-contracts';

import { isRecord, type JsonObject } from './schema-bound-json.service';
import { readDocumentCompletion } from './support-json-parameter.service';

/**
 * The report is built from the document's own schema and UI schema, so a new schema version needs
 * no new template: every section in the UI schema's order, every field under its own title, codes
 * translated to their titles. Server-owned properties, hidden widgets, the completion fields and the
 * external fields that live on the errand rather than in the document are not part of the report:
 * the report is the investigation document and nothing else, with the errand number for context.
 */
interface InvestigationReportField {
  readonly label: string;
  readonly kind: 'text' | 'html' | 'list' | 'table' | 'group';
  readonly text?: string;
  readonly html?: string;
  readonly items?: readonly string[];
  readonly columns?: readonly string[];
  readonly rows?: readonly (readonly string[])[];
  readonly fields?: readonly InvestigationReportField[];
}

interface InvestigationReportSection {
  readonly title: string;
  readonly fields: readonly InvestigationReportField[];
}

export interface InvestigationReportModel {
  readonly title: string;
  readonly ownerLabel: string;
  readonly sequence: number;
  readonly generatedAt: string;
  readonly generatedBy: string;
  readonly errand: {
    readonly errandNumber: string;
  };
  readonly sections: readonly InvestigationReportSection[];
}

export interface BuildInvestigationReportModelInput {
  readonly schema: JsonSchema;
  readonly uiSchema: JsonObject;
  readonly value: JsonObject;
  readonly errand: Errand;
  readonly definition: { readonly tabLabel: string; readonly ownerLabel: string };
  readonly sequence: number;
  readonly generatedAt: string;
  readonly generatedBy: string;
}

export const EMPTY_VALUE = 'Ej angivet';
const EXTERNAL_PREFIX = '$external:';

const resolveReference = (property: Record<string, unknown>, root: Record<string, unknown>): Record<string, unknown> => {
  if (typeof property.$ref !== 'string' || !property.$ref.startsWith('#/$defs/')) return property;
  const definition = isRecord(root.$defs) ? root.$defs[property.$ref.slice('#/$defs/'.length)] : undefined;
  if (!isRecord(definition)) return property;
  const { $ref: _reference, ...siblings } = property;
  return { ...definition, ...siblings };
};

const titleOf = (property: Record<string, unknown>, fallback: string): string => (typeof property.title === 'string' ? property.title : fallback);

const choiceTitle = (property: Record<string, unknown>, value: unknown): string | undefined => {
  if (!Array.isArray(property.oneOf)) return undefined;
  const match = property.oneOf.find(option => isRecord(option) && option.const === value);
  return isRecord(match) && typeof match.title === 'string' ? match.title : undefined;
};

const scalarText = (property: Record<string, unknown>, value: unknown): string => {
  if (value === undefined || value === null || value === '') return EMPTY_VALUE;
  const title = choiceTitle(property, value);
  if (title !== undefined) return title;
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
};

const isHtmlProperty = (property: Record<string, unknown>): boolean => property.contentMediaType === 'text/html';

const buildField = (name: string, property: Record<string, unknown>, value: unknown, root: Record<string, unknown>): InvestigationReportField => {
  const resolved = resolveReference(property, root);
  const label = titleOf(resolved, name);

  if (resolved.type === 'array') {
    const items = isRecord(resolved.items) ? resolveReference(resolved.items, root) : {};
    const values = Array.isArray(value) ? value : [];
    if (items.type === 'object' && isRecord(items.properties)) {
      const columns = Object.entries(items.properties).map(([itemName, itemProperty]) =>
        titleOf(isRecord(itemProperty) ? resolveReference(itemProperty, root) : {}, itemName),
      );
      const rows = values.map(row =>
        Object.entries(items.properties as Record<string, unknown>).map(([itemName, itemProperty]) =>
          scalarText(isRecord(itemProperty) ? resolveReference(itemProperty, root) : {}, isRecord(row) ? row[itemName] : undefined),
        ),
      );
      return { label, kind: 'table', columns, rows };
    }
    return { label, kind: 'list', items: values.map(item => scalarText(items, item)) };
  }

  if (resolved.type === 'object' && isRecord(resolved.properties)) {
    const record = isRecord(value) ? value : {};
    const fields = Object.entries(resolved.properties).map(([childName, childProperty]) =>
      buildField(childName, isRecord(childProperty) ? childProperty : {}, record[childName], root),
    );
    return { label, kind: 'group', fields };
  }

  if (isHtmlProperty(resolved) && typeof value === 'string' && value.trim().length > 0) {
    return { label, kind: 'html', html: value };
  }

  return { label, kind: 'text', text: scalarText(resolved, value) };
};

const isAbsentGroup = (property: Record<string, unknown>, value: unknown): boolean =>
  property.type === 'object' && isRecord(property.properties) && value === undefined;

const hiddenWidget = (uiSchema: JsonObject, name: string): boolean => {
  const field = uiSchema[name];
  return isRecord(field) && field['ui:widget'] === 'hidden';
};

const serverControlled = (property: Record<string, unknown>): boolean =>
  property['x-draken-server-timestamp'] !== undefined || property['x-draken-server-revisions'] === true || property['x-draken-server-owned'] === true;

export const buildInvestigationReportModel = (input: BuildInvestigationReportModelInput): InvestigationReportModel => {
  const root = isRecord(input.schema.value) ? input.schema.value : {};
  const properties = isRecord(root.properties) ? root.properties : {};
  const completion = readDocumentCompletion(input.schema);
  const excluded = new Set<string>(completion ? [completion.field, completion.reportsField] : []);
  const sections = Array.isArray(input.uiSchema['ui:sections']) ? input.uiSchema['ui:sections'] : [];
  const placed = new Set<string>();

  const fieldFor = (name: string): InvestigationReportField | undefined => {
    if (name.startsWith(EXTERNAL_PREFIX) || excluded.has(name) || hiddenWidget(input.uiSchema, name)) return undefined;
    const property = properties[name];
    if (!isRecord(property) || serverControlled(property)) return undefined;
    placed.add(name);
    // A group the document does not hold was never part of the investigation - a risk assessment under a legal
    // base that does not apply, or one the unit manager does not make for a misconduct. Printing it as a list of
    // unanswered questions would say it was asked.
    if (isAbsentGroup(resolveReference(property, root), input.value[name])) return undefined;
    return buildField(name, property, input.value[name], root);
  };

  const reportSections: InvestigationReportSection[] = sections.flatMap(section => {
    if (!isRecord(section) || !Array.isArray(section.fields)) return [];
    const fields = section.fields.flatMap(name => (typeof name === 'string' ? (fieldFor(name) ?? []) : []));
    return fields.length > 0 ? [{ title: typeof section.title === 'string' ? section.title : '', fields }] : [];
  });

  // A property the UI schema never placed still belongs to the document; it is reported last.
  const remaining = Object.keys(properties).flatMap(name => (placed.has(name) ? [] : (fieldFor(name) ?? [])));
  if (remaining.length > 0) reportSections.push({ title: 'Övrigt', fields: remaining });

  return {
    title: typeof root.title === 'string' ? root.title : input.definition.tabLabel,
    ownerLabel: input.definition.ownerLabel,
    sequence: input.sequence,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    errand: {
      errandNumber: input.errand.errandNumber ?? EMPTY_VALUE,
    },
    sections: reportSections,
  };
};

/** ASCII attachment names avoid whitespace and Unicode encoding differences in multipart headers. */
export const investigationReportFileName = (tabLabel: string, sequence: number): string => {
  const name = tabLabel
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  return `${name || 'Utredning'}_${sequence}.pdf`;
};
