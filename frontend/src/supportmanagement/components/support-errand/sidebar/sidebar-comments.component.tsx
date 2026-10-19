import { FC } from 'react';

import { SidebarGenericNotes } from './sidebar-generic-notes.component';

export const SidebarComments: FC<{}> = () => (
  <SidebarGenericNotes label_plural={'Kommentarer'} label_singular={'Kommentar'} noteType={'INTERNAL'} />
);
