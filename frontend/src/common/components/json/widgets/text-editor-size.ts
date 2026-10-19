/**
 * How much a text editor shows before it starts to grow with its text, named by how much text that is at the
 * investigation form's width: `medium` about 1 000 characters, `large` about 3 000. The editor still grows
 * beyond it; the size is only where it starts.
 */
const TEXT_EDITOR_SIZE_CLASS_NAMES = {
  medium: 'min-h-[30rem]',
  large: 'min-h-[80rem]',
} as const;

export type TextEditorSize = keyof typeof TEXT_EDITOR_SIZE_CLASS_NAMES;

/** The class for a `ui:options.size`, or nothing for a size the editor does not know. */
export const textEditorSizeClassName = (size: unknown): string | undefined =>
  typeof size === 'string' && Object.hasOwn(TEXT_EDITOR_SIZE_CLASS_NAMES, size)
    ? TEXT_EDITOR_SIZE_CLASS_NAMES[size as TextEditorSize]
    : undefined;
