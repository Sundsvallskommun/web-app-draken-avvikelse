import { useSearchParams } from 'next/navigation';
import { FC, ReactNode } from 'react';

import { Sidebar, SidebarButtonKey } from '../../../../common/components/sidebar/sidebar.component';
import { SidebarComments } from './sidebar-comments.component';
import { SidebarHistory } from './sidebar-history.component';
import { SidebarInfo } from './sidebar-info.component';
import { SidebarServiceNotes } from './sidebar-service-notes.component';
import { SidebarSupportExport } from './sidebar-support-export.component';

export const SidebarWrapper: FC<{
  hasUnsavedChanges?: boolean;
}> = (props) => {
  const searchParams = useSearchParams();

  const buttons: {
    label: string;
    key: SidebarButtonKey;
    icon: string;
    component: ReactNode;
  }[] = [
    {
      label: 'Handläggning',
      key: 'info',
      icon: 'user-cog',
      component: <SidebarInfo hasUnsavedChanges={props.hasUnsavedChanges ?? false} />,
    },
    {
      label: 'Tjänsteanteckningar',
      key: 'notes',
      icon: 'pencil-line',
      component: <SidebarServiceNotes />,
    },
    {
      label: 'Kommentarer',
      key: 'comments',
      icon: 'message-circle',
      component: <SidebarComments />,
    },
    {
      label: 'Ärendelogg',
      key: 'history',
      icon: 'history',
      component: <SidebarHistory />,
    },
    {
      label: 'Exportera ärende',
      key: 'supportexport',
      icon: 'file-output',
      component: <SidebarSupportExport />,
    },
  ];

  // Notifications deep link into a specific panel, e.g. /arende/KC-1?tab=history. Only keys that
  // actually exist here are honoured, so a stale or hand-edited link falls back to the default.
  const requestedTab = searchParams?.get('tab');
  const initialKey = buttons.find((button) => button.key === requestedTab)?.key;

  return <Sidebar buttons={buttons} initialKey={initialKey} />;
};
