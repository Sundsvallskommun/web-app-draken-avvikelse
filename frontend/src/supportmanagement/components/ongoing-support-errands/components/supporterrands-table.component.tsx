import { Input, Pagination, Select, Spinner, Table } from '@sk-web-gui/react';
import { SortMode } from '@sk-web-gui/table';
import { useEmployeeNameStore, useSupportStore, useUserStore } from '@stores/index';
import { useUiSettingsStore } from '@stores/ui-settings-store';
import {
  getUnresolvedReporterAccounts,
  showsRegistrarColumn,
  useSupportErrandTable,
} from '@supportmanagement/components/support-errand/useSupportErrandTable';
import { Status, SupportErrand } from '@supportmanagement/services/support-errand-service';
import { FC, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { TableForm } from '../ongoing-support-errands.component';

export const SupportErrandsTable: FC = () => {
  const { watch, setValue, register } = useFormContext<TableForm>();
  const data = useSupportStore((s) => s.supportErrands);
  const selectedSupportErrandStatuses = useUiSettingsStore((s) => s.selectedErrandStatuses);
  const [rowHeight, setRowHeight] = useState<string>('normal');
  const sortOrder = watch('sortOrder');
  const sortColumn = watch('sortColumn');
  const totalPages = watch('totalPages');
  const page = watch('page');

  const currentStatusHaserrands = data.errands.some(
    (e) => selectedSupportErrandStatuses.includes(e.status as Status) || e.status === Status.PENDING
  );

  const sortOrders: { [key: string]: 'ascending' | 'descending' } = {
    asc: 'ascending',
    desc: 'descending',
  };

  // Each column carries its own sort field. Keying this by column index instead meant the same
  // index stood for a different column depending on the status filter - with only NEW selected
  // the reminder and responsible columns drop out, so "Registrerad av" landed on the index that
  // sorted by assignedUserId. That is also what forced a separate map per drake and per status.
  const handleSort = (sortKey: string) => {
    if (sortColumn === sortKey) {
      setValue('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setValue('sortColumn', sortKey);
    }
  };

  // The errand page acknowledges the user's notifications for the errand when it opens.
  const openErrandeInNewWindow = (errand: SupportErrand) => {
    window.open(`${process.env.NEXT_PUBLIC_BASEPATH}/arende/${errand.errandNumber}`, '_blank');
  };

  const errandTableObject = useSupportErrandTable(selectedSupportErrandStatuses as Status[]);

  // Only while "Registrerad av" is shown, and only the accounts the admin list cannot name. The
  // store keeps answers and misses for the session, so paging back and forth costs nothing and a
  // row that never resolves is not retried.
  const administrators = useUserStore((s) => s.administrators);
  const resolveEmployeeNames = useEmployeeNameStore((s) => s.resolveNames);
  const showsRegistrar = showsRegistrarColumn(errandTableObject);

  useEffect(() => {
    if (!showsRegistrar) return;
    resolveEmployeeNames(getUnresolvedReporterAccounts(data.errands ?? [], administrators));
  }, [showsRegistrar, data.errands, administrators, resolveEmployeeNames]);

  const headers = errandTableObject.map((column, index) => (
    <Table.HeaderColumn key={`header-${index}`}>
      {column.screenReaderOnly ? (
        <span className="sr-only">{column.label}</span>
      ) : column.sortable && column.sortKey ? (
        <Table.SortButton
          isActive={sortColumn === column.sortKey}
          sortOrder={sortOrders[sortOrder] as SortMode}
          onClick={() => handleSort(column.sortKey)}
        >
          {column.label}
        </Table.SortButton>
      ) : (
        column.label
      )}
    </Table.HeaderColumn>
  ));

  const rows = (data.errands || []).map((errand: SupportErrand, index) => {
    return (
      <Table.Row
        tabIndex={0}
        role="button"
        key={`row-${index}`}
        aria-label={`Ärende ${errand.errandNumber}, öppna ärende i ny flik`}
        onKeyDown={(e) => (e.key === 'Enter' ? openErrandeInNewWindow(errand) : null)}
        onClick={() => openErrandeInNewWindow(errand)}
        className="cursor-pointer"
      >
        {errandTableObject.map((column, index) => (
          <Table.Column key={`cell-${index}`}>{column?.render(errand)}</Table.Column>
        ))}
      </Table.Row>
    );
  });

  return (
    <div className="max-w-full relative">
      {(data.isLoading || (!currentStatusHaserrands && data.errands.length !== 0)) && (
        <div className="z-100 absolute bg-background-content opacity-50 w-full h-[50rem] flex items-center justify-center">
          <div>
            <Spinner size={5} />
          </div>
        </div>
      )}
      <Table data-cy="main-table" dense={rowHeight === 'dense'} aria-describedby="errandTableCaption" scrollable>
        {(!data.isLoading && rows && data.errands.length === 0) || data.error === '404' ? (
          <caption id="errandTableCaption" className="my-32">
            Det finns inga ärenden
          </caption>
        ) : data.error ? (
          <caption id="errandTableCaption" className="my-32">
            Det gick inte att hämta ärenden {data.error}
          </caption>
        ) : (
          page && (
            <caption id="errandTableCaption" className="sr-only">
              Ärenden, sida {page + 1} av {totalPages}
            </caption>
          )
        )}
        {data.errands.length > 0 && currentStatusHaserrands && (
          <>
            <Table.Header>{headers}</Table.Header>
            <Table.Body>{rows}</Table.Body>
          </>
        )}

        {currentStatusHaserrands && (
          <Table.Footer>
            <div className="sk-table-bottom-section sk-table-pagination-mobile">
              <label className="sk-table-bottom-section-label" htmlFor="paginationSelect">
                Sida:
              </label>
              <Select
                id="paginationSelect"
                size="sm"
                variant="tertiary"
                value={(page || 0).toString()}
                onSelectValue={(value) => setValue('page', parseInt(value, 10))}
              >
                {totalPages &&
                  Array.from(Array(totalPages).keys()).map((page) => (
                    <Select.Option key={`pagipage-${page}`} value={page}>
                      {page + 1}
                    </Select.Option>
                  ))}
              </Select>
            </div>
            <div className="sk-table-bottom-section">
              <label className="sk-table-bottom-section-label" htmlFor="pageSize">
                Rader per sida:
              </label>
              <Input
                {...register('pageSize')}
                size="sm"
                id="pageSize"
                type="number"
                min={1}
                max={1000}
                className="max-w-[6rem]"
              />
            </div>
            <div className="sk-table-paginationwrapper">
              <Pagination
                showFirst
                showLast
                pagesBefore={1}
                pagesAfter={1}
                showConstantPages={true}
                fitContainer
                pages={totalPages}
                activePage={page + 1}
                changePage={(page) => {
                  setValue('page', page - 1);
                }}
              />
            </div>
            <div className="sk-table-bottom-section">
              <label className="sk-table-bottom-section-label" htmlFor="rowHeight">
                Radhöjd:
              </label>
              <Select
                size="sm"
                id="rowHeight"
                variant="tertiary"
                onChange={(e) => setRowHeight(e.target.value)}
                value={rowHeight}
              >
                <Select.Option value="normal">Normal</Select.Option>
                <Select.Option value="dense">Tät</Select.Option>
              </Select>
            </div>
          </Table.Footer>
        )}
      </Table>
    </div>
  );
};
