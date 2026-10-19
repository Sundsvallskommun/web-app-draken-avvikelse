import type { Stakeholder as SupportStakeholder } from '@common/data-contracts/supportmanagement/data-contracts';
import type { RegisterSupportErrandFormModel } from '@supportmanagement/interfaces/errand';
import type { SupportErrandDto } from 'src/data-contracts/backend/data-contracts';

export const buildSupportErrandUpdateData = (
  formdata: Partial<RegisterSupportErrandFormModel>,
  stakeholders: SupportStakeholder[]
): Partial<SupportErrandDto> => {
  // "Om ärendet" is not on the page, so Grundinformation neither shows a classification nor writes one
  // back - otherwise "Spara ärende" would keep resending values the user has no way of seeing or changing.
  // The classification is the investigation's to write.
  const data: Partial<SupportErrandDto> = {
    ...(formdata.title && { title: formdata.title }),
    ...(formdata.priority && {
      priority: formdata.priority,
    }),
    ...(formdata.contactReason && { contactReason: formdata.contactReason }),
    ...(formdata.contactReasonDescription !== undefined && {
      contactReasonDescription: formdata.contactReasonDescription,
    }),
    businessRelated: !!formdata.businessRelated,
    ...(formdata.escalationEmail && { escalationEmail: formdata.escalationEmail }),
    ...(formdata.channel && { channel: formdata.channel }),
    ...(formdata.description && { description: formdata.description }),
    stakeholders,
    externalTags: (formdata.externalTags || []).filter((tag) => tag.key !== 'caseId'),
    // `parameters` is deliberately absent. Each parameter is versioned on its own and has its own
    // endpoint, so it is written per key instead - sending the array here rewrote every parameter on
    // the errand, including the ones somebody else had just changed.
  };
  if (formdata.caseId) {
    data.externalTags!.push({
      key: 'caseId',
      value: formdata.caseId,
    });
  }
  return data;
};
