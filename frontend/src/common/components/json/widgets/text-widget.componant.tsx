'use client';

import { ariaDescribedByIds, type WidgetProps } from '@rjsf/utils';
import { Input } from '@sk-web-gui/react';

export function TextWidget({
  id,
  value,
  onBlur,
  onChange,
  onFocus,
  disabled,
  readonly,
  options,
  placeholder,
  rawErrors,
  required,
}: WidgetProps) {
  const customClassName = (options as any)?.className || 'w-full max-w-[48rem] h-[20rem]';

  return (
    <Input
      id={id}
      className={`${customClassName} min-w-0 max-w-full`}
      value={value ?? ''}
      placeholder={placeholder}
      disabled={Boolean(disabled)}
      readOnly={Boolean(readonly)}
      aria-describedby={ariaDescribedByIds(id)}
      aria-invalid={Boolean(rawErrors?.length)}
      // Required validation runs on save; untouched fields must not receive native :invalid styling.
      aria-required={required}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}
