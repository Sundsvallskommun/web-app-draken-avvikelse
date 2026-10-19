'use client';

import SidebarLayout from '@common/components/layout/sidebar-layout.component';
import { DeployInfoBanner } from '@common/utils/deploy-info-banner';
import { appConfig } from '@config/appconfig';
import { useUserStore } from '@stores/index';
import { OngoingSupportErrands } from '@supportmanagement/components/ongoing-support-errands/ongoing-support-errands.component';
import {
  getInvestigationAdministration,
  getInvestigationFollowUp,
} from '@supportmanagement/investigation/investigation-variant-registry';
import { PlannedMeasuresOverview } from '@supportmanagement/measures/planned-measures-overview';
import { useState } from 'react';

export function OversiktPageClient() {
  const user = useUserStore((s) => s.user);
  const [showPlannedMeasures, setShowPlannedMeasures] = useState<boolean>(false);
  const [showFollowUp, setShowFollowUp] = useState<boolean>(false);
  const [showAdministration, setShowAdministration] = useState<boolean>(false);
  const followUp = getInvestigationFollowUp();
  const administration = getInvestigationAdministration(user);

  return (
    <>
      <SidebarLayout
        title={`${appConfig.applicationName} - Översikt`}
        setShowPlannedMeasures={setShowPlannedMeasures}
        showPlannedMeasures={showPlannedMeasures}
        setShowFollowUp={setShowFollowUp}
        showFollowUp={showFollowUp}
        setShowAdministration={setShowAdministration}
        showAdministration={showAdministration}
      >
        {(() => {
          if (followUp && showFollowUp) {
            return followUp.render();
          }
          if (administration && showAdministration) {
            return administration.render();
          }
          if (showPlannedMeasures) {
            return <PlannedMeasuresOverview />;
          }
          return <OngoingSupportErrands />;
        })()}
      </SidebarLayout>
      <DeployInfoBanner />
    </>
  );
}
