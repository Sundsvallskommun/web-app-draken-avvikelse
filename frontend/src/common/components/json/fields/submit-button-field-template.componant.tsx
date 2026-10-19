import { SubmitButtonProps } from '@rjsf/utils';
import { Button } from '@sk-web-gui/react';
import { Plus } from 'lucide-react';
import { ReactNode } from 'react';

export interface SubmitButtonOptions {
  label?: string;
  variant?: 'link' | 'primary' | 'secondary' | 'tertiary' | 'ghost';
  color?: 'info' | 'success' | 'primary' | 'warning' | 'error' | 'vattjom' | 'gronsta' | 'bjornstigen' | 'juniskar';
  className?: string;
  leadingIcon?: boolean | string;
  loading?: boolean;
  disabled?: boolean;
}

type SchemaSubmitButtonProps = {
  options?: SubmitButtonOptions;
  /** Actions that belong beside the submit button, such as handing the errand on when it is saved. */
  actions?: ReactNode;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isButtonVariant(value: unknown): value is NonNullable<SubmitButtonOptions['variant']> {
  return value === 'link' || value === 'primary' || value === 'secondary' || value === 'tertiary' || value === 'ghost';
}

function isButtonColor(value: unknown): value is NonNullable<SubmitButtonOptions['color']> {
  return (
    value === 'info' ||
    value === 'success' ||
    value === 'primary' ||
    value === 'warning' ||
    value === 'error' ||
    value === 'vattjom' ||
    value === 'gronsta' ||
    value === 'bjornstigen' ||
    value === 'juniskar'
  );
}

function readSubmitButtonOptions(uiOptions: unknown, formOptions: unknown): SubmitButtonOptions {
  const rawOptions = {
    ...(isRecord(uiOptions) ? uiOptions : {}),
    ...(isRecord(formOptions) ? formOptions : {}),
  };

  return {
    label: typeof rawOptions.label === 'string' ? rawOptions.label : undefined,
    variant: isButtonVariant(rawOptions.variant) ? rawOptions.variant : undefined,
    color: isButtonColor(rawOptions.color) ? rawOptions.color : undefined,
    className: typeof rawOptions.className === 'string' ? rawOptions.className : undefined,
    leadingIcon:
      typeof rawOptions.leadingIcon === 'boolean' || typeof rawOptions.leadingIcon === 'string'
        ? rawOptions.leadingIcon
        : undefined,
    loading: typeof rawOptions.loading === 'boolean' ? rawOptions.loading : undefined,
    disabled: typeof rawOptions.disabled === 'boolean' ? rawOptions.disabled : undefined,
  };
}

export function SchemaSubmitButton({ options = {}, actions }: Readonly<SchemaSubmitButtonProps>) {
  const label = options.label || 'Lägg till';
  const variant = options.variant || 'primary';
  const className = options.className || 'mt-[3.2rem] min-w-0 max-w-full';
  const leadingIcon = options.leadingIcon !== false;
  const loading = options.loading === true;
  const disabled = options.disabled === true || loading;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-16">
        <Button
          type="submit"
          className="h-auto max-w-full whitespace-normal"
          data-cy="schema-submit-button"
          variant={variant}
          color={options.color}
          leftIcon={leadingIcon ? <Plus /> : undefined}
          loading={loading}
          disabled={disabled}
        >
          {label}
        </Button>
        {actions}
      </div>
    </div>
  );
}

export function SubmitButtonFieldTemplate(props: SubmitButtonProps) {
  const buttonOptions = readSubmitButtonOptions(
    props.uiSchema?.['ui:options'],
    props.registry.formContext?.submitButtonOptions
  );

  return <SchemaSubmitButton options={buttonOptions} actions={props.registry.formContext?.submitButtonActions} />;
}
