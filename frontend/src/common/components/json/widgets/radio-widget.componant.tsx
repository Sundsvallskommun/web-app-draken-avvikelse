'use client';

import { ariaDescribedByIds, optionId, titleId, type WidgetProps } from '@rjsf/utils';
import { FormControl, RadioButton } from '@sk-web-gui/react';

export function RadiobuttonWidget({
  id,
  value,
  onBlur,
  onChange,
  onFocus,
  options,
  disabled,
  readonly,
  label,
  hideLabel,
  rawErrors,
  required,
}: WidgetProps) {
  const enumOptions = (options?.enumOptions as { value: any; label: string }[]) ?? [];
  const customClassName = (options as any)?.className || 'w-full max-w-[40rem]';
  // FieldTemplate also hides the label on ui:options.hideLabel, which RJSF's hideLabel does not cover.
  const labelHidden = Boolean(hideLabel || options.hideLabel);

  return (
    <FormControl className={`${customClassName} min-w-0 max-w-full`} invalid={Boolean(rawErrors?.length)}>
      <div
        className="flex min-w-0 max-w-full flex-wrap gap-12"
        id={id}
        role="radiogroup"
        aria-label={labelHidden ? label : undefined}
        aria-labelledby={labelHidden ? undefined : titleId(id)}
        aria-describedby={ariaDescribedByIds(id)}
        aria-invalid={Boolean(rawErrors?.length)}
        aria-required={required}
      >
        {enumOptions.map((o, index) => (
          <RadioButton
            key={String(o.value)}
            id={optionId(id, index)}
            className="schema-radio-option items-start"
            name={id}
            value={o.value}
            checked={value === o.value}
            disabled={!!(disabled || readonly)}
            required={required}
            onBlur={() => onBlur(id, value)}
            onFocus={() => onFocus(id, value)}
            onChange={() => onChange(o.value)}
          >
            {o.label}
          </RadioButton>
        ))}
      </div>
    </FormControl>
  );
}
