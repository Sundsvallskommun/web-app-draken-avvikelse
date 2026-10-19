import { useDebounceEffect } from '@common/utils/useDebounceEffect';
import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { useUiSettingsStore } from '@stores/ui-settings-store';
import {
  parsePersistedLabelFilterSelections,
  serializeLabelFilterSelections,
  SUPPORT_MANAGEMENT_LABEL_FILTER_PARAMETER,
} from '@supportmanagement/filters/label-filter-persistence';
import type { LabelFilterSelection } from '@supportmanagement/filters/label-filter-projector';
import { projectLabelFilterGroups } from '@supportmanagement/filters/label-filter-projector';
import { normalizeLabelFilterSelections } from '@supportmanagement/filters/label-filter-selection';
import {
  LEGACY_LABEL_SUBTYPE_DEPTH,
  LEGACY_LABEL_TYPE_DEPTH,
  legacyLabelFilterResourcePaths,
} from '@supportmanagement/filters/legacy-label-filter';
import { useInvestigationProfileStore } from '@supportmanagement/investigation/investigation-profile-store';
import {
  overviewLabelFilterGroups,
  resolveOverviewFilterToggle,
} from '@supportmanagement/investigation/investigation-variant';
import { getInvestigationOverviewFilterToggle } from '@supportmanagement/investigation/investigation-variant-registry';
import {
  getLabelSubTypeFromName,
  getLabelTypeFromName,
  getStatusLabel,
  Status,
  useSupportErrands,
} from '@supportmanagement/services/support-errand-service';
import {
  getSelectableCategories,
  getSelectableSubTypes,
  getSelectableTypes,
  getUniqueLabelDisplayNames,
} from '@supportmanagement/services/support-label-service';
import { useRouter } from 'next/navigation';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import SupportManagementFiltering, {
  type SupportManagementFilter,
  type SupportManagementLabelFilterState,
  SupportManagementValues,
} from '../supportmanagement-filtering/supportmanagement-filtering.component';
import { SupportErrandsTable } from './components/supporterrands-table.component';

export interface TableForm {
  sortOrder: 'asc' | 'desc';
  sortColumn: string;
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  pageSize: number;
}

type SupportMetadataValue = NonNullable<Parameters<typeof getSelectableCategories>[0]>;

/** The stored filters only the label metadata can read back into their controls. */
const LEGACY_LABEL_FILTER_KEYS: readonly string[] = ['labelCategory', 'labelType', 'labelSubType'];
const STORED_LABEL_FILTER_KEYS: readonly string[] = [
  ...LEGACY_LABEL_FILTER_KEYS,
  SUPPORT_MANAGEMENT_LABEL_FILTER_PARAMETER,
];

const pickStoredEntries = (
  storedFilter: Readonly<Record<string, string | boolean>>,
  keys: readonly string[]
): Record<string, string | boolean> =>
  Object.fromEntries(Object.entries(storedFilter).filter(([key]) => keys.includes(key)));

const readStoredList = <T extends string>(value: string | boolean | undefined, fallback: readonly T[]): T[] => {
  if (typeof value !== 'string' || value.length === 0) return [...fallback];
  return value.split(',') as T[];
};

const readLegacyDisplayNames = (
  value: string | boolean | undefined,
  supportMetadata: SupportMetadataValue,
  selectableNames: readonly string[],
  findLabel: (name: string, metadata: SupportMetadataValue) => { readonly displayName?: string } | undefined
): string[] => [
  ...new Set(
    readStoredList(value, [])
      .map((name) => findLabel(name, supportMetadata)?.displayName)
      .filter(
        (displayName): displayName is string => typeof displayName === 'string' && selectableNames.includes(displayName)
      )
  ),
];

interface RestoreStoredFilterInput {
  readonly storedFilter: Readonly<Record<string, string | boolean>>;
  /** Undefined while it is on its way: the label filters are then left out, and restored once it is there. */
  readonly supportMetadata: SupportMetadataValue | undefined;
  readonly labelFilterState: SupportManagementLabelFilterState;
  readonly username: string;
}

const restoreStoredFilter = ({
  storedFilter,
  supportMetadata,
  labelFilterState,
  username,
}: RestoreStoredFilterInput): SupportManagementFilter => {
  const legacyLabels = labelFilterState.status === 'legacy';
  const selectableCategoryPaths = new Set(
    getSelectableCategories(supportMetadata).map(({ resourcePath }) => resourcePath)
  );
  const selectableTypeNames = getUniqueLabelDisplayNames(getSelectableTypes(supportMetadata));
  const selectableSubTypeNames = getUniqueLabelDisplayNames(getSelectableSubTypes(supportMetadata));
  const projectedSelections =
    labelFilterState.status === 'ready'
      ? normalizeLabelFilterSelections(
          labelFilterState.projections,
          parsePersistedLabelFilterSelections(storedFilter[SUPPORT_MANAGEMENT_LABEL_FILTER_PARAMETER])
        )
      : [];
  const labelCategory = legacyLabels
    ? readStoredList(storedFilter.labelCategory, SupportManagementValues.labelCategory).filter((resourcePath) =>
        selectableCategoryPaths.has(resourcePath)
      )
    : [];
  const status =
    storedFilter.status === '' ? [] : readStoredList<Status>(storedFilter.status, SupportManagementValues.status);
  const admins =
    storedFilter.stakeholders === username
      ? []
      : readStoredList(storedFilter.stakeholders, SupportManagementValues.admins);

  return {
    category: readStoredList(storedFilter.category, SupportManagementValues.category),
    labelCategory,
    type: readStoredList(storedFilter.type, SupportManagementValues.type),
    labelType:
      legacyLabels && supportMetadata
        ? readLegacyDisplayNames(storedFilter.labelType, supportMetadata, selectableTypeNames, getLabelTypeFromName)
        : [],
    labelSubType:
      legacyLabels && supportMetadata
        ? readLegacyDisplayNames(
            storedFilter.labelSubType,
            supportMetadata,
            selectableSubTypeNames,
            getLabelSubTypeFromName
          )
        : [],
    labelFilter: [...projectedSelections],
    priority: readStoredList(storedFilter.priority, SupportManagementValues.priority),
    channel: readStoredList(storedFilter.channel, SupportManagementValues.channel),
    status,
    startdate: typeof storedFilter.start === 'string' ? storedFilter.start : SupportManagementValues.startdate,
    enddate: typeof storedFilter.end === 'string' ? storedFilter.end : SupportManagementValues.enddate,
    admins,
    query: SupportManagementValues.query,
  };
};

export const OngoingSupportErrands: FC = () => {
  const filterForm = useForm<SupportManagementFilter>({ defaultValues: SupportManagementValues });
  const {
    watch: watchFilter,
    reset: resetFilter,
    trigger: triggerFilter,
    getValues,
    setValue: setFilterValue,
  } = filterForm;

  const storedSort = useUiSettingsStore((s) => s.sort);

  const tableForm = useForm<TableForm>({
    defaultValues: {
      sortColumn: (storedSort?.sortColumn as string) || 'touched',
      sortOrder: (storedSort?.sortOrder as 'asc' | 'desc') || 'desc',
      pageSize: (storedSort?.pageSize as number) || 12,
      page: 0,
    },
  });
  const { watch: watchTable, setValue: setTableValue } = tableForm;
  const { sortOrder, sortColumn, pageSize, page } = watchTable();

  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const labelFilterProfile = useInvestigationProfileStore((state) => state.profile?.labelFilter);
  const setSupportErrand = useSupportStore((s) => s.setSupportErrand);
  const administrators = useUserStore((s) => s.administrators);
  const setSelectedErrandStatuses = useUiSettingsStore((s) => s.setSelectedErrandStatuses);
  const selectedErrandStatuses = useUiSettingsStore((s) => s.selectedErrandStatuses);
  const setSidebarLabel = useUiSettingsStore((s) => s.setSidebarLabel);
  const sidebarLabel = useUiSettingsStore((s) => s.sidebarLabel);
  const solvedSupportErrands = useUiSettingsStore((s) => s.closedErrands);
  const storedFilter = useUiSettingsStore((s) => s.filter);
  const setStoredFilter = useUiSettingsStore((s) => s.setFilter);
  const setStoredSort = useUiSettingsStore((s) => s.setSort);
  const filterToggleChecked = useUiSettingsStore((s) => s.overviewFilterToggleChecked);
  const setFilterToggleChecked = useUiSettingsStore((s) => s.setOverviewFilterToggleChecked);
  const user = useUserStore((s) => s.user);
  const filterToggle = getInvestigationOverviewFilterToggle();
  const offeredFilterToggle = resolveOverviewFilterToggle(filterToggle, user, labelFilterProfile?.groups);
  // The checkbox's selection is asked for, never stored among the label filters: it is kept as a setting of its own.
  const filterToggleSelections = useMemo<readonly LabelFilterSelection[]>(
    () => (offeredFilterToggle && filterToggleChecked ? [offeredFilterToggle.selection] : []),
    [offeredFilterToggle, filterToggleChecked]
  );

  const startdate = watchFilter('startdate');
  const enddate = watchFilter('enddate');
  const queryFilter = watchFilter('query');
  const [ownerFilter, setOwnerFilter] = useState(false);
  const administratorFilter = watchFilter('admins');
  const priorityFilter = watchFilter('priority');
  const statusFilter = watchFilter('status');
  const categoryFilter = watchFilter('category');
  const labelCategoryFilter = watchFilter('labelCategory');
  const typeFilter = watchFilter('type');
  const labelTypeFilter = watchFilter('labelType');
  const labelSubTypeFilter = watchFilter('labelSubType');
  const labelFilterSelections = watchFilter('labelFilter');
  const channelFilter = watchFilter('channel');
  const sortObject = useMemo(() => ({ [sortColumn]: sortOrder }), [sortColumn, sortOrder]);

  const labelFilterState = useMemo<SupportManagementLabelFilterState>(() => {
    if (!labelFilterProfile) return { status: 'legacy' };
    if (!supportMetadata) return { status: 'loading' };
    if (!Array.isArray(supportMetadata.labels?.labelStructure)) return { status: 'error' };

    try {
      return {
        status: 'ready',
        projections: projectLabelFilterGroups(
          overviewLabelFilterGroups(labelFilterProfile.groups, filterToggle),
          supportMetadata.labels.labelStructure
        ),
      };
    } catch {
      return { status: 'error' };
    }
  }, [labelFilterProfile, supportMetadata, filterToggle]);

  const normalizedLabelFilterSelections = useMemo<readonly LabelFilterSelection[]>(
    () =>
      labelFilterState.status === 'ready'
        ? normalizeLabelFilterSelections(labelFilterState.projections, labelFilterSelections)
        : [],
    [labelFilterSelections, labelFilterState]
  );

  const [filterObject, setFilterObject] = useState<{ [key: string]: string | boolean } | undefined>(() => {
    const safeEntries = Object.entries(storedFilter).filter(
      ([key]) =>
        key !== SUPPORT_MANAGEMENT_LABEL_FILTER_PARAMETER &&
        (!labelFilterProfile || !LEGACY_LABEL_FILTER_KEYS.includes(key))
    );
    return safeEntries.length > 0 ? Object.fromEntries(safeEntries) : undefined;
  });
  const filterInitialized = useRef(false);

  const errands = useSupportErrands(page, pageSize, filterObject, sortObject);

  const initialFocus = useRef<HTMLButtonElement>(null);

  const setInitialFocus = () => {
    setTimeout(() => {
      initialFocus.current?.focus();
    });
  };

  const router = useRouter();

  useEffect(() => {
    // The stored filter is restored at once, so filtering neither waits on the metadata nor stops working when
    // it cannot be read. Its label filters need the metadata to be read back into their controls: they follow
    // once it is there, and until then the debounce below keeps them as they are stored.
    if (storedFilter && Object.keys(storedFilter).length > 0) {
      let storedFilters: SupportManagementFilter;
      try {
        // Deprecated labels are dropped because their controls are no longer rendered and could not be cleared.
        storedFilters = restoreStoredFilter({
          storedFilter,
          supportMetadata,
          labelFilterState,
          username: user.username,
        });
        const filterStatuses = readStoredList<Status>(storedFilter.status, SupportManagementValues.status);
        const selectedStatusLabel = getStatusLabel(
          filterStatuses.map((s: string) => (Status as Record<string, string>)[s]) as Status[]
        );
        setSidebarLabel(selectedStatusLabel ?? '');
      } catch {
        setStoredFilter({});
        storedFilters = {
          category: SupportManagementValues.category,
          labelCategory: SupportManagementValues.labelCategory,
          type: SupportManagementValues.type,
          labelType: SupportManagementValues.labelType,
          labelSubType: SupportManagementValues.labelSubType,
          priority: SupportManagementValues.priority,
          channel: SupportManagementValues.channel,
          status: SupportManagementValues.status,
          startdate: SupportManagementValues.startdate,
          enddate: SupportManagementValues.enddate,
          admins: [],
          labelFilter: [],
          query: SupportManagementValues.query,
        };
      }
      if (storedFilter?.stakeholders === user.username) {
        setOwnerFilter(true);
      }
      // The search is never stored; one typed while the metadata was on its way stays.
      resetFilter({ ...storedFilters, query: getValues('query') ?? storedFilters.query });
      triggerFilter();
    }
    filterInitialized.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetFilter, triggerFilter, user.username, supportMetadata, labelFilterState]);

  useEffect(() => {
    const currentStatus = JSON.stringify(getValues('status'));
    const storeStatus = JSON.stringify(selectedErrandStatuses);
    if (currentStatus !== storeStatus) {
      setFilterValue('status', selectedErrandStatuses as Status[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedErrandStatuses]);

  useEffect(() => {
    setTableValue('page', 0);
    //eslint-disable-next-line
  }, [filterObject, sortColumn, sortOrder, pageSize]);

  useEffect(() => {
    // NOTE: If we set focus on the next button
    //       the browser will automatically scroll
    //       down to the button.
    setInitialFocus();
    setSupportErrand(undefined as unknown as any);
    //eslint-disable-next-line
  }, [router]);

  useEffect(() => {
    if (!errands) return;
    setSupportErrand(undefined as unknown as any);
    // A failed request answers without any paging. Copying that undefined page into the form left
    // the overview stuck for the rest of the session: the fetch effect skips an undefined page, so
    // nothing was requested again - not even when the user changed the filter. Keep what we had.
    if (errands.page === undefined) return;
    setTableValue('page', errands.page);
    setTableValue('size', errands.size!);
    setTableValue('totalPages', errands.totalPages!);
    setTableValue('totalElements', errands.totalElements!);
    //eslint-disable-next-line
  }, [errands]);

  useDebounceEffect(
    () => {
      if (!filterInitialized.current) return;
      const fObj: Record<string, string | boolean> = {};
      if (priorityFilter && priorityFilter.length > 0) {
        fObj['priority'] = priorityFilter.join(',');
      }
      if (categoryFilter && categoryFilter.length > 0) {
        fObj['category'] = categoryFilter.join(',');
      }
      if (labelFilterState.status === 'legacy' && labelCategoryFilter && labelCategoryFilter.length > 0) {
        fObj['labelCategory'] = labelCategoryFilter.join(',');
      }
      if (statusFilter && statusFilter.length > 0) {
        fObj['status'] = statusFilter.join(',');
      }
      if (typeFilter && typeFilter.length > 0) {
        fObj['type'] = typeFilter.join(',');
      }
      if (labelFilterState.status === 'legacy' && labelTypeFilter && labelTypeFilter.length > 0) {
        fObj['labelType'] = legacyLabelFilterResourcePaths(
          supportMetadata?.labels?.labelStructure,
          labelTypeFilter,
          LEGACY_LABEL_TYPE_DEPTH
        ).join(',');
      }
      if (labelFilterState.status === 'legacy' && labelSubTypeFilter && labelSubTypeFilter.length > 0) {
        fObj['labelSubType'] = legacyLabelFilterResourcePaths(
          supportMetadata?.labels?.labelStructure,
          labelSubTypeFilter,
          LEGACY_LABEL_SUBTYPE_DEPTH
        ).join(',');
      }
      if (channelFilter && channelFilter.length > 0) {
        fObj['channel'] = channelFilter.join(',');
      }
      if (queryFilter) {
        fObj['query'] = queryFilter;
      }
      if (labelFilterState.status === 'ready' && normalizedLabelFilterSelections.length > 0) {
        fObj[SUPPORT_MANAGEMENT_LABEL_FILTER_PARAMETER] = serializeLabelFilterSelections(
          normalizedLabelFilterSelections
        );
      }
      if (administratorFilter && administratorFilter.length > 0) {
        fObj['stakeholders'] = administratorFilter.join(',');
      }
      if (ownerFilter) {
        fObj['stakeholders'] = user.username;
      }
      if (startdate) {
        const date = startdate.trim();
        fObj['start'] = date;
      }
      if (enddate) {
        const date = enddate.trim();
        fObj['end'] = date;
      }
      // Until the metadata is there the label filters have not been read back into their controls, so what is
      // stored for them stands: in what is stored, and in the request as far as it applied when the page opened.
      const formRequestFilter =
        supportMetadata || labelFilterProfile
          ? fObj
          : { ...fObj, ...pickStoredEntries(storedFilter, LEGACY_LABEL_FILTER_KEYS) };
      const requestFilter =
        filterToggleSelections.length > 0
          ? {
              ...formRequestFilter,
              [SUPPORT_MANAGEMENT_LABEL_FILTER_PARAMETER]: serializeLabelFilterSelections([
                ...normalizedLabelFilterSelections,
                ...filterToggleSelections,
              ]),
            }
          : formRequestFilter;
      const persistedFilter = supportMetadata
        ? fObj
        : { ...fObj, ...pickStoredEntries(storedFilter, STORED_LABEL_FILTER_KEYS) };
      if (JSON.stringify(requestFilter) !== JSON.stringify(filterObject)) {
        setFilterObject(requestFilter);
      }
      setSelectedErrandStatuses(statusFilter);
      setStoredFilter(persistedFilter);
    },
    200,
    [
      queryFilter,
      ownerFilter,
      priorityFilter,
      categoryFilter,
      labelCategoryFilter,
      statusFilter,
      typeFilter,
      labelTypeFilter,
      labelSubTypeFilter,
      channelFilter,
      administratorFilter,
      startdate,
      enddate,
      normalizedLabelFilterSelections,
      labelFilterState.status,
      filterToggleSelections,
    ]
  );

  useDebounceEffect(
    () => {
      setStoredSort(watchTable() as unknown as Record<string, string | number>);
    },
    200,
    [watchTable, sortObject, pageSize]
  );

  const ownerFilteringHandler = async (e: boolean) => {
    setOwnerFilter(e);
  };

  const numberOfFilters =
    getValues().category.length +
    getValues().channel.length +
    getValues().admins.length +
    getValues().labelCategory.length +
    getValues().labelSubType.length +
    getValues().labelType.length +
    normalizedLabelFilterSelections.length +
    (getValues().enddate !== '' ? 1 : 0) +
    (getValues().startdate !== '' ? 1 : 0) +
    getValues().priority.length +
    (ownerFilter ? 1 : 0) +
    filterToggleSelections.length;

  return (
    <div className="w-full">
      <div className="box-border py-10 px-40 w-full flex justify-center shadow-lg min-h-[8rem] max-small-device-max:px-24">
        <div className="w-full container px-0">
          <FormProvider {...filterForm}>
            <SupportManagementFiltering
              numberOfFilters={numberOfFilters}
              ownerFilterHandler={ownerFilteringHandler}
              ownerFilter={ownerFilter}
              administrators={administrators}
              labelFilterState={labelFilterState}
              filterToggle={
                offeredFilterToggle && {
                  label: offeredFilterToggle.label,
                  checked: filterToggleChecked,
                  onChange: setFilterToggleChecked,
                }
              }
            />
          </FormProvider>
        </div>
      </div>

      <main className="pl-40 pb-40 w-full">
        <div className="container mx-auto p-0 w-full">
          <div className="mt-32 flex flex-col gap-16">
            <div>
              <h1 className="p-0 m-0">
                {sidebarLabel || 'Ärenden'}
                {sidebarLabel === 'Avslutade ärenden' ? ' : ' + (solvedSupportErrands ?? '') : null}
              </h1>
            </div>
            <div>
              <FormProvider {...tableForm}>
                <SupportErrandsTable />
              </FormProvider>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
