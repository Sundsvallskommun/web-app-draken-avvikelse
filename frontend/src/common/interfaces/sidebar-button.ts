import { Status } from '@supportmanagement/services/support-errand-service';

export interface SidebarButton {
  label: string;
  key: Status;
  statuses: Status[];
  icon: string;
  totalStatusErrands: number | null;
}
