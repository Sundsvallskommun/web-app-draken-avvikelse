import { Button, DatePicker, PopupMenu } from '@sk-web-gui/react';
import dayjs from 'dayjs';
import { ChevronDown } from 'lucide-react';
import { FC, useState } from 'react';
import { useFormContext } from 'react-hook-form';

export interface SupportManagementDatesFilter {
  startdate: string;
  enddate: string;
}

export const SupportManagementDatesValues = {
  startdate: '',
  enddate: '',
};

export const SupportManagementFilterDates: FC = () => {
  const [open, setOpen] = useState<boolean>(false);
  const { setValue, watch } = useFormContext<SupportManagementDatesFilter>();

  const [startDate, setStartDate] = useState<string>(watch('startdate'));
  const [endDate, setEndDate] = useState<string>(watch('enddate'));

  const handleApply = () => {
    setValue('startdate', startDate);
    setValue('enddate', endDate);
    setOpen(false);
  };
  return (
    <PopupMenu type="dialog" open={open} onToggleOpen={setOpen}>
      <PopupMenu.Button
        rightIcon={<ChevronDown />}
        data-cy="Tidsperiod-filter"
        variant="tertiary"
        showBackground={false}
        size="sm"
        className="max-md:w-full"
      >
        Tidsperiod
      </PopupMenu.Button>
      <PopupMenu.Panel className="max-md:w-full">
        <DatePicker
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          data-cy="validFrom-input"
          max={dayjs(endDate).format('YYYY-MM-DD')}
        />
        <DatePicker
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          data-cy="validTo-input"
          min={startDate ? dayjs(startDate).format('YYYY-MM-DD') : undefined}
        />
        <Button data-cy="Tidsperiod-button" onClick={() => handleApply()}>
          Visa tidsperiod
        </Button>
      </PopupMenu.Panel>
    </PopupMenu>
  );
};
