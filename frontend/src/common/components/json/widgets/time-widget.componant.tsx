'use client';

import { ariaDescribedByIds, type WidgetProps } from '@rjsf/utils';
import { Input } from '@sk-web-gui/react';
import { useEffect } from 'react';

import { toSchemaTimeValue, toTimeInputValue } from '../utils/schema-time-value';

export function TimeWidget({
  id,
  value,
  onBlur,
  onChange,
  onFocus,
  disabled,
  readonly,
  options,
  rawErrors,
  required,
  schema,
}: WidgetProps) {
  const customClassName = typeof options.className === 'string' ? options.className : 'w-full max-w-[40rem]';
  const requiresRfc3339Time = schema.format === 'time';

  // A stored value without seconds or offset only satisfies the format once it is retyped, so
  // normalize it on load instead of letting the save fail on an untouched field.
  useEffect(() => {
    if (disabled || readonly || typeof value !== 'string' || value === '') return;
    const normalized = toSchemaTimeValue(value, requiresRfc3339Time);
    if (normalized !== value) onChange(normalized);
  }, [disabled, onChange, readonly, requiresRfc3339Time, value]);

  return (
    <Input
      id={id}
      className={`${customClassName} min-w-0 max-w-full`}
      type="time"
      value={toTimeInputValue(value)}
      disabled={Boolean(disabled)}
      readOnly={Boolean(readonly)}
      aria-describedby={ariaDescribedByIds(id)}
      aria-invalid={Boolean(rawErrors?.length)}
      // Required validation runs on save; untouched fields must not receive native :invalid styling.
      aria-required={required}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      onChange={(e) => onChange(toSchemaTimeValue(e.currentTarget.value, requiresRfc3339Time))}
    />
  );
}
