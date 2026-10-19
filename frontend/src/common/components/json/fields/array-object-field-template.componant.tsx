'use client';

import type { ArrayFieldTemplateProps, RJSFSchema } from '@rjsf/utils';
import { Button, cx } from '@sk-web-gui/react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringOption = (options: Record<string, unknown>, key: string): string | undefined =>
  typeof options[key] === 'string' ? options[key] : undefined;

const booleanOption = (options: Record<string, unknown>, key: string): boolean | undefined =>
  typeof options[key] === 'boolean' ? options[key] : undefined;

const getItemSchemaTitle = (schema: RJSFSchema): string | undefined => {
  const itemSchema = isRecord(schema.items) ? schema.items : undefined;
  return itemSchema && typeof itemSchema.title === 'string' ? itemSchema.title : undefined;
};

export function ArrayObjectFieldTemplate(props: ArrayFieldTemplateProps) {
  const { canAdd, className, disabled, idSchema, items, onAddClick, readonly, required, schema, title, uiSchema } =
    props;
  const uiOptions = isRecord(uiSchema?.['ui:options']) ? uiSchema['ui:options'] : {};
  const itemTitle = stringOption(uiOptions, 'itemTitle') ?? getItemSchemaTitle(schema) ?? 'Post';
  const addButtonLabel = stringOption(uiOptions, 'addButtonLabel') ?? 'Lägg till';
  const emptyMessage = stringOption(uiOptions, 'emptyMessage') ?? 'Inga poster har lagts till.';
  const showItemNumber = booleanOption(uiOptions, 'showItemNumber') ?? true;
  const formContext = props.registry?.formContext as
    | { requiredIndicator?: string; withoutFieldHelp?: boolean }
    | undefined;
  // A form that only displays saved answers leaves out how to give them, as FieldTemplate does.
  const description =
    formContext?.withoutFieldHelp === true
      ? undefined
      : stringOption(uiOptions, 'description') ??
        (typeof schema.description === 'string' ? schema.description : undefined);
  const isLocked = Boolean(disabled || readonly);
  const requiredIndicator = formContext?.requiredIndicator ?? ' *';

  return (
    <fieldset id={idSchema.$id} className={cx('w-full min-w-0 max-w-full', className)}>
      {title && (
        <legend className="mb-4 box-border max-w-full break-words text-label-medium font-bold whitespace-normal">
          {title}
          {required ? requiredIndicator : ''}
        </legend>
      )}
      {description && <p className="mb-12 text-small text-dark-secondary">{description}</p>}
      <div className="flex flex-col gap-16">
        {items.length === 0 && <p className="text-small text-dark-secondary">{emptyMessage}</p>}

        {items.map((item) => {
          const itemLocked = Boolean(isLocked || item.disabled || item.readonly);
          const showToolbar = Boolean(
            !itemLocked && item.hasToolbar && (item.hasMoveUp || item.hasMoveDown || item.hasCopy || item.hasRemove)
          );

          return (
            <section
              key={item.key}
              className="min-w-0 max-w-full overflow-hidden rounded-12 border-1 border-divider bg-background-content"
            >
              <div className="flex min-h-48 min-w-0 flex-wrap items-center justify-between gap-12 bg-background-200 px-16 py-8">
                <h4 className="min-w-0 break-words text-label-medium font-bold">
                  {itemTitle}
                  {showItemNumber ? ` ${item.index + 1}` : ''}
                </h4>

                {showToolbar && (
                  <div className="flex max-w-full flex-wrap items-center gap-4">
                    {(item.hasMoveUp || item.hasMoveDown) && (
                      <>
                        <Button
                          type="button"
                          variant="tertiary"
                          size="sm"
                          iconButton
                          aria-label={`Flytta ${itemTitle.toLocaleLowerCase('sv-SE')} ${item.index + 1} uppåt`}
                          disabled={itemLocked || !item.hasMoveUp}
                          onClick={item.onReorderClick(item.index, item.index - 1)}
                        >
                          <ArrowUp size={18} />
                        </Button>
                        <Button
                          type="button"
                          variant="tertiary"
                          size="sm"
                          iconButton
                          aria-label={`Flytta ${itemTitle.toLocaleLowerCase('sv-SE')} ${item.index + 1} nedåt`}
                          disabled={itemLocked || !item.hasMoveDown}
                          onClick={item.onReorderClick(item.index, item.index + 1)}
                        >
                          <ArrowDown size={18} />
                        </Button>
                      </>
                    )}
                    {item.hasCopy && (
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        iconButton
                        aria-label={`Kopiera ${itemTitle.toLocaleLowerCase('sv-SE')} ${item.index + 1}`}
                        disabled={itemLocked}
                        onClick={item.onCopyIndexClick(item.index)}
                      >
                        <Copy size={18} />
                      </Button>
                    )}
                    {item.hasRemove && (
                      <Button
                        type="button"
                        variant="tertiary"
                        color="error"
                        size="sm"
                        iconButton
                        aria-label={`Ta bort ${itemTitle.toLocaleLowerCase('sv-SE')} ${item.index + 1}`}
                        disabled={itemLocked}
                        onClick={item.onDropIndexClick(item.index)}
                      >
                        <Trash2 size={18} />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="min-w-0 max-w-full p-16">{item.children}</div>
            </section>
          );
        })}
      </div>

      {canAdd && !isLocked && (
        <Button
          type="button"
          className="mt-16 h-auto max-w-full whitespace-normal"
          variant="secondary"
          size="sm"
          leftIcon={<Plus size={18} />}
          disabled={isLocked}
          onClick={onAddClick}
        >
          {addButtonLabel}
        </Button>
      )}
    </fieldset>
  );
}
