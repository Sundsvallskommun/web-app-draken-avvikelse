import { NotificationView } from '@common/components/notifications/notification-view';
import { SupportAttachment } from '@supportmanagement/services/support-attachment-service';
import {
  SupportErrand,
  SupportErrandsData,
  SupportStakeholderFormModel,
} from '@supportmanagement/services/support-errand-service';
import { create } from 'zustand';

interface SupportState {
  supportErrand: SupportErrand | undefined;
  supportErrands: SupportErrandsData;
  supportAttachments: SupportAttachment[] | undefined;
  stakeholderContacts: SupportStakeholderFormModel[];
  stakeholderCustomers: SupportStakeholderFormModel[];
  notifications: NotificationView[];
  activeTabKey?: string;
}

interface SupportActions {
  setSupportErrand: (errand: SupportErrand | undefined) => void;
  setSupportErrands: (errands: SupportErrandsData) => void;
  setSupportAttachments: (attachments: SupportAttachment[]) => void;
  setStakeholderContacts: (contacts: SupportStakeholderFormModel[]) => void;
  setStakeholderCustomers: (customers: SupportStakeholderFormModel[]) => void;
  setNotifications: (notifications: NotificationView[]) => void;
  setActiveTabKey: (activeTabKey: string) => void;
  reset: () => void;
}

type SupportStore = SupportState & SupportActions;

const initialState: SupportState = {
  supportErrand: undefined,
  // Loading until the overview has asked for errands: an empty list before the first request has
  // even gone out reads as "Det finns inga ärenden", which is not what it means.
  supportErrands: { errands: [], labels: [], isLoading: true },
  supportAttachments: undefined,
  stakeholderContacts: [],
  stakeholderCustomers: [],
  notifications: [],
  activeTabKey: 'basics',
};

export const useSupportStore = create<SupportStore>((set) => ({
  ...initialState,
  setSupportErrand: (supportErrand) => set({ supportErrand }),
  setSupportErrands: (supportErrands) => set({ supportErrands }),
  setSupportAttachments: (supportAttachments) => set({ supportAttachments }),
  setStakeholderContacts: (stakeholderContacts) => set({ stakeholderContacts }),
  setStakeholderCustomers: (stakeholderCustomers) => set({ stakeholderCustomers }),
  setNotifications: (notifications) => set({ notifications }),
  setActiveTabKey: (activeTabKey) => set({ activeTabKey }),
  reset: () => set(initialState),
}));
