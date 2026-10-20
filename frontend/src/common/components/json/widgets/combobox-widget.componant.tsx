'use client';

import { ariaDescribedByIds, titleId, type WidgetProps } from '@rjsf/utils';
import { Combobox, Input } from '@sk-web-gui/react';

/** The same values chosen, whatever their order: a combobox offers no way to reorder a selection. */
export const isSameSelection = (first: readonly unknown[], second: readonly unknown[]): boolean =>
  first.length === second.length && first.every((value) => second.some((other) => Object.is(other, value)));

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
  // The design system's Combobox reports its value when it mounts - twice under React's strict mode - which is no
  // change. Passed on, it makes RJSF write the field back together with the form state it holds at that moment: a
  // stale one while the form data is being replaced from outside, as when a locked investigation is unlocked and the
  // field turns from a read-only input into this combobox.
  const handleChange = (e: any) => {
    const raw = e?.target?.value;
    if (multiple) {
      const arr = (Array.isArray(raw) ? raw : [raw]).filter((x) => x !== undefined && x !== null && x !== '');
      if (isSameSelection(arr, selectedValues)) return;
      onChange(arr);
    } else {
      const next = raw ?? '';
      if (Object.is(next, currentValue)) return;
      onChange(next);
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
