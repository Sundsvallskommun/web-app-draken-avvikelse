import {
  Label,
  Phase,
  Stakeholder as SupportStakeholder,
} from '@common/data-contracts/supportmanagement/data-contracts';
import { User } from '@common/interfaces/user';
import { apiService, Data, withRequestGroup } from '@common/services/api-service';
import { sanitized } from '@common/services/sanitizer-service';
import { useSnackbar } from '@sk-web-gui/react';
import { useConfigStore, useSupportStore } from '@stores/index';
import { useUiSettingsStore } from '@stores/ui-settings-store';
import { ApiPagingData, RegisterSupportErrandFormModel } from '@supportmanagement/interfaces/errand';
import { All, Priority } from '@supportmanagement/interfaces/priority';
import { getInvestigationChannelLabel } from '@supportmanagement/investigation/investigation-variant-registry';
import { useCallback, useEffect, useRef } from 'react';
import { CErrandPhase, CParameter, SupportErrandDto } from 'src/data-contracts/backend/data-contracts';
import { v4 as uuidv4 } from 'uuid';

import { saveSupportAttachments } from './support-attachment-service';
import { isSupportErrandEmpty } from './support-errand-emptiness';
import type { SupportErrandFilterQuery, SupportErrandSortQuery } from './support-errand-query';
import {
  buildSupportErrandsSearchParameters,
  buildSupportErrandStatusGroupCountParameters,
} from './support-errand-query';
import { Status } from './support-errand-status';
import {
  buildSupportErrandStatusTransitionRequest,
  SupportErrandStatusSnapshot,
  SupportErrandStatusTransitionChanges,
  SupportErrandStatusTransitionRequest,
} from './support-errand-status-transition';
import { buildSupportErrandUpdateData } from './support-errand-update-data';
import { SupportErrandStatusAfterAssignmentError, toStrongSupportErrandETag } from './support-errand-write-version';
import { getMappedLabelSubType } from './support-label-classification-service';
import { CATEGORIZATION_CLASSIFICATIONS } from './support-label-service';
import { saveSupportNote } from './support-note-service';
import { saveChangedErrandParameters } from './support-parameter-service';
import { getActiveSupportPhaseId, getPhaseMainStatus, getSupportPhases } from './support-phase-service';
import { buildStakeholdersList, mapExternalIdTypeToStakeholderType } from './support-stakeholder-service';

export enum ExternalIdType {
  PRIVATE = 'PRIVATE',
  ENTERPRISE = 'ENTERPRISE',
  EMPLOYEE = 'EMPLOYEE',
  COMPANY = 'COMPANY',
}

// Keeping both enums for now, as the backend uses the uppercase version
// but existing stakeholders use the lowercase version
export enum ContactChannelType {
  Email = 'Email',
  EMAIL = 'EMAIL',
  Phone = 'Phone',
  PHONE = 'PHONE',
}

// Define an enum for the stakeholder types
export enum SupportStakeholderTypeEnum {
  PERSON = 'PERSON',
  ORGANIZATION = 'ORGANIZATION',
}

interface RequestInfo {
  contactMeans: string;
  email: string;
  phone: string;
  message: string;
  messageBodyPlaintext: string;
}

// Define a type based on the enum values
type SupportStakeholderType = keyof typeof SupportStakeholderTypeEnum;

export type ExternalTags = Array<{ key: string; value: string }>;

/**
 * Read-only JSON parameter projection returned with an errand. It is kept out
 * of the generated SupportErrandDto because that DTO is the generic PATCH
 * contract, where JSON documents are deliberately forbidden.
 */
interface SupportErrandJsonParameter {
  key: string;
  schemaId: string;
  value?: unknown;
  version?: number;
}

export interface ApiSupportErrand extends SupportErrandDto {
  id?: string;
  version?: number;
  created?: string;
  modified?: string;
  touched?: string;
  jsonParameters?: SupportErrandJsonParameter[];
}

export interface SupportErrand extends ApiSupportErrand {
  caseId?: string;
  category: string;
  type: string;
  subType: string;
  labels?: Label[];
  classificationHasSubTypes?: boolean;
  customer: SupportStakeholderFormModel[];
  contacts: SupportStakeholderFormModel[];
  /**
   * Support Management grants the user only limited read (LR): they may know of the errand, not work in
   * it. Set by the client when it asked, never by the API, and it locks the errand.
   */
  limitedAccess?: boolean;
}

interface PagedApiSupportErrands extends ApiPagingData {
  content: ApiSupportErrand[];
}

export interface SupportErrandsData extends Data {
  errands: SupportErrand[];
  isLoading?: boolean;
  page?: number;
  size?: number;
  totalPages?: number;
  totalElements?: number;
  labels: {
    label: string;
    screenReaderOnly: boolean;
    sortable: boolean;
    sticky?: boolean;
    shownForStatus: All | Status[];
  }[];
}

export enum Channels {
  PHONE = 'Telefon',
  CHAT = 'Chatt',
  EMAIL = 'E-post',
  IN_PERSON = 'Fysiskt möte',
  SOCIAL_MEDIA = 'Sociala medier',
  ESERVICE = 'E-tjänst',
  ESERVICE_INTERNAL = 'E-tjänst (intern)',
  WEB_UI = 'Draken webbgränssnitt',
}

/**
 * What a channel is called where it is shown. The running investigation may name one of its own apart from the
 * shared name - Katla's e-service, beside OpenE's. `Channels` itself stays what the code compares channels by.
 */
export const getChannelLabel = (channel: string | undefined): string | undefined =>
  getInvestigationChannelLabel(channel) ?? (channel ? (Channels as Record<string, string>)[channel] : undefined);

/** The channel's name inside a sentence: a shared name in lower case, a name the investigation gave as it is written. */
export const getChannelLabelInSentence = (channel: string | undefined): string | undefined =>
  getInvestigationChannelLabel(channel) ??
  (channel ? (Channels as Record<string, string>)[channel]?.toLowerCase() : undefined);

/** The channels a user can choose from when registering an errand. */
export const getSelectableChannels = (): [string, string][] =>
  (Object.keys(Channels) as string[]).map((key): [string, string] => [key, getChannelLabel(key) ?? key]);

export { Status };

export const shouldShowResumeErrandButton = (status?: Status): boolean => {
  return (
    !!status &&
    [
      Status.PENDING,
      Status.AWAITING_INTERNAL_RESPONSE,
      Status.AWAITING_RESPONSE,
      Status.SUSPENDED,
      Status.ASSIGNED,
    ].includes(status)
  );
};

export const newStatuses = [Status.NEW];

/**
 * The status an errand moves to when somebody takes it, resumes it or starts working on it. The
 * namespace has no `ONGOING`; its working status is `INQUIRY`.
 */
export const getOngoingStatus = (): Status => Status.INQUIRY;

/**
 * The status an errand works in when it is taken, resumed or given back to its handler.
 *
 * Where the namespace runs a workflow that is the active phase's main status - the first one the
 * phase allows, the same rule Support Management's phase change applies - because each phase owns
 * its status and refuses the application-wide ongoing one. Everywhere else it is the ongoing status.
 */
export const resolveWorkingStatus = (
  errandPhases: readonly CErrandPhase[] | undefined,
  metadataPhases: readonly Phase[] | undefined
): Status => {
  const mainStatus = getPhaseMainStatus(getActiveSupportPhaseId(errandPhases), getSupportPhases(metadataPhases));
  return (mainStatus as Status | undefined) ?? getOngoingStatus();
};

/**
 * The status an errand waits in after asking for a completion. Where the active phase allows
 * AWAITING_RESPONSE the errand waits there, whichever party was asked; every other namespace keeps
 * its own pair, PENDING for the customer and AWAITING_INTERNAL_RESPONSE for a colleague.
 */
export const resolveAwaitingResponseStatus = (
  requested: 'info' | 'internal',
  errandPhases: readonly CErrandPhase[] | undefined,
  metadataPhases: readonly Phase[] | undefined
): Status => {
  const activePhaseId = getActiveSupportPhaseId(errandPhases);
  const activePhase = getSupportPhases(metadataPhases).find((phase) => phase.id === activePhaseId);
  if (activePhase?.allowedStatuses?.includes(Status.AWAITING_RESPONSE)) return Status.AWAITING_RESPONSE;
  return requested === 'info' ? Status.PENDING : Status.AWAITING_INTERNAL_RESPONSE;
};

// The workflow gives each phase exactly one status - REVIEW in Granskning, INQUIRY in Utredning,
// DECISION in Beslut, FOLLOW_UP in Uppföljning - so every one of them is an errand being worked on.
// INQUIRY stays first: the first entry keys the "Öppna ärenden" filter.
export const ongoingStatuses = [
  Status.INQUIRY,
  Status.REVIEW,
  Status.DECISION,
  Status.FOLLOW_UP,
  Status.AWAITING_RESPONSE,
  Status.PENDING,
  Status.AWAITING_INTERNAL_RESPONSE,
  Status.REOPENED,
];

const suspendedStatuses = [Status.SUSPENDED];
export const assignedStatuses = [Status.ASSIGNED];

export const closedStatuses = [Status.SOLVED];

export const getStatusLabel = (statuses: Status[]) => {
  if (statuses.length > 0) {
    if (statuses.some((s) => newStatuses.includes(s))) {
      return 'Nya ärenden';
    } else if (statuses.some((s) => ongoingStatuses.includes(s))) {
      return 'Öppna ärenden';
    } else if (statuses.some((s) => suspendedStatuses.includes(s))) {
      return 'Parkerade ärenden';
    } else if (statuses.some((s) => assignedStatuses.includes(s))) {
      return 'Tilldelade ärenden';
    } else if (statuses.some((s) => closedStatuses.includes(s))) {
      return 'Avslutade ärenden';
    } else {
      return 'Ärenden';
    }
  }
};

const findPriorityLabelForPriorityKey = (priorityLabel: string) =>
  Object.entries(Priority).find((e: [string, string]) => e[0] === priorityLabel)?.[1];

export {
  getLabelCategory,
  getLabelReportType,
  getLabelSubType,
  getLabelSubTypeFromName,
  getLabelType,
  getLabelTypeFromName,
  getMappedLabelSubType,
} from './support-label-classification-service';

/** The errand's categorization labels in tree order, leaving out the ROOT label and any other label sets. */
export const getCategorizationLabels = (errand: SupportErrand): Label[] =>
  CATEGORIZATION_CLASSIFICATIONS.map((classification) =>
    errand.labels?.find((label) => label.classification === classification)
  ).filter((label): label is Label => !!label);

export interface SupportStakeholderFormModel extends SupportStakeholder {
  stakeholderType: SupportStakeholderType;
  internalId: string;
  organizationNumber?: string;
  personId?: string;
  personNumber?: string;
  title?: string;
  referenceNumber?: string;
  emails: { value: string }[];
  phoneNumbers: { value: string }[];
  username?: string;
  administrationCode?: string;
  administrationName?: string;
  department?: string;
  orgName?: string;
}

export const emptyContact: SupportStakeholderFormModel = {
  stakeholderType: SupportStakeholderTypeEnum.PERSON,
  internalId: '',
  externalId: '',
  personNumber: '',
  organizationNumber: '',
  externalIdType: ExternalIdType.EMPLOYEE,
  username: '',
  firstName: '',
  lastName: '',
  address: '',
  zipCode: '',
  careOf: '',
  country: '',
  emails: [],
  phoneNumbers: [],
  contactChannels: [],
};

export const defaultSupportErrandInformation: SupportErrand | any = {
  id: '',
  title: '',
  priority: 'MEDIUM',
  category: '',
  type: '',
  subType: '',
  classificationHasSubTypes: false,
  labels: [],
  contactReason: '',
  contactReasonDescription: undefined,
  businessRelated: false,
  status: 'NEW',
  suspension: {
    suspendedFrom: undefined,
    suspendedTo: undefined,
  },
  assignedUserId: undefined,
  assignedGroupId: undefined,
  resolution: 'INFORMED',
  channel: 'PHONE',
  municipalityId: process.env.NEXT_PUBLIC_MUNICIPALITY_ID,
  description: '',
  messageContact: 'false',
  contactMeans: 'useEmail',
  messageEmail: '',
  messagePhone: '',
  messageBody: '',
  newMessageAttachment: undefined,
  messageAttachments: [],
  contacts: [],
  newAttachment: undefined,
  attachments: [],
  externalTags: [],
  parameters: [],
};

export const isOpenEErrand: (supportErrand: SupportErrand) => boolean = (supportErrand) => {
  return !!supportErrand?.externalTags?.find((tag) => tag.key === 'caseId')?.value;
};

export const isSupportErrandLocked: (errand: SupportErrand) => boolean = (errand) => {
  return (
    errand?.limitedAccess === true ||
    errand?.status === Status.SOLVED ||
    errand?.status === Status.SUSPENDED ||
    errand?.status === Status.ASSIGNED ||
    errand?.status === Status.REOPENED
  );
};

/**
 * Whether the errand may be handed over as it stands. One that is ASSIGNED only waits to be resumed, and a handover
 * leaves it ASSIGNED anyway, so handing it on needs no resume first. A closed, parked or reopened errand, or one
 * read only in part, may not be.
 */
export const isSupportErrandOpenToHandover = (errand: SupportErrand): boolean =>
  errand.limitedAccess !== true && (errand.status === Status.ASSIGNED || !isSupportErrandLocked(errand));

export const useSupportErrands = (
  municipalityId: string,
  page?: number,
  size?: number,
  filter?: SupportErrandFilterQuery,
  sort?: SupportErrandSortQuery
): SupportErrandsData => {
  const toastMessage = useSnackbar();
  const setIsLoading = useConfigStore((s) => s.setIsLoading);
  const setSupportErrands = useSupportStore((s) => s.setSupportErrands);
  const supportErrands = useSupportStore((s) => s.supportErrands);
  const setNewSupportErrands = useUiSettingsStore((s) => s.setNewErrands);
  const newSupportErrands = useUiSettingsStore((s) => s.newErrands);
  const setOngoingSupportErrands = useUiSettingsStore((s) => s.setOngoingErrands);
  const ongoingSupportErrands = useUiSettingsStore((s) => s.ongoingErrands);
  const setAssignedSupportErrands = useUiSettingsStore((s) => s.setAssignedErrands);
  const assignedSupportErrands = useUiSettingsStore((s) => s.assignedErrands);
  const setSolvedSupportErrands = useUiSettingsStore((s) => s.setClosedErrands);
  const solvedSupportErrands = useUiSettingsStore((s) => s.closedErrands);

  // Each filter, sort or page change starts a new round of requests while the previous round may
  // still be in flight, and the responses can land in any order. Whichever lands last used to win,
  // so a slow earlier request overwrote the current one - and since the table only renders errands
  // whose status the sidebar has selected, a result fetched for another status renders as an empty
  // table next to a correct count. Only the newest round is allowed to write.
  const latestRequestRef = useRef(0);

  const fetchErrands = useCallback(
    async (page: number = 0) => {
      // An undefined filter means the overview has not composed one yet: fetching here would ask
      // for every errand regardless of status, which is both the most expensive query we can make
      // and the one most likely to come back last.
      if (!filter) {
        return;
      }
      const requestId = ++latestRequestRef.current;
      const isLatestRequest = () => latestRequestRef.current === requestId;

      setIsLoading(true);
      setNewSupportErrands(null);
      setOngoingSupportErrands(null);
      setAssignedSupportErrands(null);
      setSolvedSupportErrands(null);
      setSupportErrands({ ...supportErrands, isLoading: true });

      const errandPromise = getSupportErrands(municipalityId, page, size, filter, sort)
        .then((res) => {
          if (!isLatestRequest()) return;
          setSupportErrands({ ...res, isLoading: false });
        })
        .catch(() => {
          toastMessage({
            position: 'bottom',
            closeable: false,
            message: 'Ärenden kunde inte hämtas',
            status: 'error',
          });
        });

      // The sidebar counts every status group under the same filter, so one request answers them all.
      const sidebarCounters = [
        { statuses: [Status.NEW], setCount: setNewSupportErrands },
        { statuses: ongoingStatuses, setCount: setOngoingSupportErrands },
        { statuses: assignedStatuses, setCount: setAssignedSupportErrands },
        { statuses: [Status.SOLVED], setCount: setSolvedSupportErrands },
      ];
      const sidebarUpdatePromise = getSupportErrandStatusGroupCounts(
        municipalityId,
        filter,
        sidebarCounters.map((counter) => counter.statuses)
      )
        .then((counts) => {
          if (!isLatestRequest()) return;
          sidebarCounters.forEach((counter, index) => counter.setCount(counts[index]));
        })
        .catch((e) => {
          // A failed count leaves the counters unresolved, as each failed count always has.
          console.error('Error: could not count errands.', e);
        });

      await Promise.allSettled([errandPromise, sidebarUpdatePromise]);
      // A superseded round must not turn the loader off while the round that replaced it is still
      // running.
      if (isLatestRequest()) {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      setSupportErrands,
      setNewSupportErrands,
      setOngoingSupportErrands,
      setAssignedSupportErrands,
      setSolvedSupportErrands,
      supportErrands,
      newSupportErrands,
      ongoingSupportErrands,
      assignedSupportErrands,
      solvedSupportErrands,
      size,
      filter,
      sort,
      toastMessage,
    ]
  );

  useEffect(() => {
    if (typeof page !== 'undefined' && size && size > 0) {
      fetchErrands();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, size, sort]);

  useEffect(() => {
    if (supportErrands.page !== undefined && page !== supportErrands.page) {
      fetchErrands(page);
    }
    //eslint-disable-next-line
  }, [page]);

  return supportErrands;
};

export const getSupportErrandById: (
  id: string,
  municipalityId: string
) => Promise<{ errand: SupportErrand; error?: string }> = (id, municipalityId) => {
  let url = `supporterrands/${municipalityId}/${id}`;
  return apiService
    .get<ApiSupportErrand>(url)
    .then((res: any) => {
      const errand = mapApiSupportErrandToSupportErrand(res.data);
      return { errand };
    })
    .catch(
      (e) =>
        ({ errand: undefined as unknown as SupportErrand, error: e.response?.status ?? 'UNKNOWN ERROR' } as {
          errand: SupportErrand;
          error?: string;
        })
    );
};

export const getSupportErrandByErrandNumber: (
  errandnumber: string
) => Promise<{ errand: SupportErrand; error?: string }> = (errandnumber) => {
  let url = `supporterrands/errandnumber/${errandnumber}`;
  return apiService
    .get<ApiSupportErrand>(url)
    .then((res: any) => {
      const errand = mapApiSupportErrandToSupportErrand(res.data);
      return { errand };
    })
    .catch(
      (e) =>
        ({ errand: undefined as unknown as SupportErrand, error: e.response?.status ?? 'UNKNOWN ERROR' } as {
          errand: SupportErrand;
          error?: string;
        })
    );
};

export const supportErrandIsEmpty: (errand: SupportErrand) => boolean = (errand) => isSupportErrandEmpty(errand);

// Resolve a stakeholder's organization number: prefer the dedicated parameter (written on save),
// and fall back to externalId for legacy COMPANY stakeholders saved before the org number was split out.
const getStakeholderOrganizationNumber = (s: SupportStakeholder): string | undefined =>
  s.parameters?.find((p) => p.key === 'organizationNumber')?.values?.[0] ||
  (s.externalIdType === ExternalIdType.COMPANY ? s.externalId : undefined);

export const mapApiSupportErrandToSupportErrand: (e: ApiSupportErrand) => SupportErrand = (e) => {
  try {
    const classificationValue = (value?: string) => (value === 'NONE' ? '' : value) || '';
    // The investigation's label tree maps its own subcategory onto the third field.
    const subTypeLabel = getMappedLabelSubType(e);
    const ierrand: SupportErrand = {
      ...e,
      category: classificationValue(e.classification?.category),
      type: classificationValue(e.classification?.type),
      subType: subTypeLabel?.resourcePath || subTypeLabel?.resourceName || '',
      contactReason: e.contactReason,
      contactReasonDescription: e.contactReasonDescription,
      businessRelated: e.businessRelated,
      labels: e.labels || [],
      caseId: e.externalTags?.find((t) => t.key === 'caseId')?.value,
      description: sanitized(e?.description ?? ''),
      customer: (e.stakeholders
        ?.filter((s) => s.role === 'PRIMARY')
        ?.map((s) => ({
          ...s,
          // TODO Remove s.firstName when the API is updated with dedicated field for organization name
          organizationName: s.organizationName || s.firstName || '',
          stakeholderType: mapExternalIdTypeToStakeholderType(s),
          username: s.parameters?.find((p) => p.key === 'username')?.values?.[0],
          administrationCode: s.parameters?.find((p) => p.key === 'administrationCode')?.values?.[0],
          administrationName: s.parameters?.find((p) => p.key === 'administrationName')?.values?.[0],
          title: s.parameters?.find((p) => p.key === 'title')?.values?.[0],
          referenceNumber: s.parameters?.find((p) => p.key === 'referenceNumber')?.values?.[0],
          department: s.parameters?.find((p) => p.key === 'department')?.values?.[0],
          organizationNumber: getStakeholderOrganizationNumber(s),
          newRole: 'PRIMARY',
          internalId: uuidv4(),
          emails: (s.contactChannels ?? [])
            .filter((c) => c.type === ContactChannelType.EMAIL || c.type === ContactChannelType.Email)
            .map((c) => ({ value: c.value })),
          phoneNumbers: (s.contactChannels ?? [])
            .filter((c) => c.type === ContactChannelType.PHONE || c.type === ContactChannelType.Phone)
            .map((c) => ({ value: c.value })),
        })) ?? []) as SupportStakeholderFormModel[],
      contacts: (e.stakeholders
        ?.filter((s) => s.role !== 'PRIMARY')
        ?.map((s) => ({
          ...s,
          // TODO Remove s.firstName when the API is updated with dedicated field for organization name
          organizationName: s.organizationName || s.firstName || '',
          stakeholderType: mapExternalIdTypeToStakeholderType(s),
          username: s.parameters?.find((p) => p.key === 'username')?.values?.[0],
          administrationCode: s.parameters?.find((p) => p.key === 'administrationCode')?.values?.[0],
          administrationName: s.parameters?.find((p) => p.key === 'administrationName')?.values?.[0],
          title: s.parameters?.find((p) => p.key === 'title')?.values?.[0],
          referenceNumber: s.parameters?.find((p) => p.key === 'referenceNumber')?.values?.[0],
          department: s.parameters?.find((p) => p.key === 'department')?.values?.[0],
          organizationNumber: getStakeholderOrganizationNumber(s),
          newRole: s.role as string,
          internalId: uuidv4(),
          emails: (s.contactChannels ?? [])
            .filter((c) => c.type === ContactChannelType.EMAIL || c.type === ContactChannelType.Email)
            .map((c) => ({ value: c.value })),
          phoneNumbers: (s.contactChannels ?? [])
            .filter((c) => c.type === ContactChannelType.PHONE || c.type === ContactChannelType.Phone)
            .map((c) => ({ value: c.value })),
        })) ?? []) as SupportStakeholderFormModel[],
    };
    return ierrand;
  } catch (e) {
    console.error('Error: could not map errands.', e);
    throw e;
  }
};

const handleErrandResponse: (res: ApiSupportErrand[]) => SupportErrand[] = (res) => {
  const errands = res.map(mapApiSupportErrandToSupportErrand);
  return errands;
};

const getSupportErrands: (
  municipalityId: string,
  page?: number,
  size?: number,
  filter?: SupportErrandFilterQuery,
  sort?: SupportErrandSortQuery
) => Promise<SupportErrandsData> = (municipalityId, page = 0, size = 10, filter = {}, sort = { modified: 'desc' }) => {
  if (!municipalityId) {
    return Promise.reject('Municipality id missing');
  }
  const query = buildSupportErrandsSearchParameters(page, size, filter, sort);
  const url = `supporterrands/${municipalityId}?${query}`;
  return apiService
    .get<PagedApiSupportErrands>(url)
    .then((res) => {
      const response = {
        errands: handleErrandResponse(res.data.content),
        page: res.data.pageable.pageNumber,
        size: res.data.pageable.pageSize,
        totalPages: res.data.totalPages,
        totalElements: res.data.totalElements,
        labels: [],
      } as SupportErrandsData;
      return response;
    })
    .catch((e) => {
      console.error('Error: could not fetch errands.', e);
      return { errands: [], labels: [], error: e.response?.status ?? 'UNKNOWN ERROR' } as SupportErrandsData;
    });
};

/** How many errands match the filter in each group of statuses, in the order of the groups. */
const getSupportErrandStatusGroupCounts = (
  municipalityId: string,
  filter: SupportErrandFilterQuery,
  statusGroups: readonly (readonly string[])[]
): Promise<number[]> => {
  if (!municipalityId) {
    return Promise.reject('Municipality id missing');
  }
  const query = buildSupportErrandStatusGroupCountParameters(filter, statusGroups);
  return apiService
    .get<{ counts: number[] }>(`countsupporterrands/${municipalityId}/statusgroups?${query}`)
    .then((res) => {
      const counts = res.data?.counts;
      if (!Array.isArray(counts) || counts.length !== statusGroups.length) {
        throw new Error('Unexpected status group counts');
      }
      return counts;
    });
};

/** One choice the registration form offers, identified the way a label always is: by its id. */
export interface SupportRegistrationOption {
  labelId: string;
  displayName: string;
  resourcePath: string;
}

/**
 * What the signed-in handler may choose when registering. The places are theirs alone - the backend
 * resolves them from the same configuration that decides who reaches which errands - so the form
 * offers exactly what it will accept back.
 */
export interface SupportRegistrationOptions {
  reportTypes: SupportRegistrationOption[];
  locations: SupportRegistrationOption[];
  /**
   * Where the places come from: the unit the handler is employed at, or - when no employment is a place -
   * the places configured for their account.
   */
  locationSource?: 'employment' | 'access';
  /** Priority keys as Support Management spells them, e.g. `HIGH`; `findPriorityLabelForPriorityKey` names them. */
  priorities: string[];
}

/** The handler's answers in the registration form. */
export interface SupportRegistrationChoice {
  reportTypeLabelId?: string;
  locationLabelId?: string;
  priority?: string;
}

export const getSupportRegistrationOptions: (municipalityId: string) => Promise<SupportRegistrationOptions> = (
  municipalityId
) => apiService.get<SupportRegistrationOptions>(`newerrand/${municipalityId}/options`).then((res) => res.data);

export const initiateSupportErrand: (
  municipalityId: string,
  choice: SupportRegistrationChoice
) => Promise<any | Partial<SupportErrandDto>> = (municipalityId, choice) => {
  return apiService
    .post<ApiSupportErrand, SupportRegistrationChoice>(`newerrand/${municipalityId}`, choice)
    .then((res) => {
      return mapApiSupportErrandToSupportErrand(res.data);
    })
    .catch((e) => {
      console.error('Something went wrong when initiating errand');
      throw e;
    });
};

interface UpdateResponse {
  notes: boolean;
  attachments: boolean;
  errand: ApiSupportErrand | boolean;
}

/**
 * Writes the edited form back to the errand.
 *
 * `expectedVersion` is a required argument rather than a form field: form state is only reset
 * when the errand page loads, so any version carried in it is stale as soon as another action
 * has written to the errand. Pass the version of the errand currently in the store.
 */
export const updateSupportErrand: (
  municipalityId: string,
  formdata: Partial<RegisterSupportErrandFormModel>,
  expectedVersion: number | undefined,
  currentParameters?: CParameter[]
) => Promise<UpdateResponse> = async (municipalityId, formdata, expectedVersion, currentParameters) => {
  if (!formdata.id) {
    throw new Error('A support errand id is required before writing');
  }
  const errandId = formdata.id;
  const ifMatch = toStrongSupportErrandETag(expectedVersion);
  const stakeholders = buildStakeholdersList(formdata);
  const data = buildSupportErrandUpdateData(formdata, stakeholders);
  const responseObj: UpdateResponse = {
    notes: false,
    attachments: false,
    errand: false,
  };

  try {
    await apiService.patch<ApiSupportErrand, Partial<SupportErrandDto>>(
      `supporterrands/${municipalityId}/${errandId}`,
      data,
      { headers: { 'If-Match': ifMatch } }
    );
    responseObj.errand = true;
  } catch (e) {
    console.error('Something went wrong when patching errand');
    throw e;
  }

  // Parameters live outside the errand body: each is versioned separately and only the ones whose
  // values changed are written, so this save leaves everybody else's parameter edits alone.
  await saveChangedErrandParameters(municipalityId, errandId, currentParameters, formdata.parameters);

  if (formdata.notes) {
    try {
      const noteRes = await saveSupportNote(errandId, municipalityId, formdata.notes);
      responseObj.notes = noteRes;
    } catch (e) {
      responseObj.notes = false;
    }
  } else {
    responseObj.notes = true;
  }

  if (formdata.attachments && formdata.attachments.length > 0) {
    try {
      const attachmentRes = await saveSupportAttachments(
        errandId,
        municipalityId,
        formdata.attachments as { file: File }[]
      );
      responseObj.attachments = attachmentRes.every((r) => r.status === 'fulfilled');
    } catch (e) {
      responseObj.attachments = false;
    }
  } else {
    responseObj.attachments = true;
  }

  if (!responseObj.notes || !responseObj.attachments) {
    const failedChildren = [!responseObj.notes && 'note', !responseObj.attachments && 'attachments']
      .filter(Boolean)
      .join(' and ');
    throw new Error(`Support errand was updated, but ${failedChildren} could not be saved`);
  }

  return responseObj;
};

/**
 * Moves the errand through the workflow. `transitionId` is omitted only when the errand has no phase
 * at all: it is then entering the workflow rather than moving within it, and the backend puts it in
 * the first phase. The status follows the phase, since a phase declares which statuses it allows.
 *
 * The precondition is the phase the caller saw the errand in, not the errand's version: measures,
 * documents and labels move the version without touching the phase.
 */
export const updateSupportErrandPhase = (
  municipalityId: string,
  id: string,
  transitionId: string | undefined,
  expectedActivePhaseId: string | undefined
): Promise<SupportErrand> =>
  apiService
    .patch<ApiSupportErrand, { transitionId?: string; expectedActivePhaseId: string | null }>(
      `supporterrands/${municipalityId}/${id}/phase`,
      { ...(transitionId ? { transitionId } : {}), expectedActivePhaseId: expectedActivePhaseId ?? null }
    )
    .then((response) => mapApiSupportErrandToSupportErrand(response.data))
    .catch((e) => {
      console.error('Something went wrong when updating errand phase');
      throw e;
    });

export const validateAction: (errand: SupportErrand, user: User) => boolean = (errand, user) => {
  // Someone who may only know of the errand acts on nothing in it, whoever it is assigned to.
  if (errand?.limitedAccess) return false;
  let allowed = false;
  if (user.username.toLocaleLowerCase() === errand?.assignedUserId?.toLocaleLowerCase()) {
    allowed = true;
  }
  return allowed;
};

/**
 * Reads the errand's current concurrency state from the API.
 *
 * Only for a write that follows one of *our own* writes in the same flow: that earlier write
 * already verified the version the user was looking at, so the version it produced is causally
 * ours and re-reading cannot mask someone else's edit. The first write in a flow must instead
 * pass the snapshot the view was loaded with - reading immediately before writing satisfies the
 * precondition without ever checking it, which is optimistic locking in name only.
 */
export const readSupportErrandWriteSnapshot = async (
  errandId: string,
  municipalityId: string
): Promise<SupportErrandStatusSnapshot> => {
  const current = await apiService.get<ApiSupportErrand>(`supporterrands/${municipalityId}/${errandId}`);

  return { status: current.data.status, version: current.data.version };
};

/**
 * `expectedVersion` is the version of the errand the caller was looking at. Pass the value from
 * the store, or from `readSupportErrandWriteSnapshot` when an earlier write in the same flow has
 * already moved it on.
 */
export const setSupportErrandAdmin: (
  errandId: string,
  municipalityId: string,
  assignedUserId: string,
  expectedVersion: number | undefined,
  status?: Status,
  assigner?: string
) => Promise<boolean> = (errandId, municipalityId, assignedUserId, expectedVersion, status?, assigner?) =>
  // The assignment and the status it moves the errand to are one action, so one notification.
  withRequestGroup(async () => {
    const data = { assignedUserId };

    try {
      const ifMatch = toStrongSupportErrandETag(expectedVersion);
      await apiService.patch<ApiSupportErrand, typeof data>(
        `supporterrands/${municipalityId}/${errandId}/admin`,
        data,
        {
          headers: { 'If-Match': ifMatch },
        }
      );
    } catch (e) {
      console.error('Something went wrong when patching errand');
      throw e;
    }

    if (status === undefined) return true;

    try {
      // The assignment above is ours and succeeded, so it is the write that moved the version on.
      const afterAssignment = await readSupportErrandWriteSnapshot(errandId, municipalityId);
      return await transitionSupportErrandStatus(errandId, municipalityId, status, afterAssignment);
    } catch (e) {
      // Reported apart from the assignment: that one landed, and an errand left in Ny needs a
      // different answer from the user than one that was never assigned at all.
      console.error('Support errand was assigned, but its status could not be changed');
      throw new SupportErrandStatusAfterAssignmentError(e);
    }
  });

const transitionSupportErrandStatus = async (
  errandId: string,
  municipalityId: string,
  status: Status,
  expected: SupportErrandStatusSnapshot,
  changes: SupportErrandStatusTransitionChanges = {}
): Promise<boolean> => {
  const command = buildSupportErrandStatusTransitionRequest(expected, status, changes);
  await apiService.patch<ApiSupportErrand, SupportErrandStatusTransitionRequest>(
    `supporterrands/${municipalityId}/${errandId}/status`,
    command
  );
  return true;
};

export const setSupportErrandStatus: (
  errandId: string,
  municipalityId: string,
  status: Status,
  expected: SupportErrandStatusSnapshot,
  closingMotivation?: string
) => Promise<boolean> = async (errandId, municipalityId, status, expected, closingMotivation) => {
  return transitionSupportErrandStatus(errandId, municipalityId, status, expected, {
    suspension: { suspendedFrom: undefined, suspendedTo: undefined },
    ...(closingMotivation ? { closingMotivation } : {}),
  }).catch((e) => {
    console.error('Something went wrong when patching errand');
    throw e;
  });
};
