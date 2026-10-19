import { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { SupportAttachment } from '@supportmanagement/services/support-attachment-service';
import { ExternalTags, Status, SupportStakeholderFormModel } from '@supportmanagement/services/support-errand-service';
import { CParameter } from 'src/data-contracts/backend/data-contracts';

import { Priority } from './priority';

export interface ApiPagingData {
  pageable: {
    sort: {
      empty: boolean;
      sorted: boolean;
      unsorted: boolean;
    };
    offset: number;
    pageNumber: number;
    pageSize: number;
    paged: boolean;
    unpaged: boolean;
  };
  totalPages: number;
  totalElements: number;
  last: boolean;
  size: number;
  number: number;
  sort: {
    empty: boolean;
    sorted: boolean;
    unsorted: boolean;
  };
  first: boolean;
  numberOfElements: number;
  empty: boolean;
}

/**
 * The edited errand. It deliberately carries no optimistic-locking version: the form is only
 * reset on load, so a version held here goes stale the moment any other action (status change,
 * reopen, message, note) writes to the errand. Writes take their precondition from the loaded
 * errand in the store instead.
 */
export interface RegisterSupportErrandFormModel {
  id?: string;
  caseId?: string;
  title?: string;
  priority?: Priority;
  category: string;
  type: string;
  labels: Label[];
  contactReason: string;
  contactReasonDescription: string;
  businessRelated: boolean;
  status: Status;
  resolution?: string;
  municipalityId: string;
  channel: string;
  description: string;
  notes: string;
  messageContact: string;
  assignedUserId: string;
  assignedGroupId: string;
  customer?: SupportStakeholderFormModel[];
  contacts: SupportStakeholderFormModel[];
  attachments: { file: File | undefined }[];
  newAttachment: FileList | undefined;
  escalationEmail?: string;
  escalationMessageBody?: string;
  escalationMessageBodyPlaintext: string;
  existingAttachments: SupportAttachment[];
  addExisting: string;
  externalTags?: ExternalTags;
  facilities?: [];
  parameters?: CParameter[];
}
