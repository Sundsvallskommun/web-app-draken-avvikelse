'use client';

import { Select } from '@sk-web-gui/react';
import { FC } from 'react';

interface FollowUpRiskFilterProps {
  label: string;
  values: readonly number[];
  selected: string;
  onChange: (selected: string) => void;
  'data-cy'?: string;
}

/** One risk value or all of them, among the values the investigation's calculation can give. */
export const FollowUpRiskFilter: FC<FollowUpRiskFilterProps> = ({
  label,
  values,
  selected,
  onChange,
  'data-cy': dataCy,
}) => {
  if (values.length === 0) return null;

  return (
    <Select
      size="sm"
      aria-label={label}
      value={selected}
      onChange={(event) => onChange(event.target.value)}
      className="max-md:w-full"
      data-cy={dataCy}
    >
      <Select.Option value="">{`${label}: alla`}</Select.Option>
      {values.map((value) => (
        <Select.Option key={value} value={String(value)}>
          {`${label}: ${value}`}
        </Select.Option>
      ))}
    </Select>
  );
};
