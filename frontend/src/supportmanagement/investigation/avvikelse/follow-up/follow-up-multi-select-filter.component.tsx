'use client';

import { Checkbox, PopupMenu } from '@sk-web-gui/react';
import { ChevronDown } from 'lucide-react';
import { FC } from 'react';

import type { FollowUpOption } from './unit-follow-up-rows';

interface FollowUpMultiSelectFilterProps {
  label: string;
  options: readonly FollowUpOption[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
  'data-cy'?: string;
}

/**
 * One filter chip with a checkbox per value, styled as the overview's filter chips. The chip says how many
 * values are chosen; a chip with nothing to offer is not shown at all.
 */
export const FollowUpMultiSelectFilter: FC<FollowUpMultiSelectFilterProps> = ({
  label,
  options,
  selected,
  onChange,
  'data-cy': dataCy,
}) => {
  if (options.length === 0) return null;

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((chosen) => chosen !== value) : [...selected, value]);

  // The panel opens beneath the chip, positioned against this wrapper as the overview's chips are.
  return (
    <div className="relative max-md:w-full">
      <PopupMenu>
        <PopupMenu.Button
          rightIcon={<ChevronDown />}
          variant="secondary"
          size="sm"
          className="max-md:w-full"
          data-cy={dataCy}
        >
          {selected.length > 0 ? `${label} (${selected.length})` : label}
        </PopupMenu.Button>
        <PopupMenu.Panel className="max-md:w-full max-h-[40rem] overflow-y-auto">
          <PopupMenu.Items>
            {options.map((option) => (
              <PopupMenu.Item key={option.value}>
                <Checkbox
                  labelPosition="left"
                  value={option.value}
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  data-cy={dataCy ? `${dataCy}-${option.value}` : undefined}
                >
                  {option.label}
                </Checkbox>
              </PopupMenu.Item>
            ))}
          </PopupMenu.Items>
        </PopupMenu.Panel>
      </PopupMenu>
    </div>
  );
};
