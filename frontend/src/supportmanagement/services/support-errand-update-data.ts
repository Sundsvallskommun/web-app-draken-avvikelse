import type { Stakeholder as SupportStakeholder } from '@common/data-contracts/supportmanagement/data-contracts';
import { hasDirtyFields } from '@common/services/helper-service';
import type { RegisterSupportErrandFormModel } from '@supportmanagement/interfaces/errand';
import type { SupportErrandDto } from 'src/data-contracts/backend/data-contracts';

type SupportErrandFormField = keyof RegisterSupportErrandFormModel;

/**
 * The form fields `buildSupportErrandUpdateData` writes to the errand itself. Parameters, notes and attachments go
 * to routes of their own, and Ansvarig is written as the assignment.
 */
const SUPPORT_ERRAND_BODY_FIELDS: readonly SupportErrandFormField[] = [
  'title',
  'priority',
  'contactReason',
  'contactReasonDescription',
  'businessRelated',
  'escalationEmail',
  'channel',
  'description',
  'customer',
  'contacts',
  'externalTags',
  'caseId',
];

const isDirty = (dirtyFields: Record<string, unknown> | undefined, ...fields: SupportErrandFormField[]): boolean =>
  fields.some((field) => hasDirtyFields({ [field]: dirtyFields?.[field] }));

/**
 * Does the draft change anything the errand PATCH writes? Only then is there an errand to write: a PATCH of fields
 * nobody touched is still an update to Support Management, logged and told to whoever follows the errand as one.
 */
export const changesSupportErrandBody = (dirtyFields: Record<string, unknown> | undefined): boolean =>
  isDirty(dirtyFields, ...SUPPORT_ERRAND_BODY_FIELDS);

/**
 * The errand's own fields the draft changed, and nothing else of them. The BFF checks each field written against what
 * the handler saw of it, so a field left out is one somebody else may have changed meanwhile without stopping this save.
 */
export const buildSupportErrandUpdateData = (
  formdata: Partial<RegisterSupportErrandFormModel>,
  stakeholders: SupportStakeholder[],
  dirtyFields: Record<string, unknown> | undefined
): Partial<SupportErrandDto> => {
  const changed = (...fields: SupportErrandFormField[]) => isDirty(dirtyFields, ...fields);
  // "Om ärendet" is not on the page, so Grundinformation neither shows a classification nor writes one
  // back - otherwise "Spara ärende" would keep resending values the user has no way of seeing or changing.
  // The classification is the investigation's to write.
  const data: Partial<SupportErrandDto> = {
    ...(changed('title') && formdata.title && { title: formdata.title }),
    ...(changed('priority') && formdata.priority && { priority: formdata.priority }),
    ...(changed('contactReason') && formdata.contactReason && { contactReason: formdata.contactReason }),
    ...(changed('contactReasonDescription') &&
      formdata.contactReasonDescription !== undefined && {
        contactReasonDescription: formdata.contactReasonDescription,
      }),
    ...(changed('businessRelated') && { businessRelated: !!formdata.businessRelated }),
    ...(changed('escalationEmail') && formdata.escalationEmail && { escalationEmail: formdata.escalationEmail }),
    ...(changed('channel') && formdata.channel && { channel: formdata.channel }),
    ...(changed('description') && formdata.description && { description: formdata.description }),
    ...(changed('customer', 'contacts') && { stakeholders }),
    // `parameters` is deliberately absent. Each parameter is versioned on its own and has its own
    // endpoint, so it is written per key instead - sending the array here rewrote every parameter on
    // the errand, including the ones somebody else had just changed.
  };
  if (changed('externalTags', 'caseId')) {
    data.externalTags = [
      ...(formdata.externalTags || []).filter((tag) => tag.key !== 'caseId'),
      ...(formdata.caseId ? [{ key: 'caseId', value: formdata.caseId }] : []),
    ];
  }
  return data;
};
