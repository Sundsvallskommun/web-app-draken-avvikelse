import { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { Checkbox, PopupMenu, SearchField } from '@sk-web-gui/react';
import { useMetadataStore } from '@stores/index';
import {
  getClassificationDisplayName,
  getLabelsAtDepth,
  getSelectableCategories,
  sortLabelsByDisplayName,
} from '@supportmanagement/services/support-label-service';
import { ChevronDown } from 'lucide-react';
import { FC, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { SupportManagementFilter } from '../supportmanagement-filtering.component';

export interface LabelCategoryFilter {
  labelCategory: string[];
}

export const LabelCategoryValues: LabelCategoryFilter = {
  labelCategory: [],
};

export const SupportManagementFilterLabelCategory: FC = () => {
  const { register, watch } = useFormContext<SupportManagementFilter>();
  const [query, setQuery] = useState<string>('');
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);

  const allLabelCategories = sortLabelsByDisplayName(getSelectableCategories(supportMetadata));
  const title = getClassificationDisplayName(
    getLabelsAtDepth(supportMetadata?.labels?.labelStructure, 1),
    'Verksamhet'
  );

  return (
    <PopupMenu>
      <PopupMenu.Button
        rightIcon={<ChevronDown />}
        data-cy="Verksamhet-filter"
        variant="tertiary"
        showBackground={false}
        size="sm"
        className="max-md:w-full"
      >
        {title}
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
          {allLabelCategories
            ?.filter((s: Label) => s.displayName?.toLowerCase().includes(query.toLowerCase()))
            .map((s: Label, idx) => (
              <PopupMenu.Item key={`${s.resourcePath}-${idx}`}>
                <Checkbox
                  labelPosition="left"
                  value={s.resourcePath}
                  {...register('labelCategory')}
                  data-cy={`Verksamhet-filter-${s.resourcePath}`}
                >
                  {s.displayName}
                </Checkbox>
              </PopupMenu.Item>
            ))}
        </PopupMenu.Items>
      </PopupMenu.Panel>
    </PopupMenu>
  );
};
