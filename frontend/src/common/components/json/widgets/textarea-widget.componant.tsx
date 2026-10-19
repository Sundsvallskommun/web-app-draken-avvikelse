'use client';

import type { WidgetProps } from '@rjsf/utils';

import { RjsfTextEditor } from './rjsf-text-editor.componant';

export function TextareaWidget(props: WidgetProps) {
  return (
    <RjsfTextEditor {...props} defaultClassName="case-description-editor max-w-[40rem] h-[10rem]" disableToolbar />
  );
}
