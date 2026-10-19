import { sanitized } from '@common/services/sanitizer-service';
import { descriptionId, errorId, type FieldTemplateProps, titleId } from '@rjsf/utils';
import { FormControl, FormErrorMessage, FormLabel } from '@sk-web-gui/react';

export function FieldTemplate(props: FieldTemplateProps) {
  const { id, label, required, displayLabel, help, children, uiSchema, rawErrors, schema, hidden } = props;
  const formContext = props.registry?.formContext as
    | { requiredIndicator?: string; withoutFieldHelp?: boolean }
    | undefined;
  const requiredIndicator = formContext?.requiredIndicator ?? ' *';
  // A field may read as required although the schema only requires it conditionally, so that a
  // disabled state does not look optional.
  const showRequiredIndicator = required || uiSchema?.['ui:options']?.showRequiredIndicator === true;

  const hideLabel = uiSchema?.['ui:options']?.hideLabel;
  // A form that only displays saved answers says what was answered. How to answer - a field's description, its
  // help text - is written for the one filling the form in, often in another application altogether.
  const withoutHelp = formContext?.withoutFieldHelp === true;
  const hideDescription = withoutHelp || uiSchema?.['ui:options']?.hideDescription;
  const descriptionBelow = uiSchema?.['ui:options']?.descriptionBelow;
  const className = uiSchema?.['ui:options']?.className;

  if (hidden) {
    // Array and object fields render their own content even when their widget is hidden.
    // Keep them mounted for form state, but hide the entire field from view and accessibility.
    return <div hidden>{children}</div>;
  }

  const hasError = rawErrors && rawErrors.length > 0;
  const formControlClassName = className ? `form-row ${className}` : 'form-row w-full';

  // Get description from ui:description or schema.description
  const descriptionText = (uiSchema?.['ui:description'] as string) || (schema?.description as string) || '';
  const sanitizedDescription = sanitized(descriptionText);
  const hasHeader = (displayLabel && !hideLabel) || (!descriptionBelow && sanitizedDescription && !hideDescription);

  const renderDescription = (position: 'above' | 'below') => {
    if (!sanitizedDescription || hideDescription) return null;
    const marginClass = position === 'above' ? 'mb-2' : 'mt-2';
    return (
      <div
        id={descriptionId(id)}
        className={`text-xs text-muted-foreground ${marginClass} [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4`}
        dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
      />
    );
  };

  return (
    <FormControl className={`schema-field ${formControlClassName} min-w-0 max-w-full`} invalid={hasError}>
      {hasHeader && (
        <div className="schema-field-header flex min-w-0 flex-col gap-8">
          {displayLabel && !hideLabel && (
            <FormLabel id={titleId(id)} htmlFor={id} className="schema-form-label max-w-full whitespace-normal">
              {label}
              {showRequiredIndicator ? requiredIndicator : ''}
            </FormLabel>
          )}
          {!descriptionBelow && renderDescription('above')}
        </div>
      )}

      <div id={`${id}__field`} tabIndex={-1} className="schema-field-body flex min-w-0 max-w-full flex-col gap-8">
        {children}

        {descriptionBelow && renderDescription('below')}

        {hasError && (
          <FormErrorMessage id={errorId(id)} className="text-error">
            {rawErrors[0]}
          </FormErrorMessage>
        )}

        {withoutHelp ? null : help}
      </div>
    </FormControl>
  );
}
