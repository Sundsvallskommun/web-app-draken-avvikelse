import { Checkbox, PopupMenu, SearchField } from '@sk-web-gui/react';
import { useMetadataStore } from '@stores/index';
import {
  getClassificationDisplayName,
  getLabelsAtDepth,
  getSelectableSubTypes,
  getUniqueLabelDisplayNames,
} from '@supportmanagement/services/support-label-service';
import { ChevronDown } from 'lucide-react';
import { FC, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { SupportManagementFilter } from '../supportmanagement-filtering.component';

export interface LabelSubTypeFilter {
  labelSubType: string[];
}

export const LabelSubTypeValues: LabelSubTypeFilter = {
  labelSubType: [],
};

export const SupportManagementFilterLabelSubType: FC = () => {
  const { watch, setValue } = useFormContext<SupportManagementFilter>();
  const labelCategories = watch('labelCategory');
  const labelTypes = watch('labelType');
  const labelSubTypes = watch('labelSubType');
  const { register } = useFormContext<LabelSubTypeFilter>();
  const [query, setQuery] = useState<string>('');
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);

  const allStringSubTypes = useMemo(
    () =>
      getUniqueLabelDisplayNames(
        // Selected types take precedence over selected categories: once a type is picked, its
        // subtypes are listed wherever that type occurs, regardless of the category filter.
        labelTypes.length > 0
          ? getSelectableSubTypes(supportMetadata, [], labelTypes)
          : getSelectableSubTypes(supportMetadata, labelCategories)
      ),
    [supportMetadata, labelCategories, labelTypes]
  );
  const title = getClassificationDisplayName(getLabelsAtDepth(supportMetadata?.labels?.labelStructure, 3), 'Ärendetyp');

  return (
    <PopupMenu>
      <PopupMenu.Button
        rightIcon={<ChevronDown />}
        data-cy="Ärendetyp-filter"
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
          {allStringSubTypes
            ?.filter((s) => s?.toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => a.localeCompare(b))
            .map((s, idx) => (
              <PopupMenu.Item key={`${s}-${idx}`}>
                <Checkbox
                  labelPosition="left"
                  {...register('labelSubType')}
                  value={s}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setValue('labelSubType', [...labelSubTypes, ...allStringSubTypes.filter((t) => t === s)]);
                    } else {
                      setValue(
                        'labelSubType',
                        labelSubTypes.filter((t) => t !== s)
                      );
                    }
                  }}
                  data-cy={`Ärendetyp-filter-${s}`}
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
