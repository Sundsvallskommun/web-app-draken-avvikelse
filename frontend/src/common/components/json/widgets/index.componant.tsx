import type { RegistryWidgetsType } from '@rjsf/utils';

import { CheckboxGroupWidget } from './checkbox-group-widget.componant';
import { CheckboxWidget } from './checkbox-widget.componant';
import { ComboboxWidget } from './combobox-widget.componant';
import { DateWidget } from './date-widget.componant';
import { PlainTextareaWidget } from './plain-textarea-widget.componant';
import { RadiobuttonWidget } from './radio-widget.componant';
import { TexteditorWidget } from './richtext-widget.componant';
import { SelectWidget } from './select-widget.componant';
import { TextWidget } from './text-widget.componant';
import { TextareaWidget } from './textarea-widget.componant';
import { TimeWidget } from './time-widget.componant';

/**
 * The canonical name of a widget is its PascalCase component name. A ui-schema authored
 * in this repo should use those names.
 *
 * CAUTION: `TextareaWidget` does not render a `<textarea>`. It renders the Quill editor and
 * stores HTML markup, and it also occupies RJSF's reserved `textarea` name below, so any schema
 * that asks for `textarea` gets rich text rather than plain text. Use `TextWidget` for plain
 * single-line text and `PlainTextareaWidget` for plain multi-line text.
 */
const baseWidgets = {
  TextWidget,
  SelectWidget,
  RadiobuttonWidget,
  CheckboxWidget,
  CheckboxGroupWidget,
  DateWidget,
  TimeWidget,
  ComboboxWidget,
  TexteditorWidget,
  TextareaWidget,
  PlainTextareaWidget,
} satisfies RegistryWidgetsType;

/**
 * Lower-case entries serve two distinct purposes; keep them apart when editing this table.
 *
 * 1. RJSF built-in overrides. RJSF resolves a widget by these reserved names — either from
 *    `ui:widget` or implicitly from the schema (`format: "date"` -> `date`, `format: "time"` -> `time`,
 *    `type: "boolean"` -> `checkbox`, `enum` -> `select`). Mapping them here is what keeps RJSF from
 *    rendering unstyled native inputs outside the design system: `select`, `radio`, `checkbox`,
 *    `checkboxes`, `date`, `time`, `textarea`. Removing one silently reverts that field to a raw
 *    HTML control, so these must stay.
 *
 * 2. Spelling tolerance for ui-schemas that arrive from the external JSON schema service, whose
 *    naming we do not control: `RadioWidget`, `text`, `radiobutton`, `combobox`, `texteditor`.
 */
export const jsonWidgets = {
  ...baseWidgets,
  RadioWidget: baseWidgets.RadiobuttonWidget,
  text: baseWidgets.TextWidget,
  select: baseWidgets.SelectWidget,
  radio: baseWidgets.RadiobuttonWidget,
  radiobutton: baseWidgets.RadiobuttonWidget,
  checkbox: baseWidgets.CheckboxWidget,
  checkboxes: baseWidgets.CheckboxGroupWidget,
  date: baseWidgets.DateWidget,
  time: baseWidgets.TimeWidget,
  combobox: baseWidgets.ComboboxWidget,
  texteditor: baseWidgets.TexteditorWidget,
  textarea: baseWidgets.TextareaWidget,
} satisfies RegistryWidgetsType;
