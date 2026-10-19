import { Checkbox, PopupMenu, SearchField } from '@sk-web-gui/react';
import { useMetadataStore } from '@stores/index';
import {
  getClassificationDisplayName,
  getLabelsAtDepth,
  getSelectableTypes,
  getUniqueLabelDisplayNames,
} from '@supportmanagement/services/support-label-service';
import { ChevronDown } from 'lucide-react';
import { FC, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { SupportManagementFilter } from '../supportmanagement-filtering.component';

export interface LabelTypeFilter {
  labelType: string[];
}

export const LabelTypeValues: LabelTypeFilter = {
  labelType: [],
};

export const SupportManagementFilterLabelType: FC = () => {
  const { watch, setValue } = useFormContext<SupportManagementFilter>();
  const labelCategories = watch('labelCategory');
  const labelTypes = watch('labelType');
  const { register } = useFormContext<LabelTypeFilter>();
  const [query, setQuery] = useState<string>('');
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);

  const allStringTypes = useMemo(
    () => getUniqueLabelDisplayNames(getSelectableTypes(supportMetadata, labelCategories)),
    [supportMetadata, labelCategories]
  );
  const title = getClassificationDisplayName(
    getLabelsAtDepth(supportMetadata?.labels?.labelStructure, 2),
    'Ärendekategori'
  );

  return (
    <PopupMenu>
      <PopupMenu.Button
        rightIcon={<ChevronDown />}
        data-cy="Ärendekategori-filter"
        variant="tertiary"
        showBackground={false}
        size="sm"
        className="max-md:w-full"
      >
        {title}
      </PopupMenu.Button>
      <PopupMenu.Panel className="max-md:w-full max-h-[70vh] h-auto overflow-y-auto">
        <SearchField
          size="md"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onReset={() => setQuery('')}
          placeholder="Skriv för att söka"
        />
        <PopupMenu.Items autoFocus={false}>
          {allStringTypes
            ?.filter((s) => s?.toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => a.localeCompare(b))
            .map((s, idx) => (
              <PopupMenu.Item key={`${s}-${idx}`}>
                <Checkbox
                  labelPosition="left"
                  {...register('labelType')}
                  value={s}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setValue('labelType', [...labelTypes, ...allStringTypes.filter((t) => t === s)]);
                    } else {
                      setValue(
                        'labelType',
                        labelTypes.filter((t) => t !== s)
                      );
                    }
                  }}
                  data-cy={`Ärendekategori-filter-${s}`}
                >
                  {s}
                </Checkbox>
              </PopupMenu.Item>
            ))
            ?.slice(0, labelCategories.length > 0 ? undefined : 115)}
        </PopupMenu.Items>
      </PopupMenu.Panel>
    </PopupMenu>
  );
};
