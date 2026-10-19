'use client';

import { Button, DatePicker, PopupMenu } from '@sk-web-gui/react';
import { ChevronDown } from 'lucide-react';
import { FC, useEffect, useState } from 'react';

import type { UnitFollowUpPeriod } from './unit-follow-up-service';

interface FollowUpPeriodFilterProps {
  period: UnitFollowUpPeriod;
  onChange: (period: UnitFollowUpPeriod) => void;
}

/**
 * Tidsperiod, as the errand overview asks for it: two dates applied together. The period decides which
 * errands are read, so it is applied only when both ends are set and in order.
 */
export const FollowUpPeriodFilter: FC<FollowUpPeriodFilterProps> = ({ period, onChange }) => {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  useEffect(() => {
    setFrom(period.from);
    setTo(period.to);
  }, [period]);

  const valid = from !== '' && to !== '' && from <= to;

  return (
    <div className="relative max-md:w-full">
      <PopupMenu type="dialog" open={open} onToggleOpen={setOpen}>
        <PopupMenu.Button
          rightIcon={<ChevronDown />}
          variant="secondary"
          size="sm"
          className="max-md:w-full"
          data-cy="follow-up-period-filter"
        >
          Tidsperiod
        </PopupMenu.Button>
        <PopupMenu.Panel className="max-md:w-full">
          <DatePicker
            aria-label="Från och med"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            data-cy="follow-up-period-from"
          />
          <DatePicker
            aria-label="Till och med"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            data-cy="follow-up-period-to"
          />
          <Button
            disabled={!valid}
            onClick={() => {
              onChange({ from, to });
              setOpen(false);
            }}
            data-cy="follow-up-period-apply"
          >
            Visa tidsperiod
          </Button>
        </PopupMenu.Panel>
      </PopupMenu>
    </div>
  );
};
