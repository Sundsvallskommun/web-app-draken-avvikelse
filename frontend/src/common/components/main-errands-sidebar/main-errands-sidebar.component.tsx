import { NotificationsBell } from '@common/components/notifications/notifications-bell';
import { NotificationsWrapper } from '@common/components/notifications/notifications-wrapper';
import { useNotificationPoller } from '@common/hooks/useNotificationPoller';
import { getApplicationEnvironment } from '@common/services/application-service';
import { appConfig } from '@config/appconfig';
import { Button, cx, Divider, Logo, UserMenu } from '@sk-web-gui/react';
import { useUserStore } from '@stores/index';
import { SupportManagementFilterSidebarStatusSelector } from '@supportmanagement/components/supportmanagement-filtering/components/supportmanagement-filter-sidebarstatus-selector.component';
import {
  SupportManagementFilter,
  SupportManagementValues,
} from '@supportmanagement/components/supportmanagement-filtering/supportmanagement-filtering.component';
import {
  getInvestigationAdministration,
  getInvestigationFollowUp,
} from '@supportmanagement/investigation/investigation-variant-registry';
import { CalendarCheck, ChartNoAxesColumn, ChevronsLeft, ChevronsRight, UserCog } from 'lucide-react';
import NextLink from 'next/link';
import { FC, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { useUserMenu } from '../layout/userMenuGroups';

export const MainErrandsSidebar: FC<{
  showPlannedMeasures?: boolean;
  setShowPlannedMeasures?: (show: boolean) => void;
  showFollowUp?: boolean;
  setShowFollowUp?: (show: boolean) => void;
  showAdministration?: boolean;
  setShowAdministration?: (show: boolean) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}> = ({
  showPlannedMeasures = false,
  setShowPlannedMeasures,
  showFollowUp = false,
  setShowFollowUp,
  showAdministration = false,
  setShowAdministration,
  open,
  setOpen,
}) => {
  const suppportManagementFilterForm = useForm<SupportManagementFilter>({ defaultValues: SupportManagementValues });
  const user = useUserStore((s) => s.user);
  const [showNotifications, setShowNotifications] = useState(false);
  const applicationEnvironment = getApplicationEnvironment();
  const followUp = getInvestigationFollowUp();
  const followUpLabel = followUp?.label(user);
  const administration = getInvestigationAdministration(user);
  const { menuGroups: userMenuGroups, dialogs: userMenuDialogs } = useUserMenu();
  // Mounted once here, where both the bell and the panel live, so the whole app shares one poll loop.
  const { refresh: refreshNotifications } = useNotificationPoller();

  const MainTitle = (open: boolean) => (
    <NextLink
      href="/"
      className="no-underline"
      aria-label={`Draken - ${
        appConfig.applicationName + (applicationEnvironment ? ` ${applicationEnvironment}` : '')
      }. Gå till startsidan.`}
    >
      <Logo
        className={cx(open ? '' : 'w-[2.8rem]')}
        variant={open ? 'service' : 'symbol'}
        title={'Draken'}
        subtitle={appConfig.applicationName + (applicationEnvironment ? ` ${applicationEnvironment}` : '')}
      />
    </NextLink>
  );

  const followsUpUnits = Boolean(followUp && setShowFollowUp);
  // Planned measures are followed up across the units, so they sit under Verksamhetsuppföljning where there is
  // one, and on their own where there is not.
  const plannedMeasuresButton = setShowPlannedMeasures ? (
    <Button
      onClick={() => {
        setShowPlannedMeasures(true);
        setShowFollowUp?.(false);
        setShowAdministration?.(false);
      }}
      leftIcon={<CalendarCheck />}
      className={`${open && 'justify-start'} ${!showPlannedMeasures && 'hover:bg-dark-ghost'}`}
      variant={showPlannedMeasures ? 'primary' : 'ghost'}
      iconButton={!open}
      aria-label={open ? undefined : 'Planerade åtgärder'}
      data-cy="planned-measures-button"
    >
      {open && <span className="w-full flex justify-between">Planerade åtgärder</span>}
    </Button>
  ) : null;

  return (
    <aside
      data-cy="overview-aside"
      className={cx(
        'fixed left-0 transition-all ease-in-out duration-150 flex grow z-10 bg-vattjom-background-200 min-h-screen',
        open ? 'max-lg:shadow-100 sm:w-[32rem] sm:min-w-[32rem]' : 'w-[5.6rem]'
      )}
    >
      <div className={cx('h-full w-full', open ? 'p-24' : '')}>
        <div className={cx('mb-24', open ? '' : 'flex flex-col items-center justify-center pt-[1rem]')}>
          {MainTitle(open)}
        </div>
        <div
          className={cx(
            'h-fit items-center',
            open ? 'pb-24 flex gap-12 justify-between' : 'pb-15 flex flex-col items-center justify-center'
          )}
        >
          {open && (
            <div className="flex gap-12 justify-between items-center">
              <UserMenu
                data-cy="avatar-aside"
                initials={`${user.firstName.charAt(0).toUpperCase()}${user.lastName.charAt(0).toUpperCase()}`}
                menuTitle={`${user.firstName} ${user.lastName} (${user.username})`}
                menuGroups={userMenuGroups}
                buttonSize="md"
                className="flex-shrink-0"
                buttonRounded={false}
                color="vattjom"
              />
              <span className="leading-tight h-fit font-bold mb-0" data-cy="userinfo">
                {user.firstName} {user.lastName}
              </span>
            </div>
          )}
          <NotificationsBell toggleShow={() => setShowNotifications(!showNotifications)} />
        </div>
        <Divider className={cx(open ? '' : 'w-[4rem] mx-auto')} />
        <div className={cx('flex flex-col gap-8', open ? 'py-24' : 'items-center justify-center py-15')}>
          <FormProvider {...suppportManagementFilterForm}>
            <SupportManagementFilterSidebarStatusSelector
              showPlannedMeasures={showPlannedMeasures}
              setShowPlannedMeasures={setShowPlannedMeasures}
              showFollowUp={showFollowUp}
              setShowFollowUp={setShowFollowUp}
              showAdministration={showAdministration}
              setShowAdministration={setShowAdministration}
              iconButton={!open}
            />
          </FormProvider>
        </div>
        {plannedMeasuresButton && !followsUpUnits && (
          <>
            <Divider className={cx(open ? '' : 'w-[4rem] mx-auto')} />
            <div className={cx('flex flex-col gap-8', open ? 'py-24' : 'items-center justify-center py-15')}>
              {plannedMeasuresButton}
            </div>
          </>
        )}
        {followUp && setShowFollowUp && (
          <>
            <Divider className={cx(open ? '' : 'w-[4rem] mx-auto')} />
            <div className={cx('flex flex-col gap-8', open ? 'py-24' : 'items-center justify-center py-15')}>
              {open && (
                <span className="text-small font-bold uppercase tracking-wide text-dark-secondary px-8">
                  {followUp.heading}
                </span>
              )}
              <Button
                onClick={() => {
                  setShowFollowUp(true);
                  setShowPlannedMeasures?.(false);
                  setShowAdministration?.(false);
                }}
                leftIcon={<ChartNoAxesColumn />}
                className={`${open && 'justify-start'} ${!showFollowUp && 'hover:bg-dark-ghost'}`}
                variant={showFollowUp ? 'primary' : 'ghost'}
                iconButton={!open}
                aria-label={open ? undefined : followUpLabel}
                data-cy="follow-up-button"
              >
                {open && <span className="w-full flex justify-between">{followUpLabel}</span>}
              </Button>
              {plannedMeasuresButton}
            </div>
          </>
        )}
        {administration && setShowAdministration && (
          <>
            <Divider className={cx(open ? '' : 'w-[4rem] mx-auto')} />
            <div className={cx('flex flex-col gap-8', open ? 'py-24' : 'items-center justify-center py-15')}>
              {open && (
                <span className="text-small font-bold uppercase tracking-wide text-dark-secondary px-8">
                  {administration.heading}
                </span>
              )}
              <Button
                onClick={() => {
                  setShowAdministration(true);
                  setShowPlannedMeasures?.(false);
                  setShowFollowUp?.(false);
                }}
                leftIcon={<UserCog />}
                className={`${open && 'justify-start'} ${!showAdministration && 'hover:bg-dark-ghost'}`}
                variant={showAdministration ? 'primary' : 'ghost'}
                iconButton={!open}
                aria-label={open ? undefined : administration.label}
                data-cy="administration-button"
              >
                {open && <span className="w-full flex justify-between">{administration.label}</span>}
              </Button>
            </div>
          </>
        )}
        <div
          className={cx('absolute bottom-[2.4rem]', open ? 'right-[2.4rem]' : 'left-1/2 transform -translate-x-1/2')}
        >
          <Button
            color="primary"
            size={'md'}
            variant="tertiary"
            aria-label={open ? 'Stäng sidomeny' : 'Öppna sidomeny'}
            iconButton
            leftIcon={open ? <ChevronsLeft /> : <ChevronsRight />}
            onClick={() => setOpen(!open)}
          />
        </div>
      </div>

      <NotificationsWrapper show={showNotifications} setShow={setShowNotifications} refresh={refreshNotifications} />
      {userMenuDialogs}
    </aside>
  );
};
