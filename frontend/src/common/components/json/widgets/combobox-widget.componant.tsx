'use client';

import { ariaDescribedByIds, titleId, type WidgetProps } from '@rjsf/utils';
import { Combobox, Input } from '@sk-web-gui/react';

export function ComboboxWidget(props: WidgetProps) {
  const {
    id,
    disabled,
    readonly,
    value,
    onBlur,
    onChange,
    onFocus,
    options = {},
    schema = {},
    rawErrors,
    required,
    label,
    hideLabel,
  } = props;
  // FieldTemplate also hides the label on ui:options.hideLabel, which RJSF's hideLabel does not cover.
  const labelHidden = Boolean(hideLabel || (options as any).hideLabel);

  const multiple =
    (options as any).multiple ?? (schema && typeof schema === 'object' && (schema as any).type === 'array');
  const enumOptions = ((options as any).enumOptions as { value: any; label: string }[]) ?? [];
  const placeholder = (options as any)?.placeholder || 'Sök/välj…';
  const customClassName = (options as any)?.className || 'w-full max-w-[40rem]';
  const currentValue = multiple ? (Array.isArray(value) ? value : value ? [value] : []) : value ?? '';
  const selectedValues = Array.isArray(currentValue) ? currentValue : [currentValue];
  const displayValue = selectedValues
    .filter((selectedValue) => selectedValue !== '')
    .map(
      (selectedValue) =>
        enumOptions.find((enumOption) => Object.is(enumOption.value, selectedValue))?.label ?? String(selectedValue)
    )
    .join(', ');
  const handleChange = (e: any) => {
    const raw = e?.target?.value;
    if (multiple) {
      const arr = Array.isArray(raw) ? raw : [raw];
      onChange(arr.filter((x) => x !== undefined && x !== null && x !== ''));
    } else {
      onChange(raw ?? '');
    }
  };

  if (disabled || readonly) {
    return (
      <Input
        id={id}
        className={`${customClassName} min-w-0 max-w-full`}
        value={displayValue}
        disabled={Boolean(disabled)}
        readOnly={Boolean(readonly)}
        aria-describedby={ariaDescribedByIds(id)}
        aria-invalid={Boolean(rawErrors?.length)}
        required={required}
        onBlur={() => onBlur(id, value)}
        onFocus={() => onFocus(id, value)}
      />
    );
  }

  return (
    <Combobox
      id={id}
      className={`${customClassName} min-w-0 max-w-full`}
      multiple={!!multiple}
      value={currentValue}
      aria-describedby={ariaDescribedByIds(id)}
      onChange={handleChange}
    >
      <Combobox.Input
        placeholder={placeholder}
        className="w-full min-w-0 max-w-full"
        aria-label={labelHidden ? label : undefined}
        aria-labelledby={labelHidden ? undefined : titleId(id)}
        aria-describedby={ariaDescribedByIds(id)}
        aria-invalid={Boolean(rawErrors?.length)}
        required={required}
        onBlur={() => onBlur(id, value)}
        onFocus={() => onFocus(id, value)}
      />
      <Combobox.List>
        {enumOptions.map((o) => (
          <Combobox.Option key={String(o.value)} value={o.value}>
            {o.label}
          </Combobox.Option>
        ))}
      </Combobox.List>
    </Combobox>
  );
}
