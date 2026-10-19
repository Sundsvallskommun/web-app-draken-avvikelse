'use client';

import { Chip } from '@sk-web-gui/react';
import { FC } from 'react';

import type { ActiveFollowUpFilter } from './unit-follow-up-active-filters';
import type { UnitFollowUpFilters } from './unit-follow-up-filters';

interface UnitFollowUpFilterChipsProps {
  active: readonly ActiveFollowUpFilter[];
  onFiltersChange: (filters: UnitFollowUpFilters) => void;
}

/** The chosen values as chips under the filter bar, as the overview shows its own; a chip takes its value away. */
export const UnitFollowUpFilterChips: FC<UnitFollowUpFilterChipsProps> = ({ active, onFiltersChange }) => {
  if (active.length === 0) return null;

  return (
    <div className="flex gap-8 flex-wrap justify-start" data-cy="follow-up-filter-chips">
      {active.map((filter) => (
        <Chip
          key={filter.key}
          aria-label={`Rensa ${filter.text}`}
          onClick={() => onFiltersChange(filter.without)}
          data-cy={`follow-up-filter-chip-${filter.key}`}
        >
          {filter.text}
        </Chip>
      ))}
    </div>
  );
};
