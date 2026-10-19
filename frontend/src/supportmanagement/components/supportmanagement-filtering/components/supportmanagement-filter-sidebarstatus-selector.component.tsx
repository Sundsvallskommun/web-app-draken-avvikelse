import iconMap from '@common/components/lucide-icon-map/lucide-icon-map.component';
import { SidebarButton } from '@common/interfaces/sidebar-button';
import { Badge, Button, Spinner } from '@sk-web-gui/react';
import { useUiSettingsStore } from '@stores/ui-settings-store';
import {
  assignedStatuses,
  closedStatuses,
  getStatusLabel,
  newStatuses,
  ongoingStatuses,
  Status,
} from '@supportmanagement/services/support-errand-service';
import { FC, useMemo } from 'react';
export interface SupportManagementStatusFilter {
  status: Status[];
}

export const SupportManagementStatusValues: SupportManagementStatusFilter = {
  status: [],
};

export const SupportManagementFilterSidebarStatusSelector: FC<{
  /** The planned-measures overview replaces the errand table; a status click leaves it. */
  showPlannedMeasures?: boolean;
  setShowPlannedMeasures?: (show: boolean) => void;
  /** So does the follow-up across errands. */
  showFollowUp?: boolean;
  setShowFollowUp?: (show: boolean) => void;
  /** And so does what the administrators set. */
  showAdministration?: boolean;
  setShowAdministration?: (show: boolean) => void;
  iconButton: boolean;
}> = ({
  showPlannedMeasures = false,
  setShowPlannedMeasures,
  showFollowUp = false,
  setShowFollowUp,
  showAdministration = false,
  setShowAdministration,
  iconButton,
}) => {
  const otherViewShown = showPlannedMeasures || showFollowUp || showAdministration;
  const setSidebarLabel = useUiSettingsStore((s) => s.setSidebarLabel);
  const setSelectedErrandStatuses = useUiSettingsStore((s) => s.setSelectedErrandStatuses);
  const selectedErrandStatuses = useUiSettingsStore((s) => s.selectedErrandStatuses);
  const setFilter = useUiSettingsStore((s) => s.setFilter);
  const filter = useUiSettingsStore((s) => s.filter);
  const newSupportErrands = useUiSettingsStore((s) => s.newErrands);
  const ongoingSupportErrands = useUiSettingsStore((s) => s.ongoingErrands);
  const assignedSupportErrands = useUiSettingsStore((s) => s.assignedErrands);
  const solvedSupportErrands = useUiSettingsStore((s) => s.closedErrands);

  const updateStatusFilter = (ss: Status[]) => {
    try {
      const status = ss.join(',');
      setFilter({ ...filter, status });
      setSelectedErrandStatuses(ss);
    } catch (error) {
      console.error('Error updating status filter');
    }
  };

  const supportSidebarButtons = useMemo<SidebarButton[]>(
    () => [
      {
        label: getStatusLabel(newStatuses) ?? '',
        key: newStatuses[0],
        statuses: newStatuses,
        icon: 'inbox',
        totalStatusErrands: newSupportErrands,
      },
      {
        label: getStatusLabel(ongoingStatuses) ?? '',
        key: ongoingStatuses[0],
        statuses: ongoingStatuses,
        icon: 'clipboard-pen',
        totalStatusErrands: ongoingSupportErrands,
      },
      {
        label: getStatusLabel(assignedStatuses) ?? '',
        key: assignedStatuses[0],
        statuses: assignedStatuses,
        icon: 'file-plus',
        totalStatusErrands: assignedSupportErrands,
      },
      {
        label: getStatusLabel(closedStatuses) ?? '',
        key: closedStatuses[0],
        statuses: closedStatuses,
        icon: 'circle-check-big',
        totalStatusErrands: solvedSupportErrands,
      },
    ],
    [newSupportErrands, ongoingSupportErrands, assignedSupportErrands, solvedSupportErrands]
  );

  return (
    <>
      {supportSidebarButtons?.map((button) => {
        const buttonIsActive = selectedErrandStatuses.includes(button.key as Status);
        return (
          <Button
            onClick={() => {
              updateStatusFilter(button.statuses as Status[]);
              setSidebarLabel(button.label);
              setShowPlannedMeasures?.(false);
              setShowFollowUp?.(false);
              setShowAdministration?.(false);
            }}
            aria-label={`status-button-${button.key}`}
            variant={buttonIsActive && !otherViewShown ? 'primary' : 'ghost'}
            className={`${!iconButton && 'justify-start'} ${!buttonIsActive && 'hover:bg-dark-ghost'}`}
            leftIcon={(() => {
              const DynIcon = iconMap[button.icon as string];
              return DynIcon ? <DynIcon /> : undefined;
            })()}
            key={button.key}
            iconButton={iconButton}
          >
            {!iconButton && (
              <span className="w-full flex justify-between">
                {button.label}
                {button.totalStatusErrands === null ? (
                  <Spinner color="vattjom" size={2} />
                ) : (
                  <Badge
                    className="min-w-fit px-4"
                    inverted={!buttonIsActive || otherViewShown}
                    color={buttonIsActive && !otherViewShown ? 'tertiary' : 'vattjom'}
                    counter={button.totalStatusErrands > 999 ? '999+' : button.totalStatusErrands}
                  />
                )}
              </span>
            )}
          </Button>
        );
      })}
    </>
  );
};
