import { PriorityComponent } from '@common/components/priority/priority.component';
import { prettyTime } from '@common/services/helper-service';
import { useMetadataStore, useSupportStore } from '@stores/index';
import { Priority } from '@supportmanagement/interfaces/priority';
import { getChannelLabelInSentence } from '@supportmanagement/services/support-errand-service';
import { getLabelReportType } from '@supportmanagement/services/support-label-classification-service';
import { getLabelDisplayName } from '@supportmanagement/services/support-label-service';
import { getSupportReporterStakeholder } from '@supportmanagement/services/support-stakeholder-service';

import { SupportStatusLabelComponent } from '../ongoing-support-errands/components/support-status-label.component';

export const SupportErrandSummary: React.FC<{}> = () => {
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  // Avvikelse or Missförhållande, read from the errand's report-type label the way the overview reads it.
  const reportType = getLabelDisplayName(getLabelReportType(supportErrand), supportMetadata);

  return (
    <>
      <div className="rounded-cards">
        <div className="flex gap-x-32 gap-y-8 bg-background-content rounded-button p-md border">
          <div className="pr-sm">
            <div data-cy="errandStatusLabel" className="font-bold">
              Ärendestatus
            </div>
            <div data-cy="errandStatus">
              <SupportStatusLabelComponent
                status={supportErrand?.status ?? ''}
                actions={supportErrand?.actions ?? []}
              />
            </div>
          </div>
          <div className="pr-sm">
            <div className="font-bold" data-cy="errandPriorityLabel">
              Prioritet
            </div>
            <div>
              <span className="flex gap-sm items-center">
                <PriorityComponent priority={(Priority as Record<string, string>)[supportErrand?.priority!]} />
              </span>
            </div>
          </div>

          <div className="pr-sm">
            <div data-cy="errandRegisteredLabel" className="font-bold">
              Inkom via {getChannelLabelInSentence(supportErrand?.channel)}
            </div>
            <div data-cy="errandRegistered">{prettyTime(supportErrand?.created!)}</div>
          </div>
          <div className="pr-sm">
            <div className="font-bold" data-cy="errandStakeholderLabel">
              Rapportör
            </div>
            <div data-cy="errandStakeholder">
              {(() => {
                const reporter = getSupportReporterStakeholder(supportErrand!);
                if (reporter?.firstName && reporter?.lastName) {
                  return `${reporter.firstName} ${reporter.lastName}`;
                } else {
                  return '(saknas)';
                }
              })()}
            </div>
          </div>
          <div className="pr-sm">
            <div className="font-bold" data-cy="errandReportTypeLabel">
              Ärendetyp
            </div>
            <div data-cy="errandReportType">{reportType || '(saknas)'}</div>
          </div>
        </div>
      </div>
    </>
  );
};
