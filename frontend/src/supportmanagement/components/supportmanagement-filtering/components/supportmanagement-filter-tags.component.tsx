import { Admin } from '@common/services/user-service';
import { Chip } from '@sk-web-gui/react';
import { useMetadataStore } from '@stores/index';
import { useUiSettingsStore } from '@stores/ui-settings-store';
import type { LabelFilterGroupProjection } from '@supportmanagement/filters/label-filter-projector';
import { reduceLabelFilterSelection } from '@supportmanagement/filters/label-filter-selection';
import { Priority } from '@supportmanagement/interfaces/priority';
import { getChannelLabel, Status } from '@supportmanagement/services/support-errand-service';
import { SupportType } from '@supportmanagement/services/support-metadata-service';
import dayjs from 'dayjs';
import { FC, useEffect, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';

import { SupportManagementFilter, SupportManagementValues } from '../supportmanagement-filtering.component';

interface SupportManagementFilterTagsProps {
  administrators: Admin[];
  labelFilterProjections?: readonly LabelFilterGroupProjection[];
}

export const SupportManagementFilterTags: FC<SupportManagementFilterTagsProps> = ({
  administrators,
  labelFilterProjections,
}) => {
  const { watch, setValue, reset } = useFormContext<SupportManagementFilter>();
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const selectedSupportErrandStatuses = useUiSettingsStore((s) => s.selectedErrandStatuses);
  const categories = watch('category');
  const labelCategories = watch('labelCategory');
  const types = watch('type');
  const labelTypes = watch('labelType');
  const labelSubTypes = watch('labelSubType');
  const channels = watch('channel');
  const priorities = watch('priority');
  const startdate = watch('startdate');
  const enddate = watch('enddate');
  const admins = watch('admins');
  const labelFilterSelections = watch('labelFilter');

  const allCategories = supportMetadata?.categories;
  const allLabelCategories = supportMetadata?.labels?.labelStructure;

  const allTypes = useMemo(() => {
    const _types: SupportType[] = [];
    if (categories.length > 0) {
      categories?.forEach((category) => {
        const categoryTypes = supportMetadata?.categories?.find((c) => c.name === category)?.types;
        if (categoryTypes) {
          _types.push(...categoryTypes);
        }
      });
    } else {
      supportMetadata?.categories?.forEach((category) => {
        _types.push(...(category.types ?? []));
      });
    }
    return _types;
  }, [supportMetadata, categories]);

  useEffect(() => {
    if (categories.length > 0) {
      categories?.forEach((category) => {
        const categoryTypes = supportMetadata?.categories?.find((c) => c.name === category)?.types;
        types.filter((type) => {
          if (!categoryTypes?.find((ct) => ct.name === type)) {
            const newTypes = types.filter((_t) => _t !== type);
            setValue('type', newTypes);
          }
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportMetadata, categories, types]);

  const hasTags =
    categories.length > 0 ||
    labelCategories.length > 0 ||
    labelTypes.length > 0 ||
    labelSubTypes.length > 0 ||
    types.length > 0 ||
    channels.length > 0 ||
    priorities.length > 0 ||
    startdate ||
    enddate ||
    admins.length > 0 ||
    labelFilterSelections.length > 0;

  const labelFilterChoices = useMemo(
    () =>
      (labelFilterProjections ?? []).flatMap((group) =>
        group.fields.flatMap((field) =>
          field.choices.map((choice) => ({
            ...choice,
            fieldLabel: field.label,
          }))
        )
      ),
    [labelFilterProjections]
  );

  const handleRemoveCategory = (category: string) => {
    const newCategories = categories.filter((_c) => _c !== category);
    setValue('category', newCategories);
  };

  const handleRemoveLabelCategory = (category: string) => {
    const newCategories = labelCategories.filter((_c) => _c !== category);
    setValue('labelCategory', newCategories);
  };

  const handleRemoveType = (type: string) => {
    const newTypes = types.filter((_t) => _t !== type);
    setValue('type', newTypes);
  };

  const handleRemoveLabelType = (type: string) => {
    const newTypes = labelTypes.filter((_t) => _t !== type);
    setValue('labelType', newTypes);
  };

  const handleRemoveLabelSubType = (type: string) => {
    const newSubTypes = labelSubTypes.filter((_t) => _t !== type);
    setValue('labelSubType', newSubTypes);
  };

  const handleRemoveChannel = (channel: string) => {
    const newChannels = channels.filter((caseChannel) => caseChannel !== channel);
    setValue('channel', newChannels);
  };

  const handleRemovePriority = (priority: string) => {
    const newPriorities = priorities.filter((casePrio) => casePrio !== priority);
    setValue('priority', newPriorities);
  };

  const handleRemoveDates = () => {
    setValue('startdate', '');
    setValue('enddate', '');
  };

  const handleRemoveAdmin = (admin: string) => {
    const newAdmins = admins.filter((caseAdmin) => caseAdmin !== admin);
    setValue('admins', newAdmins);
  };

  const handleRemoveLabelFilter = (groupKey: string, fieldKey: string, resourcePath: string) => {
    if (!labelFilterProjections) return;
    setValue('labelFilter', [
      ...reduceLabelFilterSelection(
        labelFilterProjections,
        labelFilterSelections,
        { groupKey, fieldKey, resourcePath },
        false
      ),
    ]);
  };

  const getAdminName = (adminId: string) => {
    const fullAdmin = administrators.find((user) => (user?.adAccount?.toString() || user?.id.toString()) === adminId);
    return `${fullAdmin?.firstName} ${fullAdmin?.lastName}`;
  };

  const handleReset = () => {
    reset(SupportManagementValues);
    setValue('status', selectedSupportErrandStatuses as Status[]);
  };

  return (
    <div className="flex gap-8 flex-wrap justify-start">
      {categories.map((category, categoryIndex) => (
        <Chip
          key={`category-${categoryIndex}`}
          aria-label="Rensa verksamhet"
          onClick={() => handleRemoveCategory(category)}
        >
          {allCategories?.find((c) => c.name === category)?.displayName}
        </Chip>
      ))}
      {labelCategories.map((category, categoryIndex) => (
        <Chip
          key={`labelCategory-${categoryIndex}`}
          aria-label="Rensa verksamhet"
          onClick={() => handleRemoveLabelCategory(category)}
        >
          {allLabelCategories?.find((c) => c.resourcePath === category)?.displayName}
        </Chip>
      ))}
      {types.map((type, typeIndex) => (
        <Chip key={`caseType-${typeIndex}`} aria-label="Rensa ärendetyp" onClick={() => handleRemoveType(type)}>
          {allTypes?.find((t) => t.name === type)?.displayName}
        </Chip>
      ))}
      {labelTypes.map((labelType, typeIndex) => (
        <Chip
          key={`labelType-${typeIndex}`}
          aria-label="Rensa ärendetyp"
          onClick={() => handleRemoveLabelType(labelType)}
        >
          {labelType}
        </Chip>
      ))}
      {labelSubTypes.map((labelSubType, typeIndex) => (
        <Chip
          key={`labelSubType-${typeIndex}`}
          aria-label="Rensa ärendesubtyp"
          onClick={() => handleRemoveLabelSubType(labelSubType)}
        >
          {labelSubType}
        </Chip>
      ))}
      {channels.map((channel, channelIndex) => (
        <Chip key={`caseChannel-${channelIndex}`} aria-label="Rensa Kanal" onClick={() => handleRemoveChannel(channel)}>
          {getChannelLabel(channel)}
        </Chip>
      ))}
      {priorities.map((priority, prioIndex) => (
        <Chip key={`casePrio-${prioIndex}`} aria-label="Rensa prioritet" onClick={() => handleRemovePriority(priority)}>
          {(Priority as Record<string, string>)[priority]} prioritet
        </Chip>
      ))}

      {(startdate || enddate) && (
        <Chip aria-label="Rensa Tidsperiod" onClick={() => handleRemoveDates()}>
          {startdate && !enddate ? 'Från ' : !startdate && enddate ? 'Fram till ' : ''}
          {startdate && dayjs(startdate).format('D MMM YYYY')}
          {startdate && enddate && ' - '}
          {enddate && dayjs(enddate).format('D MMM YYYY')}
        </Chip>
      )}
      {administrators &&
        admins.map((admin, adminIndex) => (
          <Chip aria-label="Rensa Handläggare" key={`caseAdmin-${adminIndex}`} onClick={() => handleRemoveAdmin(admin)}>
            {getAdminName(admin)}
          </Chip>
        ))}

      {labelFilterSelections.map((selection) => {
        const choice = labelFilterChoices.find(
          (candidate) =>
            candidate.groupKey === selection.groupKey &&
            candidate.fieldKey === selection.fieldKey &&
            candidate.resourcePath === selection.resourcePath
        );
        if (!choice) return null;

        return (
          <Chip
            key={`${selection.groupKey}:${selection.fieldKey}:${selection.resourcePath}`}
            aria-label={`Rensa ${choice.fieldLabel}`}
            onClick={() => handleRemoveLabelFilter(selection.groupKey, selection.fieldKey, selection.resourcePath)}
          >
            {choice.fieldLabel}: {choice.displayName}
          </Chip>
        );
      })}

      {hasTags && (
        <button className="sk-chip" onClick={() => handleReset()}>
          Rensa alla
        </button>
      )}
    </div>
  );
};
