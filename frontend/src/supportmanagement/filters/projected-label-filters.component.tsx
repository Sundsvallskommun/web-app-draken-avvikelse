'use client';

import { Checkbox, PopupMenu } from '@sk-web-gui/react';
import { ChevronDown } from 'lucide-react';

import type { LabelFilterGroupProjection, LabelFilterSelection } from './label-filter-projector';
import {
  getVisibleLabelFilterChoices,
  isLabelFilterChoiceSelected,
  normalizeLabelFilterSelections,
  reduceLabelFilterSelection,
} from './label-filter-selection';

export interface ProjectedLabelFiltersProps {
  readonly projections: readonly LabelFilterGroupProjection[];
  readonly selections: readonly LabelFilterSelection[];
  readonly onChange: (selections: readonly LabelFilterSelection[]) => void;
}

/**
 * Generic controlled UI for projected Support Management label filters. The
 * component has no application knowledge; identity and hierarchy come entirely
 * from the supplied projections.
 */
export const ProjectedLabelFilters = ({ projections, selections, onChange }: ProjectedLabelFiltersProps) => {
  const normalizedSelections = normalizeLabelFilterSelections(projections, selections);

  return (
    <div className="flex flex-wrap gap-8">
      {projections.map((group) => (
        <fieldset key={group.key} aria-label={group.label} className="m-0 flex min-w-0 flex-wrap gap-8 border-0 p-0">
          {group.fields.map((field) => {
            const choices = getVisibleLabelFilterChoices(projections, group.key, field.key, normalizedSelections);
            const selectedCount = normalizedSelections.filter(
              (selection) => selection.groupKey === group.key && selection.fieldKey === field.key
            ).length;

            return (
              <div key={`${group.key}:${field.key}`} className="relative max-md:w-full">
                <PopupMenu>
                  <PopupMenu.Button
                    rightIcon={<ChevronDown />}
                    variant="tertiary"
                    showBackground={false}
                    size="sm"
                    data-group-key={group.key}
                    data-field-key={field.key}
                  >
                    {field.label}
                    {selectedCount > 0 ? ` (${selectedCount})` : ''}
                  </PopupMenu.Button>
                  <PopupMenu.Panel className="max-h-[70vh] overflow-y-auto">
                    <PopupMenu.Items autoFocus={false}>
                      {choices.length > 0 ? (
                        choices.map((choice) => (
                          <PopupMenu.Item key={`${choice.groupKey}:${choice.fieldKey}:${choice.resourcePath}`}>
                            <Checkbox
                              labelPosition="left"
                              value={choice.resourcePath}
                              checked={isLabelFilterChoiceSelected(choice, normalizedSelections)}
                              data-group-key={choice.groupKey}
                              data-field-key={choice.fieldKey}
                              data-resource-path={choice.resourcePath}
                              onChange={(event) =>
                                onChange(
                                  reduceLabelFilterSelection(
                                    projections,
                                    normalizedSelections,
                                    choice,
                                    event.target.checked
                                  )
                                )
                              }
                            >
                              {choice.displayName}
                            </Checkbox>
                          </PopupMenu.Item>
                        ))
                      ) : (
                        <span className="block p-12 text-small">Inga val tillgängliga</span>
                      )}
                    </PopupMenu.Items>
                  </PopupMenu.Panel>
                </PopupMenu>
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
};
