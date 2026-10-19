'use client';

import { Button, Label, Link, Table } from '@sk-web-gui/react';
import { SortMode } from '@sk-web-gui/table';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FC, Fragment, ReactNode, useMemo, useState } from 'react';

import type { FollowUpMeasureRow, FollowUpMeasureStatus } from './unit-follow-up-rows';
import { type FollowUpSort, nextFollowUpSort, sortFollowUpRows } from './unit-follow-up-sort';

type MeasureSortKey = 'type' | 'reportType' | 'addedBy' | 'status' | 'started' | 'completed' | 'errand' | 'effect';

const EMPTY = '—';

const STATUS_LABEL_COLORS: Record<
  FollowUpMeasureStatus,
  { color: 'gronsta' | 'vattjom' | 'tertiary' | 'error'; inverted: boolean }
> = {
  executed: { color: 'gronsta', inverted: true },
  planned: { color: 'vattjom', inverted: true },
  proposed: { color: 'tertiary', inverted: true },
  rejected: { color: 'error', inverted: true },
};

const sortValue = (row: FollowUpMeasureRow, key: MeasureSortKey): string | undefined => {
  switch (key) {
    case 'type':
      return row.type.label;
    case 'reportType':
      return row.errand.reportType?.label;
    case 'status':
      return row.status.label;
    case 'errand':
      return row.errand.errandNumber;
    case 'effect':
      return row.effect?.label;
    default:
      return row[key];
  }
};

const columns: readonly { label: string; sortKey: MeasureSortKey; render: (row: FollowUpMeasureRow) => ReactNode }[] = [
  { label: 'Åtgärdstyp', sortKey: 'type', render: (row) => row.type.label },
  { label: 'Rapporttyp', sortKey: 'reportType', render: (row) => row.errand.reportType?.label ?? EMPTY },
  { label: 'Tillagd av', sortKey: 'addedBy', render: (row) => row.addedBy ?? EMPTY },
  {
    label: 'Status',
    sortKey: 'status',
    render: (row) => (
      <Label rounded {...STATUS_LABEL_COLORS[row.status.value as FollowUpMeasureStatus]}>
        {row.status.label}
      </Label>
    ),
  },
  { label: 'Påbörjad', sortKey: 'started', render: (row) => row.started ?? EMPTY },
  { label: 'Slutförd', sortKey: 'completed', render: (row) => row.completed ?? EMPTY },
  {
    label: 'Ärende',
    sortKey: 'errand',
    render: (row) => (
      <Link href={`${process.env.NEXT_PUBLIC_BASEPATH}/arende/${row.errand.errandNumber}`} target="_blank">
        {row.errand.errandNumber}
      </Link>
    ),
  },
  { label: 'Effekt', sortKey: 'effect', render: (row) => row.effect?.label ?? EMPTY },
];

const MeasureDetails: FC<{ row: FollowUpMeasureRow }> = ({ row }) => (
  <dl className="grid grid-cols-1 md:grid-cols-3 gap-16 py-8" data-cy={`follow-up-measure-details-${row.key}`}>
    <div>
      <dt className="font-bold">Beskrivning</dt>
      <dd className="m-0 whitespace-pre-line">{row.description || EMPTY}</dd>
    </div>
    <div>
      <dt className="font-bold">Mål</dt>
      <dd className="m-0 whitespace-pre-line">{row.goal || EMPTY}</dd>
    </div>
    <div>
      <dt className="font-bold">Åtgärdens effekt</dt>
      <dd className="m-0 whitespace-pre-line">{row.resultText || EMPTY}</dd>
    </div>
  </dl>
);

/** Every measure on the period's errands. A row unfolds to what the measure was for and what came of it. */
export const UnitFollowUpMeasuresTable: FC<{ rows: readonly FollowUpMeasureRow[] }> = ({ rows }) => {
  const [sort, setSort] = useState<FollowUpSort<MeasureSortKey>>({ key: 'type', direction: 'ascending' });
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const sorted = useMemo(() => sortFollowUpRows(rows, sort, sortValue), [rows, sort]);

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Table data-cy="follow-up-measures-table" scrollable>
      <Table.Header>
        {columns.map((column) => (
          <Table.HeaderColumn key={column.label}>
            <Table.SortButton
              isActive={sort.key === column.sortKey}
              sortOrder={sort.direction as SortMode}
              onClick={() => setSort(nextFollowUpSort(sort, column.sortKey))}
            >
              {column.label}
            </Table.SortButton>
          </Table.HeaderColumn>
        ))}
        <Table.HeaderColumn>
          <span className="sr-only">Visa åtgärden</span>
        </Table.HeaderColumn>
      </Table.Header>
      <Table.Body>
        {sorted.map((row) => {
          const open = expanded.has(row.key);
          return (
            <Fragment key={row.key}>
              <Table.Row data-cy={`follow-up-measure-${row.key}`}>
                {columns.map((column) => (
                  <Table.Column key={column.label}>{column.render(row)}</Table.Column>
                ))}
                <Table.Column>
                  <Button
                    iconButton
                    size="sm"
                    variant="tertiary"
                    aria-expanded={open}
                    aria-label={`${open ? 'Dölj' : 'Visa'} åtgärden ${row.type.label} i ${row.errand.errandNumber}`}
                    onClick={() => toggle(row.key)}
                  >
                    {open ? <ChevronUp /> : <ChevronDown />}
                  </Button>
                </Table.Column>
              </Table.Row>
              {open && (
                <Table.Row>
                  <Table.Column colSpan={columns.length + 1}>
                    <MeasureDetails row={row} />
                  </Table.Column>
                </Table.Row>
              )}
            </Fragment>
          );
        })}
      </Table.Body>
    </Table>
  );
};
