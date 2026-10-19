import { Stakeholder as SupportStakeholder } from '@common/data-contracts/supportmanagement/data-contracts';
import { Admin } from '@common/services/user-service';
import { RegisterSupportErrandFormModel } from '@supportmanagement/interfaces/errand';

import {
  ContactChannelType,
  ExternalIdType,
  SupportErrand,
  SupportStakeholderFormModel,
  SupportStakeholderTypeEnum,
} from './support-errand-service';

export const getAdminName = (a: Admin) => {
  return a && a.firstName && a.lastName ? `${a.firstName} ${a.lastName} (${a.adAccount})` : ``;
};

/**
 * Looks up the Admin behind one of an errand's user ids (`reporterUserId`, `assignedUserId`).
 *
 * Matching is case-insensitive: `adAccount` comes from Active Directory while the user ids are
 * written from the session username, and the module already compares them that way elsewhere
 * (see `validateAction`).
 */
export const findAdminByAccount = (administrators: Admin[] | undefined, account: string | undefined) =>
  account ? administrators?.find((a: Admin) => a?.adAccount?.toLowerCase() === account.toLowerCase()) : undefined;

export const getApplicantName = (r: SupportErrand) => {
  const applicant = r.stakeholders?.find((s) => s.role === 'PRIMARY');
  return applicant ? `${applicant.firstName} ${applicant.lastName}` : '(saknas)';
};

export const getSupportOwnerStakeholder: (e: SupportErrand) => SupportStakeholderFormModel | undefined = (e) =>
  e.customer?.filter((s) => s.role?.includes('PRIMARY'))?.[0];

export const getSupportReporterStakeholder: (e: SupportErrand) => SupportStakeholderFormModel | undefined = (e) =>
  e.contacts?.filter((s) => s.role?.includes('REPORTER'))?.[0];

const trimPhoneNumber = (s: string) => s.trim().replace('-', '');

export const primaryStakeholderNameorEmail = (errand: SupportErrand) => {
  const primaryStakeholder = errand.stakeholders?.find((primary) => primary.role === 'PRIMARY');
  if (primaryStakeholder) {
    const { firstName, lastName, contactChannels } = primaryStakeholder;
    if (firstName && lastName) return `${firstName} ${lastName}`;

    const emailChannel = contactChannels?.find((channel) => channel.type === 'EMAIL');
    if (emailChannel?.value) return emailChannel.value;
  }
  return '';
};

export const mapExternalIdTypeToStakeholderType = (c: SupportStakeholderFormModel | SupportStakeholder) =>
  c.externalIdType === ExternalIdType.COMPANY
    ? SupportStakeholderTypeEnum.ORGANIZATION
    : SupportStakeholderTypeEnum.PERSON;

const buildStakeholder = (c: SupportStakeholderFormModel, role: string) => {
  if (
    c.externalId ||
    c.organizationName ||
    c.firstName ||
    c.lastName ||
    c.address ||
    c.careOf ||
    c.zipCode ||
    c.city ||
    c.emails.length > 0 ||
    c.phoneNumbers.length > 0
  ) {
    const parameters: { key: string; values: string[]; displayName?: string }[] = [];
    if (c.username) {
      parameters.push({ key: 'username', values: [c.username], displayName: 'Användarnamn' });
    }
    if (c.administrationCode) {
      parameters.push({ key: 'administrationCode', values: [c.administrationCode], displayName: 'Förvaltningskod' });
    }
    if (c.administrationName) {
      parameters.push({ key: 'administrationName', values: [c.administrationName], displayName: 'Förvaltningsnamn' });
    }
    if (c.department) {
      parameters.push({ key: 'department', values: [c.department], displayName: 'Avdelning' });
    }
    if (c.title) {
      parameters.push({ key: 'title', values: [c.title], displayName: 'Titel' });
    }
    if (c.referenceNumber) {
      parameters.push({ key: 'referenceNumber', values: [c.referenceNumber], displayName: 'Referensnummer' });
    }
    if (c.organizationNumber) {
      parameters.push({
        key: 'organizationNumber',
        values: [c.organizationNumber],
        displayName: 'Organisationsnummer',
      });
    }
    const stakeholder: SupportStakeholder = {
      // externalId is the party UUID. Never fall back to the organization number here — that would
      // store a non-UUID as the partyId. The organization number is persisted as a parameter above.
      externalId: c.externalId || undefined,
      externalIdType: c.externalIdType,
      role,
      organizationName: c.organizationName,
      firstName: c.firstName,
      lastName: c.lastName,
      address: c.address,
      zipCode: c.zipCode,
      city: c.city,
      careOf: c.careOf,
      country: 'SVERIGE',
      contactChannels: [
        ...c.emails.map((e) => ({ type: ContactChannelType.EMAIL, value: e.value })),
        ...c.phoneNumbers.map((e) => ({ type: ContactChannelType.PHONE, value: trimPhoneNumber(e.value) })),
      ],
      parameters,
    };
    return stakeholder;
  }
  return undefined;
};

export const buildStakeholdersList = (data: Partial<RegisterSupportErrandFormModel>) => {
  const stakeholders: SupportStakeholder[] = [];
  if (data.customer && data.customer?.length > 0) {
    const c = data.customer[0];
    const customer = buildStakeholder(c, 'PRIMARY');
    if (customer) {
      stakeholders.push(customer);
    }
  }
  data.contacts?.forEach((c) => {
    const stakeholder = buildStakeholder(c, c.role ?? 'CONTACT');
    if (stakeholder) {
      stakeholders.push(stakeholder);
    }
  });
  return stakeholders;
};
