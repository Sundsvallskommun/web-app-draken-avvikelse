'use client';

import iconMap from '@common/components/lucide-icon-map/lucide-icon-map.component';
import type { ObjectFieldTemplateProps, RJSFSchema, SchemaUtilsType, UiSchema } from '@rjsf/utils';
import { Checkbox, Disclosure, Divider, Label } from '@sk-web-gui/react';
import { MouseEvent, ReactNode, useState } from 'react';

import type { SchemaErrorNavigation } from '../schema/schema-form-error-summary.component';

interface ConditionalRule {
  if: RJSFSchema;
  then: {
    required?: string[];
    properties?: Record<string, unknown>;
  };
}

interface RowDefinition {
  fields: string[];
  gap?: string;
}

interface SectionDefinition {
  id: string;
  title: string;
  icon?: string;
  fields: string[];
  defaultOpen?: boolean;
  /** Information shown at the top of the section, before its fields. */
  description?: string;
  /** Information shown at the end of the section, after its fields. */
  footnote?: string;
}

interface FormContext {
  originalSchema?: RJSFSchema;
  idPrefix?: string;
  externalFields?: Readonly<Record<string, ReactNode>>;
  errorNavigation?: SchemaErrorNavigation;
  requiredIndicator?: string;
  /** The form only displays saved answers, so how to give them is left out. */
  withoutFieldHelp?: boolean;
}

const externalFieldPrefix = '$external:';

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Visibility follows the same evaluator as validity: the form's AJV instance decides whether an
// if-condition holds, so keywords such as minimum or pattern cannot diverge from what is enforced.
function isConditionMet(
  schemaUtils: SchemaUtilsType,
  condition: ConditionalRule['if'],
  formData: Record<string, unknown>,
  rootSchema: RJSFSchema
): boolean {
  return schemaUtils.getValidator().isValid(condition, formData, rootSchema);
}

function getConditionalFields(schema: RJSFSchema): Map<string, ConditionalRule['if'][]> {
  const conditionalFields = new Map<string, ConditionalRule['if'][]>();
  const addConditionalField = (fieldName: string, condition: ConditionalRule['if']) => {
    const currentConditions = conditionalFields.get(fieldName) ?? [];
    if (!currentConditions.includes(condition)) {
      conditionalFields.set(fieldName, [...currentConditions, condition]);
    }
  };

  const addRule = (rule: ConditionalRule) => {
    for (const field of rule.then.required ?? []) {
      addConditionalField(field, rule.if);
    }

    for (const field of Object.keys(rule.then.properties ?? {})) {
      addConditionalField(field, rule.if);
    }
  };

  const allOf = schema.allOf as ConditionalRule[] | undefined;
  if (allOf) {
    for (const rule of allOf) {
      if (rule.if && rule.then) {
        addRule(rule);
      }
    }
  }

  const rootIf = schema.if as ConditionalRule['if'] | undefined;
  const rootThen = schema.then as ConditionalRule['then'] | undefined;
  if (rootIf && rootThen) {
    addRule({ if: rootIf, then: rootThen });
  }

  return conditionalFields;
}

function getRowDefinitions(uiSchema: UiSchema | undefined): RowDefinition[] {
  return (uiSchema?.['ui:rows'] ?? []) as RowDefinition[];
}

/** A section's own information - what it asks for, or where something it does not ask for is recorded. */
function SectionInformation({ text }: Readonly<{ text: string }>) {
  return <p className="text-small italic text-dark-secondary">{text}</p>;
}

function getSectionDefinitions(uiSchema: UiSchema | undefined): SectionDefinition[] {
  return (uiSchema?.['ui:sections'] ?? []) as SectionDefinition[];
}

interface SectionDisclosureProps {
  disclosureId: string;
  section: SectionDefinition;
  isReadonly: boolean;
  showCompletionControl: boolean;
  children: ReactNode;
  errorNavigation?: SchemaErrorNavigation;
}

function SectionDisclosure({
  disclosureId,
  section,
  isReadonly,
  showCompletionControl,
  children,
  errorNavigation,
}: Readonly<SectionDisclosureProps>) {
  const [open, setOpen] = useState(section.defaultOpen ?? false);
  const [doneMark, setDoneMark] = useState(false);
  const [lastErrorNavigation, setLastErrorNavigation] = useState(errorNavigation);

  if (errorNavigation !== lastErrorNavigation) {
    setLastErrorNavigation(errorNavigation);
    if (errorNavigation) setOpen(true);
  }

  const handleDoneMarkChange = () => {
    const newDoneMark = !doneMark;
    setDoneMark(newDoneMark);

    if (newDoneMark) {
      setOpen(false);
    }
  };

  // SK Disclosure toggles on both the header and its nested button. Stop the
  // button click from bubbling so keyboard activation changes state once.
  const handleButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setOpen((currentOpen) => !currentOpen);
  };

  return (
    <Disclosure
      id={disclosureId}
      variant="alt"
      className="schema-boundary-disclosure w-full min-w-0 max-w-full"
      open={open}
      onToggleOpen={setOpen}
    >
      <Disclosure.Header>
        {section.icon && (
          <Disclosure.Icon
            icon={(() => {
              const DynIcon = iconMap[section.icon as string];
              return DynIcon ? <DynIcon /> : undefined;
            })()}
          />
        )}
        <Disclosure.Title id={`${disclosureId}-title`}>
          <h3>{section.title}</h3>
        </Disclosure.Title>
        {doneMark && (
          <Label inverted rounded color="gronsta">
            Komplett
          </Label>
        )}
        <Disclosure.Button aria-labelledby={`${disclosureId}-title`} onClick={handleButtonClick} />
      </Disclosure.Header>
      <Disclosure.Content>
        {children}
        {!isReadonly && showCompletionControl && (
          <>
            <Divider className="mt-16" />
            <Checkbox className="mt-16" onClick={handleDoneMarkChange} checked={doneMark}>
              Markera avsnittet som komplett
            </Checkbox>
          </>
        )}
      </Disclosure.Content>
    </Disclosure>
  );
}

function resolveFieldOrder(rawOrder: unknown, propertyNames: string[]): string[] {
  if (!Array.isArray(rawOrder) || rawOrder.length === 0) {
    return propertyNames;
  }

  const requestedOrder = rawOrder.filter((entry): entry is string => typeof entry === 'string');
  const remainingForWildcard = propertyNames.filter((name) => !requestedOrder.includes(name));
  const resolvedOrder: string[] = [];
  const used = new Set<string>();

  for (const token of requestedOrder) {
    if (token === '*') {
      for (const name of remainingForWildcard) {
        if (!used.has(name)) {
          resolvedOrder.push(name);
          used.add(name);
        }
      }
      continue;
    }

    if (propertyNames.includes(token) && !used.has(token)) {
      resolvedOrder.push(token);
      used.add(token);
    }
  }

  for (const name of propertyNames) {
    if (!used.has(name)) {
      resolvedOrder.push(name);
      used.add(name);
    }
  }

  return resolvedOrder;
}

function getDeclaredExternalFields(uiSchema: unknown): Set<string> {
  if (!isRecordValue(uiSchema)) return new Set();

  const order: unknown[] = Array.isArray(uiSchema['ui:order']) ? uiSchema['ui:order'] : [];
  const sectionFields = getSectionDefinitions(uiSchema).flatMap((section) => section.fields);
  const declaredFields = new Set(
    [...order, ...sectionFields].filter(
      (field): field is string => typeof field === 'string' && field.startsWith(externalFieldPrefix)
    )
  );

  // A placement in a nested object or an array's items also claims the field,
  // so the root must not add a second instance as an unplaced fallback.
  for (const [key, value] of Object.entries(uiSchema)) {
    if (key.startsWith('ui:')) continue;
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      for (const field of getDeclaredExternalFields(child)) declaredFields.add(field);
    }
  }

  return declaredFields;
}

function resolveObjectFieldOrder(
  uiSchema: UiSchema | undefined,
  propertyNames: string[],
  externalFields: Readonly<Record<string, ReactNode>>,
  isRoot: boolean
): string[] {
  const rawOrder = uiSchema?.['ui:order'];
  const requestedOrder: unknown[] = Array.isArray(rawOrder) ? rawOrder : [];
  const externalFieldNames = Object.keys(externalFields).map((name) => `${externalFieldPrefix}${name}`);
  // Only explicit names participate in ui:order (including its wildcard).
  // Section-only placements are inserted later from section.fields.
  const order = resolveFieldOrder(rawOrder, [
    ...propertyNames,
    ...externalFieldNames.filter((name) => requestedOrder.includes(name)),
  ]);
  if (!isRoot) return order;

  const declaredFields = getDeclaredExternalFields(uiSchema);
  return [...order, ...externalFieldNames.filter((name) => !declaredFields.has(name))];
}

function insertExternalFieldsInSectionOrder(
  orderedPropertyNames: readonly string[],
  sectionFieldNames: readonly string[]
): string[] {
  const sectionFields = new Set(sectionFieldNames);
  const resolvedOrder = orderedPropertyNames.filter((fieldName) => sectionFields.has(fieldName));

  for (const fieldName of sectionFieldNames) {
    if (!fieldName.startsWith(externalFieldPrefix) || resolvedOrder.includes(fieldName)) continue;

    const declaredIndex = sectionFieldNames.indexOf(fieldName);
    const precedingField = sectionFieldNames
      .slice(0, declaredIndex)
      .reverse()
      .find((candidate) => resolvedOrder.includes(candidate));
    const followingField = sectionFieldNames
      .slice(declaredIndex + 1)
      .find((candidate) => resolvedOrder.includes(candidate));

    if (precedingField) {
      resolvedOrder.splice(resolvedOrder.lastIndexOf(precedingField) + 1, 0, fieldName);
    } else if (followingField) {
      resolvedOrder.splice(resolvedOrder.indexOf(followingField), 0, fieldName);
    } else {
      resolvedOrder.push(fieldName);
    }
  }

  return resolvedOrder;
}

function renderExternalField(
  fieldName: string,
  externalFields: Readonly<Record<string, ReactNode>>,
  className: string
) {
  const externalFieldName = fieldName.slice(externalFieldPrefix.length);
  const externalField = externalFields[externalFieldName];
  return externalField ? (
    <div key={fieldName} className={className} data-cy={`schema-external-field-${externalFieldName}`}>
      {externalField}
    </div>
  ) : null;
}

function renderFields(
  fieldNames: string[],
  properties: ObjectFieldTemplateProps['properties'],
  visibleFields: Set<string>,
  rows: RowDefinition[],
  rowFieldNames: Set<string>,
  renderedRows: Set<string>,
  externalFields: Readonly<Record<string, ReactNode>>
) {
  return fieldNames.map((fieldName) => {
    if (!visibleFields.has(fieldName)) return null;

    // An external field declared in a row is rendered as a cell of that row below.
    if (fieldName.startsWith(externalFieldPrefix) && !rowFieldNames.has(fieldName)) {
      return renderExternalField(fieldName, externalFields, 'min-w-0 max-w-full');
    }

    const row = rows.find((r) => r.fields.find((field) => visibleFields.has(field)) === fieldName);
    if (row) {
      const rowKey = row.fields.join('-');
      if (renderedRows.has(rowKey)) return null;
      renderedRows.add(rowKey);

      const visibleRowFields = row.fields.filter((f) => visibleFields.has(f));
      if (visibleRowFields.length === 0) return null;

      return (
        <div
          key={rowKey}
          className={`schema-field-row flex min-w-0 flex-col ${row.gap || 'gap-32'}`}
          data-cy="schema-field-row"
        >
          {visibleRowFields.map((f) => {
            if (f.startsWith(externalFieldPrefix)) {
              return renderExternalField(f, externalFields, 'schema-field-cell w-full min-w-0');
            }
            const prop = properties.find((p) => p.name === f);
            return prop ? (
              <div key={f} className="schema-field-cell w-full min-w-0">
                {prop.content}
              </div>
            ) : null;
          })}
        </div>
      );
    }

    if (rowFieldNames.has(fieldName)) return null;

    const prop = properties.find((p) => p.name === fieldName);
    return prop ? (
      <div key={fieldName} className="min-w-0 max-w-full">
        {prop.content}
      </div>
    ) : null;
  });
}

export function SectionsObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const {
    properties,
    formData,
    formContext,
    uiSchema,
    disabled,
    readonly,
    description,
    idSchema,
    registry,
    required,
    title,
  } = props;

  const ctx = formContext as FormContext | undefined;
  const externalFields = ctx?.externalFields ?? {};
  const originalSchema = ctx?.originalSchema;
  const rootSchema = originalSchema ?? registry.rootSchema;
  const conditionalFields = originalSchema
    ? getConditionalFields(originalSchema)
    : new Map<string, ConditionalRule['if'][]>();

  const rows = getRowDefinitions(uiSchema);
  const rowFieldNames = new Set(rows.flatMap((r) => r.fields));
  const sections = getSectionDefinitions(uiSchema);
  const showCompletionControl = uiSchema?.['ui:options']?.showSectionCompletion !== false;
  const showObjectFieldset = uiSchema?.['ui:options']?.showObjectFieldset === true;
  const propertyNames = properties.map((p) => p.name);
  const isRoot = idSchema.$id === (ctx?.idPrefix ?? 'root');
  const order = resolveObjectFieldOrder(uiSchema, propertyNames, externalFields, isRoot);
  const isReadonly = !!(disabled || readonly);

  const visibleFields = new Set<string>();
  for (const prop of properties) {
    // Hidden fields must not leave wrappers, row gaps or empty sections in the layout.
    if (prop.hidden) continue;
    const conditions = conditionalFields.get(prop.name);
    if (
      !conditions ||
      conditions.some((condition) => isConditionMet(registry.schemaUtils, condition, formData || {}, rootSchema))
    ) {
      visibleFields.add(prop.name);
    }
  }
  for (const externalFieldName of Object.keys(externalFields)) {
    visibleFields.add(`${externalFieldPrefix}${externalFieldName}`);
  }

  if (sections.length === 0) {
    const renderedRows = new Set<string>();
    const renderedFields = (
      <div className="flex min-w-0 max-w-full flex-col gap-32">
        {renderFields(order, properties, visibleFields, rows, rowFieldNames, renderedRows, externalFields)}
      </div>
    );

    if (isRoot || !showObjectFieldset) return renderedFields;

    return (
      <fieldset
        className="w-full min-w-0 max-w-full rounded-12 border-1 border-divider bg-background-100 p-16"
        data-cy="schema-object-fieldset"
      >
        {title && (
          <legend className="box-border max-w-full break-words px-8 text-label-medium font-bold whitespace-normal">
            {title}
            {required ? ctx?.requiredIndicator ?? ' *' : ''}
          </legend>
        )}
        {description && !ctx?.withoutFieldHelp && <p className="mb-16 text-small text-dark-secondary">{description}</p>}
        {renderedFields}
      </fieldset>
    );
  }

  const sectionFieldNames = new Set(sections.flatMap((s) => s.fields));
  const unsectionedFields = order.filter((f) => !sectionFieldNames.has(f) && visibleFields.has(f));
  const renderedRows = new Set<string>();
  // A section opens for the error target when one of its fields is the target or encloses it.
  // The enclosing fields come with the navigation: a field name may itself contain the id
  // separator, so `root_risk` is not necessarily an ancestor of `root_risk_level`.
  const errorNavigation = ctx?.errorNavigation;
  const holdsErrorTarget = (fieldId: string) =>
    errorNavigation?.fieldId === fieldId || errorNavigation?.ancestorIds.includes(fieldId);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-32">
      {sections.map((section) => {
        const sectionFieldsInOrder = insertExternalFieldsInSectionOrder(order, section.fields).filter((fieldName) =>
          visibleFields.has(fieldName)
        );
        if (sectionFieldsInOrder.length === 0) return null;

        return (
          <SectionDisclosure
            key={section.id}
            disclosureId={`${idSchema.$id}-${section.id}`}
            section={section}
            isReadonly={isReadonly}
            showCompletionControl={showCompletionControl}
            errorNavigation={
              section.fields.some((fieldName) =>
                holdsErrorTarget(`${idSchema.$id}_${fieldName.replace('$external:', 'external_')}`)
              )
                ? errorNavigation
                : undefined
            }
          >
            <div className="flex min-w-0 max-w-full flex-col gap-32">
              {section.description && <SectionInformation text={section.description} />}
              {renderFields(
                sectionFieldsInOrder,
                properties,
                visibleFields,
                rows,
                rowFieldNames,
                renderedRows,
                externalFields
              )}
              {section.footnote && <SectionInformation text={section.footnote} />}
            </div>
          </SectionDisclosure>
        );
      })}

      {unsectionedFields.length > 0 && (
        <div className="flex min-w-0 max-w-full flex-col gap-32">
          {renderFields(
            unsectionedFields,
            properties,
            visibleFields,
            rows,
            rowFieldNames,
            renderedRows,
            externalFields
          )}
        </div>
      )}
    </div>
  );
}
