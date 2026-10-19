import { Checkbox, PopupMenu, SearchField } from '@sk-web-gui/react';
import { getSelectableChannels } from '@supportmanagement/services/support-errand-service';
import { ChevronDown } from 'lucide-react';
import { FC, useState } from 'react';
import { useFormContext } from 'react-hook-form';

export interface ChannelFilter {
  channel: string[];
}

export const ChannelValues: ChannelFilter = {
  channel: [],
};

export const SupportManagementFilterChannel: FC = () => {
  const { register } = useFormContext<ChannelFilter>();
  const [query, setQuery] = useState<string>('');

  return (
    <PopupMenu>
      <PopupMenu.Button
        rightIcon={<ChevronDown />}
        data-cy="Channel-filter"
        variant="tertiary"
        showBackground={false}
        size="sm"
        className="max-md:w-full"
      >
        Inkom via
      </PopupMenu.Button>
      <PopupMenu.Panel className="max-md:w-full max-h-[70vh] overflow-y-auto">
        <SearchField
          size="md"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onReset={() => setQuery('')}
          placeholder="Skriv för att söka"
        />
        <PopupMenu.Items autoFocus={false}>
          {getSelectableChannels()
            .filter((s: [string, string]) => s[1].toLowerCase().includes(query.toLowerCase()))
            .map((s: [string, string], idx) => (
              <PopupMenu.Item key={`${s[1]}-${idx}`}>
                <Checkbox labelPosition="left" value={s[0]} {...register('channel')} data-cy={`Channel-filter-${s[0]}`}>
                  {s[1]}
                </Checkbox>
              </PopupMenu.Item>
            ))}
        </PopupMenu.Items>
      </PopupMenu.Panel>
    </PopupMenu>
  );
};
