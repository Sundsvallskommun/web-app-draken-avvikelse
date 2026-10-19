'use client';

import { ariaDescribedByIds, type WidgetProps } from '@rjsf/utils';
import { DatePicker } from '@sk-web-gui/react';

export function DateWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, onBlur, onChange, onFocus, options, rawErrors, required } = props;
  const customClassName = (options as any)?.className || 'w-full max-w-[40rem]';

  return (
    <DatePicker
      className={`${customClassName} min-w-0 max-w-full`}
      id={id}
      type="date"
      value={value ?? ''}
      disabled={disabled}
      readOnly={readonly}
      aria-describedby={ariaDescribedByIds(id)}
      aria-invalid={Boolean(rawErrors?.length)}
      // Required validation runs on save; untouched fields must not receive native :invalid styling.
      aria-required={required}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
