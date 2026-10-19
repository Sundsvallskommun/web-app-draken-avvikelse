import { CaseStatusLabelComponent } from '@common/components/case-status-label/case-status-label.component';
import { CaseStatusResponse } from '@common/services/casestatus-service';
import { SortMode, Table } from '@sk-web-gui/react';
import { FC, ReactNode } from 'react';

interface RelationTableLabel {
  readonly label: string;
  readonly screenReaderOnly: boolean;
  readonly sortable: boolean;
}

/** The header row of a relations table, from its labels. */
export const relationTableHeaders = (labels: readonly RelationTableLabel[]): ReactNode =>
  labels.map((header, index) => (
    <Table.HeaderColumn key={`header-${index}`} sticky={true}>
      {header.screenReaderOnly ? (
        <span className="sr-only">{header.label}</span>
      ) : header.sortable ? (
        <Table.SortButton isActive={true} sortOrder={'ASC' as SortMode} onClick={() => {}}>
          {header.label}
        </Table.SortButton>
      ) : (
        header.label
      )}
    </Table.HeaderColumn>
  ));

/** An errand's status, which heads its row in a relations table. */
export const RelationStatusCell: FC<{ externalStatus: string | undefined }> = ({ externalStatus }) => (
  <Table.HeaderColumn scope="row" className="w-[22rem] overflow-hidden text-ellipsis table-caption">
    <CaseStatusLabelComponent externalStatus={externalStatus ?? ''} />
  </Table.HeaderColumn>
);

/** An errand's type. */
export const RelationCaseTypeCell: FC<{ caseType: string | undefined }> = ({ caseType }) => (
  <Table.Column className="w-[16rem]">{caseType}</Table.Column>
);

interface BaseRelationsTableProps {
  errands: readonly CaseStatusResponse[];
  headers: ReactNode;
  /** The table's own heading. Left out, a heading above it names it. */
  title?: string;
  dataCy: string;
  renderRow: (errand: any, index: number) => ReactNode;
}

export const BaseRelationsTable: FC<BaseRelationsTableProps> = ({ errands, headers, title, dataCy, renderRow }) => {
  return (
    <>
      {title !== undefined && <h3 className="py-[1.2rem] text-h3-md">{title}</h3>}
      <Table data-cy={dataCy} aria-describedby={`${dataCy}-table`} scrollable>
        {!errands.length ? (
          <caption id={`${dataCy}TableCaption`} className="my-32">
            Det finns inga ärenden
          </caption>
        ) : (
          <>
            <Table.Header>{headers}</Table.Header>
            <Table.Body>
              {errands.map((errand, index) => (
                <Table.Row key={`row-${index}`}>{renderRow(errand, index)}</Table.Row>
              ))}
            </Table.Body>
          </>
        )}
      </Table>
    </>
  );
};
