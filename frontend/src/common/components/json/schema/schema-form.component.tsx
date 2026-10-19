'use client';

import { ArrayObjectFieldTemplate } from '@common/components/json/fields/array-object-field-template.componant';
import { FacilitySearchField } from '@common/components/json/fields/facility-search-field.componant';
import { FieldTemplate } from '@common/components/json/fields/field-template.componant';
import { SectionsObjectFieldTemplate } from '@common/components/json/fields/sections-object-field-template.componant';
import {
  SchemaSubmitButton,
  SubmitButtonFieldTemplate,
  type SubmitButtonOptions,
} from '@common/components/json/fields/submit-button-field-template.componant';
import { jsonWidgets } from '@common/components/json/widgets/index.componant';
import Form, { FormProps, IChangeEvent } from '@rjsf/core';
import type {
  ArrayFieldTemplateProps,
  RegistryFieldsType,
  RegistryWidgetsType,
  RJSFSchema,
  UiSchema,
} from '@rjsf/utils';
import { customizeValidator } from '@rjsf/validator-ajv8';
import Ajv2020 from 'ajv/dist/2020';
import { ComponentType, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import createJsonErrorTransformer, { type SchemaFormError } from '../utils/schema-form-error-handling';
import { type SchemaErrorNavigation, SchemaFormErrorSummary } from './schema-form-error-summary.component';
import { buildUiSchemaFromSchema } from './schema-form-ui-schema';

/**
 * RJSF re-renders only when its props change deeply, so following the same error twice would be swallowed and a
 * section collapsed in between would stay shut. Numbering each request makes every navigation a change.
 */
type NumberedErrorNavigation = SchemaErrorNavigation & { readonly request: number };

// Schemas declare $schema: draft 2020-12, which the default AJV8 validator (draft-07) cannot compile.
const validator = customizeValidator({ AjvClass: Ajv2020 });

const widgets: RegistryWidgetsType = jsonWidgets;

const fields: RegistryFieldsType = {
  FacilitySearchWidget: FacilitySearchField as any,
};

type SchemaFormProps = {
  schema: RJSFSchema;
  uiSchema?: UiSchema;
  formData?: any;
  onChange?: (data: any, e?: IChangeEvent) => void;
  onSubmit?: (payload: any, e: IChangeEvent) => void;
  arrayFieldTemplate?: ComponentType<ArrayFieldTemplateProps>;
  objectFieldTemplate?: ComponentType<any>;
  idPrefix?: string;
  disabled?: boolean;
  readonly?: boolean;
  defaultFormStateBehavior?: FormProps['experimental_defaultFormStateBehavior'];
  submitButtonOptions?: SubmitButtonOptions;
  /**
   * The form is submitted from elsewhere - Spara ärende in the sidebar, say - so it draws no submit
   * button of its own. Its `submitButtonActions` are still shown.
   */
  withoutSubmitButton?: boolean;
  /** Rendered beside the submit button, for actions that belong with saving rather than above the form. */
  submitButtonActions?: ReactNode;
  extraContent?: React.ReactNode;
  externalFields?: Readonly<Record<string, ReactNode>>;
  validationErrors?: readonly SchemaFormError[];
  onError?: FormProps['onError'];
  /** What marks a required field's label; the asterisk unless the form says otherwise. */
  requiredIndicator?: string;
  /** Leaves the fields' descriptions and help texts out, for a form that displays saved answers. */
  withoutFieldHelp?: boolean;
};

export default function SchemaForm({
  schema,
  uiSchema,
  formData,
  onChange,
  onSubmit,
  arrayFieldTemplate,
  objectFieldTemplate,
  idPrefix,
  disabled,
  readonly,
  defaultFormStateBehavior,
  submitButtonOptions,
  withoutSubmitButton,
  submitButtonActions,
  extraContent,
  externalFields,
  validationErrors,
  onError,
  requiredIndicator,
  withoutFieldHelp,
}: SchemaFormProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [errorNavigation, setErrorNavigation] = useState<NumberedErrorNavigation>();
  const navigateToError = useCallback((target: SchemaErrorNavigation) => {
    setErrorNavigation((previous) => ({ ...target, request: (previous?.request ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!errorNavigation) return;
    // Section disclosures consume the same request and open before the next paint.
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      const target = container?.ownerDocument.getElementById(errorNavigation.fieldId);
      const field = container?.ownerDocument.getElementById(`${errorNavigation.fieldId}__field`);
      const boundary = field ?? target;
      if (!container || !boundary || !container.contains(boundary)) return;
      const controlSelector =
        'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"]';
      const control = target?.matches(controlSelector)
        ? target
        : boundary.querySelector<HTMLElement>('select[aria-invalid="true"]:not(:disabled)') ??
          boundary.querySelector<HTMLElement>(controlSelector) ??
          boundary.querySelector<HTMLElement>('button:not(:disabled)');
      (control ?? boundary).focus({ preventScroll: true });
      boundary.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [errorNavigation]);
  const [localData, setLocalData] = useState<any>({});
  const data = formData ?? localData;

  const handleChange = useCallback<NonNullable<FormProps<any>['onChange']>>(
    (e) => {
      const fd = { ...e.formData };
      if (formData !== undefined) {
        onChange?.(fd, e);
      } else {
        setLocalData(fd);
      }
    },
    [formData, onChange]
  );

  const autoUi = useMemo(() => buildUiSchemaFromSchema(schema), [schema]);

  const handleSubmit = useCallback<NonNullable<FormProps<any>['onSubmit']>>(
    (e) => {
      const payload = e.formData;
      onSubmit?.(payload, e);
    },
    [onSubmit]
  );

  const effectiveUiSchema = uiSchema ?? autoUi;

  // Send original schema via formContext so ObjectFieldTemplate can read if/then conditions
  const formContext = useMemo(
    () => ({
      originalSchema: schema,
      submitButtonOptions,
      submitButtonActions,
      idPrefix,
      externalFields,
      errorNavigation,
      requiredIndicator,
      withoutFieldHelp,
    }),
    [
      externalFields,
      idPrefix,
      schema,
      submitButtonOptions,
      submitButtonActions,
      errorNavigation,
      requiredIndicator,
      withoutFieldHelp,
    ]
  );

  const templates: NonNullable<FormProps['templates']> = {
    ArrayFieldTemplate: ArrayObjectFieldTemplate,
    FieldTemplate,
    ObjectFieldTemplate: SectionsObjectFieldTemplate,
    ButtonTemplates: { SubmitButton: SubmitButtonFieldTemplate },
  };

  if (arrayFieldTemplate) {
    templates.ArrayFieldTemplate = arrayFieldTemplate;
  }

  if (objectFieldTemplate) {
    templates.ObjectFieldTemplate = objectFieldTemplate;
  }

  const formProps: FormProps = {
    schema: schema || { type: 'object', properties: {} },
    idPrefix,
    uiSchema: effectiveUiSchema,
    formData: data,
    formContext,
    onChange: handleChange,
    onSubmit: handleSubmit,
    onError,
    validator,
    fields,
    widgets,
    templates,
    transformErrors: createJsonErrorTransformer(schema),
    noHtml5Validate: true,
    showErrorList: false,
    disabled,
    readonly,
    experimental_defaultFormStateBehavior: defaultFormStateBehavior,
  };

  const formWithoutSubmit = disabled || readonly || withoutSubmitButton;
  return (
    <div ref={containerRef} className="w-full min-w-0 max-w-full">
      {validationErrors && <SchemaFormErrorSummary errors={validationErrors} onNavigate={navigateToError} />}
      <Form
        {...formProps}
        templates={
          formWithoutSubmit || extraContent
            ? { ...templates, ButtonTemplates: { SubmitButton: () => null } }
            : templates
        }
      >
        {extraContent ? (
          <>
            {extraContent}
            {!formWithoutSubmit && <SchemaSubmitButton options={submitButtonOptions} actions={submitButtonActions} />}
          </>
        ) : undefined}
      </Form>
      {/* The form renders no submit button when it is read-only or saved from elsewhere, but the actions
          beside it are not about saving and must stay reachable - a finished, locked document is handed
          on from here. */}
      {formWithoutSubmit && submitButtonActions && (
        <div className="mt-[3.2rem] flex flex-wrap items-center gap-16">{submitButtonActions}</div>
      )}
    </div>
  );
}
