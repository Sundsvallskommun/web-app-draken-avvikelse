'use client';

import { ariaDescribedByIds, type WidgetProps } from '@rjsf/utils';
import { Textarea } from '@sk-web-gui/react';

/**
 * Multi-line plain text, for a schema whose string is text rather than markup. `textarea` renders the
 * rich-text editor and stores HTML, which a plain string written elsewhere - Katla's report, for one -
 * must not get.
 */
export function PlainTextareaWidget({
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
  const customClassName = (options as { className?: string })?.className || 'w-full max-w-[48rem]';

  return (
    <Textarea
      id={id}
      className={`${customClassName} min-w-0 max-w-full`}
      rows={6}
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
      // An emptied field is no answer, not an empty one, so a required field is still reported missing.
      onChange={(event) => onChange(event.currentTarget.value === '' ? undefined : event.currentTarget.value)}
    />
  );
}
