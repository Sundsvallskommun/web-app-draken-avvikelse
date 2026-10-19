'use client';

import { ariaDescribedByIds, type WidgetProps } from '@rjsf/utils';
import { Select } from '@sk-web-gui/react';

export function SelectWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, onBlur, onChange, onFocus, options, placeholder, rawErrors, required } = props;
  const enumOptions = (options?.enumOptions as { value: any; label: string }[]) || [];

  const currentValue = value === undefined || value === null ? '' : value;
  // The UI schema may set the width, as for the text widget; the capped width stays the default.
  const customClassName = typeof options?.className === 'string' ? options.className : 'w-full max-w-[48rem]';

  return (
    <Select
      className={`${customClassName} min-w-0 max-w-full`}
      id={id}
      value={currentValue}
      onChange={(e) => onChange(e.currentTarget.value || undefined)}
      disabled={Boolean(disabled || readonly)}
      aria-describedby={ariaDescribedByIds(id)}
      aria-invalid={Boolean(rawErrors?.length)}
      required={required}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
    >
      {/* Without an empty option the browser would show the first choice as selected while the value is unset. */}
      {(placeholder || currentValue === '') && <Select.Option value="">{placeholder || ''}</Select.Option>}
      {enumOptions.map((o) => (
        <Select.Option key={String(o.value)} value={o.value}>
          {o.label}
        </Select.Option>
      ))}
    </Select>
  );
}
