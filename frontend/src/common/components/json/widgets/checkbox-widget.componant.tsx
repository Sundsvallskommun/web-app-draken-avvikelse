'use client';

import { ariaDescribedByIds, type WidgetProps } from '@rjsf/utils';
import { Checkbox, FormControl } from '@sk-web-gui/react';

export function CheckboxWidget({
  id,
  label,
  value,
  onBlur,
  onChange,
  onFocus,
  options,
  disabled,
  readonly,
  rawErrors,
  required,
}: WidgetProps) {
  const customClassName = (options as any)?.className || 'w-full max-w-[40rem]';

  return (
    <FormControl className={`${customClassName} min-w-0 max-w-full`} invalid={Boolean(rawErrors?.length)}>
      <Checkbox
        id={id}
        checked={!!value}
        disabled={!!(disabled || readonly)}
        aria-describedby={ariaDescribedByIds(id)}
        aria-invalid={Boolean(rawErrors?.length)}
        required={required}
        onBlur={() => onBlur(id, value)}
        onFocus={() => onFocus(id, value)}
        onChange={(e) => onChange(e.currentTarget.checked)}
      >
        {label}
      </Checkbox>
    </FormControl>
  );
}
