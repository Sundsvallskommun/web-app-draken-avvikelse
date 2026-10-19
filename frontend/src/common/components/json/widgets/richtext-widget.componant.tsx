'use client';

import type { WidgetProps } from '@rjsf/utils';

import { RjsfTextEditor } from './rjsf-text-editor.componant';

export function TexteditorWidget(props: WidgetProps) {
  return (
    <RjsfTextEditor {...props} defaultClassName="h-[22rem]" disableToolbar={props.options.disableToolbar !== false} />
  );
}
