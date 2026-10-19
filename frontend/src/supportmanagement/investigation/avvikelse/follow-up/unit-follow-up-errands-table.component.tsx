'use client';

import { Button, Table } from '@sk-web-gui/react';
import { SortMode } from '@sk-web-gui/table';
import { ArrowRight } from 'lucide-react';
import { FC, ReactNode, useMemo, useState } from 'react';

import type { FollowUpErrandRow } from './unit-follow-up-rows';
import { type FollowUpSort, nextFollowUpSort, sortFollowUpRows } from './unit-follow-up-sort';

type ErrandSortKey = 'unit' | 'reportType' | 'created' | 'riskValueHsl' | 'riskValueSolLss' | 'measureCount';

interface ErrandColumn {
  readonly label: string;
  readonly sortKey?: ErrandSortKey;
  readonly render: (row: FollowUpErrandRow) => ReactNode;
}

const EMPTY = '—';

/** LEX's decision is called out when it found a misconduct, or the risk of one. */
const NO_MISCONDUCT = 'no_misconduct';

const sortValue = (row: FollowUpErrandRow, key: ErrandSortKey): string | number | undefined =>
  key === 'reportType' || key === 'unit' ? row[key]?.label : row[key];

const causes = (row: FollowUpErrandRow): ReactNode => {
  if (row.causeAreas.length === 0) return EMPTY;
  const text = row.causeAreas.map((cause) => cause.label).join(', ');
  return (
    <span className="block max-w-[18rem] truncate" title={text}>
      {text}
    </span>
  );
};

const columns: readonly ErrandColumn[] = [
  { label: 'Enhet', sortKey: 'unit', render: (row) => <strong>{row.unit?.label ?? EMPTY}</strong> },
  { label: 'Typ', sortKey: 'reportType', render: (row) => row.reportType?.label ?? EMPTY },
  { label: 'Orsak', render: causes },
  { label: 'Registrerat', sortKey: 'created', render: (row) => row.created ?? EMPTY },
  { label: 'Riskvärde HSL', sortKey: 'riskValueHsl', render: (row) => row.riskValueHsl ?? EMPTY },
  { label: 'Riskvärde SOL/LSS', sortKey: 'riskValueSolLss', render: (row) => row.riskValueSolLss ?? EMPTY },
  { label: 'IVO-anmälan', render: (row) => row.ivoNotification?.label ?? EMPTY },
  {
    label: 'Beslutat missförhållande',
    render: (row) =>
      row.decidedMisconduct ? (
        <span className={row.decidedMisconduct.value === NO_MISCONDUCT ? undefined : 'font-bold text-error'}>
          {row.decidedMisconduct.label}
        </span>
      ) : (
        EMPTY
      ),
  },
  { label: 'Åtgärder', sortKey: 'measureCount', render: (row) => `${row.measureCount} stycken` },
];

const openErrand = (errandNumber: string) =>
  window.open(`${process.env.NEXT_PUBLIC_BASEPATH}/arende/${errandNumber}`, '_blank');

/** The errands of the period, newest first, each opening in a tab of its own as the overview's do. */
export const UnitFollowUpErrandsTable: FC<{ rows: readonly FollowUpErrandRow[] }> = ({ rows }) => {
  const [sort, setSort] = useState<FollowUpSort<ErrandSortKey>>({ key: 'created', direction: 'descending' });
  const sorted = useMemo(() => sortFollowUpRows(rows, sort, sortValue), [rows, sort]);

  return (
    <Table data-cy="follow-up-errands-table" scrollable>
      <Table.Header>
        {columns.map((column) => (
          <Table.HeaderColumn key={column.label}>
            {column.sortKey ? (
              <Table.SortButton
                isActive={sort.key === column.sortKey}
                sortOrder={sort.direction as SortMode}
                onClick={() => setSort(nextFollowUpSort(sort, column.sortKey!))}
              >
                {column.label}
              </Table.SortButton>
            ) : (
              column.label
            )}
          </Table.HeaderColumn>
        ))}
        <Table.HeaderColumn>
          <span className="sr-only">Öppna ärendet</span>
        </Table.HeaderColumn>
      </Table.Header>
      <Table.Body>
        {sorted.map((row) => (
          <Table.Row
            key={row.id}
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => openErrand(row.errandNumber)}
            // Only Enter on the row itself: the open button inside it handles its own Enter, as a click.
            onKeyDown={(event) =>
              event.key === 'Enter' && event.target === event.currentTarget ? openErrand(row.errandNumber) : undefined
            }
            data-cy={`follow-up-errand-${row.errandNumber}`}
          >
            {columns.map((column) => (
              <Table.Column key={column.label}>{column.render(row)}</Table.Column>
            ))}
            <Table.Column>
              <Button
                iconButton
                size="sm"
                variant="tertiary"
                aria-label={`Öppna ärende ${row.errandNumber} i ny flik`}
                onClick={(event) => {
                  event.stopPropagation();
                  openErrand(row.errandNumber);
                }}
              >
                <ArrowRight />
              </Button>
            </Table.Column>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
};
