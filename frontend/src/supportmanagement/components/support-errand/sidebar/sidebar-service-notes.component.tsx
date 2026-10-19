import { FC } from 'react';

import { SidebarGenericNotes } from './sidebar-generic-notes.component';

export const SidebarServiceNotes: FC<{}> = () => (
  <SidebarGenericNotes label_plural={'Tjänsteanteckningar'} label_singular={'Tjänsteanteckning'} noteType={'PUBLIC'} />
);
