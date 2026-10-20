// @vitest-environment jsdom
import type { WidgetProps } from '@rjsf/utils';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { ComboboxWidget, isSameSelection } from './combobox-widget.componant';

/**
 * The design system's Combobox as the browser runs it under React's strict mode: it reports the value it was given
 * when it mounts, and the chosen value when an option is picked.
 */
vi.mock('@sk-web-gui/react', () => {
  const Combobox = ({
    value,
    onChange,
    children,
  }: {
    value: unknown;
    onChange: (event: { target: { value: unknown } }) => void;
    children: ReactNode;
  }) => {
    useEffect(() => {
      onChange({ target: { value } });
      // Once, on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div>
        <button type="button" onClick={() => onChange({ target: { value: ['a', 'b'] } })}>
          Välj b
        </button>
        {children}
      </div>
    );
  };
  function ComboboxInput() {
    return null;
  }
  function ComboboxList({ children }: { children: ReactNode }) {
    return <>{children}</>;
  }
  function ComboboxOption() {
    return null;
  }
  Combobox.Input = ComboboxInput;
  Combobox.List = ComboboxList;
  Combobox.Option = ComboboxOption;
  return { Combobox, Input: ComboboxInput };
});

afterEach(cleanup);

const widget = (overrides: Partial<WidgetProps>) =>
  ({
    id: 'causes',
    name: 'causes',
    label: 'Orsaker',
    value: ['a'],
    options: { multiple: true, enumOptions: [] },
    schema: { type: 'array' },
    onChange: vi.fn(),
    onBlur: vi.fn(),
    onFocus: vi.fn(),
    registry: {},
    ...overrides,
  } as unknown as WidgetProps);

// Passing that report on made RJSF write the whole form back from the state it held then, which is how an unlocked
// investigation kept reading as completed.
test('does not pass on the value the combobox reports when it mounts', () => {
  const props = widget({});
  render(<ComboboxWidget {...props} />);

  expect(props.onChange).not.toHaveBeenCalled();
});

test('passes on a selection that changed', () => {
  const props = widget({});
  render(<ComboboxWidget {...props} />);

  fireEvent.click(screen.getByRole('button', { name: 'Välj b' }));

  expect(props.onChange).toHaveBeenCalledWith(['a', 'b']);
});

test('compares selections whatever their order', () => {
  expect(isSameSelection(['a', 'b'], ['b', 'a'])).toBe(true);
  expect(isSameSelection(['a'], ['a', 'b'])).toBe(false);
  expect(isSameSelection([], [])).toBe(true);
});
