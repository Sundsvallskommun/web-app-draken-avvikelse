'use client';

import { Combobox } from '@sk-web-gui/react';
import { FC } from 'react';

import type { FollowUpOption } from './unit-follow-up-rows';

interface FollowUpUnitFilterProps {
  label: string;
  options: readonly FollowUpOption[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
}

/**
 * Enhet: search among the units and choose any number of them. Only someone who reaches more than one
 * unit - a head of operations, LEX, MAS/MAR - has anything to choose between, so for a unit manager with a
 * single unit the filter is left out.
 */
export const FollowUpUnitFilter: FC<FollowUpUnitFilterProps> = ({ label, options, selected, onChange }) => {
  if (options.length < 2) return null;

  return (
    <Combobox
      multiple
      size="sm"
      placeholder={label}
      searchPlaceholder="Sök enhet..."
      value={[...selected]}
      onSelect={(event) => onChange(event.target.value as string[])}
      className="max-md:w-full md:w-[24rem]"
      data-cy="follow-up-filter-unit"
    >
      <Combobox.Input aria-label={label} className="w-full" data-cy="follow-up-filter-unit-input" />
      <Combobox.List>
        {options.map((option) => (
          <Combobox.Option key={option.value} value={option.value} data-cy={`follow-up-filter-unit-${option.value}`}>
            {option.label}
          </Combobox.Option>
        ))}
      </Combobox.List>
    </Combobox>
  );
};
