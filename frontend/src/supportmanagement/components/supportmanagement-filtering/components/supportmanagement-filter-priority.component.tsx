import { PriorityComponent } from '@common/components/priority/priority.component';
import { Checkbox, PopupMenu } from '@sk-web-gui/react';
import { Priority } from '@supportmanagement/interfaces/priority';
import { ChevronDown } from 'lucide-react';
import { FC } from 'react';
import { useFormContext } from 'react-hook-form';

export interface SupportManagementPriorityFilter {
  priority: string[];
}

export const SupportManagementPriorityValues: SupportManagementPriorityFilter = {
  priority: [],
};

export const SupportManagementFilterPriority: FC = () => {
  const { register } = useFormContext<SupportManagementPriorityFilter>();

  return (
    <PopupMenu>
      <PopupMenu.Button
        rightIcon={<ChevronDown />}
        data-cy="Prioritet-filter"
        variant="tertiary"
        showBackground={false}
        size="sm"
        className="max-md:w-full"
      >
        Prio
      </PopupMenu.Button>
      <PopupMenu.Panel className="max-md:w-full">
        <PopupMenu.Items>
          {Object.entries(Priority).map((s: [string, string], idx) => (
            <PopupMenu.Item key={`${s[1]}-${idx}`}>
              <Checkbox
                labelPosition="left"
                value={s[0]}
                {...register('priority')}
                data-cy={`Prioritet-filter-${s[0]}`}
              >
                <span className="flex gap-12 items-center">
                  <PriorityComponent priority={s[1]} />
                </span>
              </Checkbox>
            </PopupMenu.Item>
          ))}
        </PopupMenu.Items>
      </PopupMenu.Panel>
    </PopupMenu>
  );
};
