import {
  getFilteredNotifications,
  latestUnacknowledgedEvent,
  notificationLabel,
} from '@common/components/notifications/notification-utils';
import { PriorityComponent } from '@common/components/priority/priority.component';
import { prettyTime, truncate } from '@common/services/helper-service';
import { Admin } from '@common/services/user-service';
import { useEmployeeNameStore, useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { All, Priority } from '@supportmanagement/interfaces/priority';
import { getInvestigationOverviewAssignee } from '@supportmanagement/investigation/investigation-variant-registry';
import {
  getChannelLabel,
  getLabelReportType,
  getMappedLabelSubType,
  Status,
  SupportErrand,
} from '@supportmanagement/services/support-errand-service';
import { getLabelDisplayName } from '@supportmanagement/services/support-label-service';
import {
  findAdminByAccount,
  getAdminName,
  primaryStakeholderNameorEmail,
} from '@supportmanagement/services/support-stakeholder-service';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { SupportStatusLabelComponent } from '../ongoing-support-errands/components/support-status-label.component';
import { ErrandLabelCategoryCell, ErrandLabelTypeCell } from './support-errand-label-categorization-cells.component';

/**
 * What the "Registrerad av" cell shows, in falling order of precision: the registrar's name from
 * the already-loaded admin list, their name from the Employee API, the raw `reporterUserId`, then
 * `(saknas)`.
 *
 * The admin list is tried first because it costs nothing - it is fetched once at startup - and
 * only accounts it cannot answer for reach the Employee lookup. The raw account is worth showing
 * while that request is in flight, and if it comes back empty: every row then says something
 * about who registered the errand rather than going silently blank.
 */
const getReporterDisplayName = (
  administrators: Admin[] | undefined,
  employeeNames: Record<string, string | null>,
  reporterUserId: string | undefined
): string => {
  if (!reporterUserId) return '(saknas)';

  return (
    getAdminName(findAdminByAccount(administrators, reporterUserId)!) ||
    employeeNames[reporterUserId.toLowerCase()] ||
    reporterUserId
  );
};

/** The accounts the admin list cannot name, so only those are asked of the Employee API. */
export const getUnresolvedReporterAccounts = (
  errands: readonly SupportErrand[],
  administrators: Admin[] | undefined
): string[] =>
  errands
    .map((errand) => errand?.reporterUserId)
    .filter((account): account is string => !!account)
    .filter((account) => !getAdminName(findAdminByAccount(administrators, account)!));

export const useSupportErrandTable = (statuses: Status[]) => {
  const { t } = useTranslation();
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const administrators = useUserStore((s) => s.administrators);
  const employeeNames = useEmployeeNameStore((s) => s.names);
  const investigationAssignee = getInvestigationOverviewAssignee();
  const notifications = useSupportStore((s) => s.notifications);
  // The same notifications the panel shows, so the column never mentions something the bell leaves out.
  const visibleNotifications = useMemo(() => getFilteredNotifications(notifications), [notifications]);

  const labels = [
    {
      label: t('common:overview.status'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'status',
      shownForStatus: All.ALL,
      render: (errand: SupportErrand) => (
        <SupportStatusLabelComponent status={errand.status ?? ''} actions={errand?.actions ?? []} />
      ),
    },
    {
      label: t('common:overview.lastActivity'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'touched',
      shownForStatus: All.ALL,
      render: (errand: SupportErrand) => {
        // What happened since the user last opened the errand; without that, when it last changed.
        const unreadEvent = latestUnacknowledgedEvent(visibleNotifications, errand.id);
        return (
          <>
            {unreadEvent ? (
              <div className="whitespace-nowrap overflow-hidden text-ellipsis table-caption">
                <div>
                  <time dateTime={dayjs(unreadEvent.created).format('YYYY-MM-DD HH:mm')}>
                    {dayjs(unreadEvent.created).format('YYYY-MM-DD HH:mm')}
                  </time>
                </div>
                <div className="italic">{truncate(notificationLabel(unreadEvent), 30)}</div>
              </div>
            ) : (
              dayjs(errand.touched).format('YYYY-MM-DD HH:mm')
            )}
          </>
        );
      },
    },
    // The report type (Avvikelse or Missförhållande) with the errand number beneath, so the category column
    // carries neither.
    {
      label: t('common:overview.reportType'),
      screenReaderOnly: false,
      // Support Management sorts on the errand's own fields, and the report type is a label.
      sortable: false,
      sortKey: 'reportType',
      shownForStatus: All.ALL,
      render: (errand: SupportErrand) => (
        <div data-cy="overview-report-type">
          <div className="font-bold">{getLabelDisplayName(getLabelReportType(errand), supportMetadata)}</div>
          <div className="font-normal">{errand.errandNumber}</div>
        </div>
      ),
    },
    {
      label: t('common:overview.orderType'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'category',
      shownForStatus: All.ALL,

      render: (errand: SupportErrand) => (
        <div className="font-bold">
          <ErrandLabelCategoryCell errand={errand} metadata={supportMetadata} />
        </div>
      ),
    },
    {
      label: t('common:overview.errandType'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'type',
      shownForStatus: All.ALL,
      render: (errand: SupportErrand) => (
        <div className="max-w-[280px]">
          {/*
            An errand carrying a REPORT_TYPE label comes from the avvikelse tree, where the type is
            Avvikelse/Missforhallande and the level below it is the subcategory. That tree has no
            SUBTYPE at all, so the label tree's own levels would leave the errand type unshown.
          */}
          {getLabelReportType(errand) ? (
            <div>{getLabelDisplayName(getMappedLabelSubType(errand), supportMetadata)}</div>
          ) : (
            <ErrandLabelTypeCell errand={errand} metadata={supportMetadata} />
          )}
        </div>
      ),
    },
    {
      label: t('common:overview.incomingVia'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'channel',
      shownForStatus: All.ALL,
      render: (errand: SupportErrand) => (
        <div className="whitespace-nowrap overflow-hidden text-ellipsis table-caption">
          <div>{getChannelLabel(errand?.channel)}</div>
          <div className="m-0 italic truncate">
            {truncate(errand?.title !== 'Empty errand' ? errand?.title : null, 30) || null}
          </div>
        </div>
      ),
    },
    {
      label: t('common:overview.registered'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'created',
      shownForStatus: All.ALL,
      render: (errand: SupportErrand) => (
        <div className="whitespace-nowrap overflow-hidden text-ellipsis table-caption">
          <div>
            <time dateTime={errand.created}>{dayjs(errand.created).format('YYYY-MM-DD, HH:mm')}</time>
          </div>
          <div>
            <p className="m-0 italic truncate">{primaryStakeholderNameorEmail(errand)}</p>
          </div>
        </div>
      ),
    },
    {
      label: t('common:overview.priority'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'priority',
      shownForStatus: [
        Status.NEW,
        Status.ONGOING,
        Status.INQUIRY,
        Status.PENDING,
        Status.SOLVED,
        Status.SUSPENDED,
        Status.ASSIGNED,
      ],
      render: (errand: SupportErrand) => (
        <PriorityComponent priority={(Priority as Record<string, string>)[errand.priority!]} />
      ),
    },
    {
      label: t('common:overview.reminder'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'suspendedTo',
      shownForStatus: [Status.SUSPENDED],
      render: (errand: SupportErrand) => (
        <time dateTime={errand.touched}>{prettyTime(errand.suspension?.suspendedTo!)}</time>
      ),
    },
    {
      label: t('common:overview.responsible'),
      screenReaderOnly: false,
      sortable: true,
      sortKey: 'assignedUserId',
      shownForStatus: Object.values(Status).filter((status) => status !== Status.NEW),
      render: (errand: SupportErrand) => {
        return (
          <>
            {investigationAssignee?.(errand?.labels, supportMetadata?.labels?.labelStructure) ??
              getAdminName(findAdminByAccount(administrators, errand?.assignedUserId)!)}
          </>
        );
      },
    },
    {
      label: t('common:overview.registeredBy'),
      screenReaderOnly: false,
      sortable: true,
      // The errands are registered in Draken, so this column means the registrar.
      sortKey: 'reporterUserId',
      shownForStatus: [Status.NEW],
      render: (errand: SupportErrand) => {
        return <>{getReporterDisplayName(administrators, employeeNames, errand?.reporterUserId)}</>;
      },
    },
  ];

  return labels.filter(
    (label) => label.shownForStatus === All.ALL || statuses?.some((status) => label.shownForStatus.includes(status))
  );
};
