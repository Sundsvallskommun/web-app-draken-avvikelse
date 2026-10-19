import { getStatusesUsingPartyId } from '@common/services/casestatus-service';
import { appConfig } from '@config/appconfig';
import { Disclosure, Spinner, Table } from '@sk-web-gui/react';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { getSupportOwnerStakeholder } from '@supportmanagement/services/support-stakeholder-service';
import { Link2 } from 'lucide-react';
import { FC, useEffect, useState } from 'react';

import { brukarePartyId, otherReports, type RelatedReport } from './related-reports';
import { MOCK_RELATED_REPORTS } from './related-reports-mock';
import {
  BaseRelationsTable,
  RelationCaseTypeCell,
  RelationStatusCell,
  relationTableHeaders,
} from './related-reports-table.component';

const headers = relationTableHeaders([
  { label: 'Status', screenReaderOnly: false, sortable: false },
  { label: 'Ärendetyp', screenReaderOnly: false, sortable: false },
  { label: 'Underkategori', screenReaderOnly: false, sortable: false },
  { label: 'Ärendenummer', screenReaderOnly: false, sortable: false },
]);

const RelatedReportCells: FC<{ report: RelatedReport }> = ({ report }) => (
  <>
    <RelationStatusCell externalStatus={report.externalStatus} />
    <RelationCaseTypeCell caseType={report.caseType} />
    <Table.Column className="w-[22rem]">{report.subcategory}</Table.Column>
    <Table.Column className="w-[14.5rem]">{report.errandNumber}</Table.Column>
  </>
);

/**
 * Relaterade rapporter: the other reports on the person the report concerns, the brukare, so the handler sees that
 * there are more of them. Read-only - nothing is searched, and no relation is made or broken. The reports are the
 * application's own, which the BFF sees to. Where the deployment turns on `useRelatedReportsMock`, the list shows example
 * reports instead and reads nothing.
 */
export const RelatedReportsDisclosure: FC<{
  errand: SupportErrand;
  /** Closed for an errand that is not yet registered. */
  disabled: boolean;
}> = ({ errand, disabled }) => {
  const reportsAreMocked = appConfig.useRelatedReportsMock;
  const partyId = reportsAreMocked ? undefined : brukarePartyId(getSupportOwnerStakeholder(errand));
  // The answer is kept with the brukare it was read for, so a reply for somebody else is never shown.
  const [answer, setAnswer] = useState<{ readFor: string; reports: RelatedReport[] }>();
  const loading = Boolean(partyId) && answer?.readFor !== partyId;
  const reports: readonly RelatedReport[] = reportsAreMocked
    ? MOCK_RELATED_REPORTS.filter((report) => report.errandNumber !== errand.errandNumber)
    : partyId && answer?.readFor === partyId
    ? answer.reports
    : [];

  useEffect(() => {
    if (!partyId) return;
    let cancelled = false;
    getStatusesUsingPartyId(partyId)
      .then((statuses) => {
        if (!cancelled) setAnswer({ readFor: partyId, reports: otherReports(statuses ?? [], errand.id) });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ readFor: partyId, reports: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [partyId, errand.id]);

  return (
    <Disclosure disabled={disabled} variant="alt" data-cy="connected-errands-disclosure">
      <Disclosure.Header>
        <Disclosure.Icon icon={<Link2 />} />
        <Disclosure.Title>Relaterade rapporter</Disclosure.Title>
        <Disclosure.Button />
      </Disclosure.Header>
      <Disclosure.Content>
        <h2 className="pt-[1.2rem] pb-[2.4rem] text-h2-md">Relaterade rapporter till brukaren</h2>
        {loading ? (
          <div className="flex justify-center items-center h-[5rem]">
            <Spinner aria-label="Relaterade rapporter läses in" />
          </div>
        ) : (
          <BaseRelationsTable
            errands={reports}
            headers={headers}
            dataCy="related-reports-table"
            renderRow={(report: RelatedReport) => <RelatedReportCells report={report} />}
          />
        )}
      </Disclosure.Content>
    </Disclosure>
  );
};
