import { Admin } from '@common/services/user-service';
import { Checkbox, PopupMenu, SearchField } from '@sk-web-gui/react';
import { ChevronDown } from 'lucide-react';
import { FC, useState } from 'react';
import { useFormContext } from 'react-hook-form';

export interface CaseAdminsFilter {
  admins: string[];
}

export const CaseAdminsValues: CaseAdminsFilter = {
  admins: [],
};

interface SupportManagementFilterAdminsProps {
  administrators?: Admin[];
}

export const SupportManagementFilterAdmins: FC<SupportManagementFilterAdminsProps> = ({ administrators }) => {
  const { register } = useFormContext<CaseAdminsFilter>();
  const [query, setQuery] = useState<string>('');

  return (
    administrators && (
      <PopupMenu>
        <PopupMenu.Button
          rightIcon={<ChevronDown />}
          data-cy="Handläggare-filter"
          variant="tertiary"
          showBackground={false}
          size="sm"
          className="max-md:w-full"
        >
          Handläggare
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
            {administrators
              .sort((a, b) => (a.lastName > b.lastName ? 1 : -1))
              .filter(
                (admin) =>
                  admin.firstName.toLowerCase().includes(query.toLowerCase()) ||
                  admin.lastName.toLowerCase().includes(query.toLowerCase())
              )
              .map((admin, idx) => (
                <PopupMenu.Item key={`adminitem-${idx}`}>
                  <Checkbox
                    labelPosition="left"
                    data-cy={`Handläggare-filter-${admin.adAccount}`}
                    value={admin.adAccount?.toString() || admin.id.toString()}
                    {...register('admins')}
                  >
                    {admin.lastName} {admin.firstName}
                  </Checkbox>
                </PopupMenu.Item>
              ))}
          </PopupMenu.Items>
        </PopupMenu.Panel>
      </PopupMenu>
    )
  );
};
