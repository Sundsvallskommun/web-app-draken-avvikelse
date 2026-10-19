import { apiService } from '@common/services/api-service';
import { Admin } from '@common/services/user-service';
import { ParsedSupportEvent } from '@supportmanagement/interfaces/supportEvent';
import {
  ParsedSupportRevisionDifference,
  RevisionDifferenceData,
  SupportRevisionDifference,
} from '@supportmanagement/interfaces/supportRevisionDiff';

import { Channels, getChannelLabel } from './support-errand-service';

const extractValues: (d: SupportRevisionDifference) => {
  value: string | { [key: string]: string };
  fromValue?: string;
} = (d) => {
  let value, fromValue;
  try {
    value = JSON.parse(d.value);
  } catch (error) {
    value = d.value;
  }
  try {
    fromValue = JSON.parse(d.fromValue).value;
  } catch (error) {
    fromValue = d.fromValue;
  }
  return { value, fromValue };
};

const parseDiffOperation: (d: SupportRevisionDifference) => string = (d) =>
  d?.op === 'add'
    ? 'lades till'
    : d.op === 'replace'
    ? 'ändrades'
    : d.op === 'remove'
    ? 'togs bort'
    : '[Okänd operation]';

const stakeholderFields = {
  firstName: 'Förnamn',
  lastName: 'Efternamn',
  address: 'Address',
  zipCode: 'Postnummer',
  country: 'Land',
  careOf: 'c/o',
};

const parseStakeholderField: (d: SupportRevisionDifference) => string = (d) => {
  if (d.path.includes('contactChannels')) {
    return 'Kontaktväg';
  } else if (Object.keys(stakeholderFields).some((f) => d.path.includes(f))) {
    const path = d.path.split('/').at(-1) as keyof typeof stakeholderFields;
    return stakeholderFields[path];
  } else {
    return 'Kontaktperson';
  }
};

const parseStakeholderDiff: (d: SupportRevisionDifference) => { title: string; description: string } = (d) => {
  const operation = parseDiffOperation(d);
  let field, details;
  field = parseStakeholderField(d);
  const { value, fromValue } = extractValues(d);
  if (d.op === 'add' || d.op === 'remove') {
    const objVal = value as { [key: string]: string };
    if (d.path.includes('contactChannels')) {
      details = objVal.value || '(tomt värde)';
    } else if (Object.keys(stakeholderFields).some((f) => d.path.includes(f))) {
      details = value || '(tomt värde)';
    } else {
      details = `
      <ul>
      <li>Förnamn: ${objVal.firstName}</li>
      <li>Efternamn: ${objVal.lastName}</li>
      <li>Adress: ${objVal.address}</li>
      <li>Postnummer: ${objVal.zipCode}</li>
      <li>Land: ${objVal.country}</li>
      </ul>`;
    }
  } else if (d.op === 'replace') {
    details = `<p>Före: ${fromValue || '(tomt)'}</p><p>Efter: ${value}</p>`;
  } else {
    details = d.value;
  }
  return { title: `${field} ${operation}`, description: `<p>${details}</p>` };
};

const parseAttachmentDiff: (d: SupportRevisionDifference) => { title: string; description: string } = (d) => {
  const operation = parseDiffOperation(d);
  let value;
  try {
    value = JSON.parse(d.value);
  } catch (error) {
    value = d.value;
  }
  // const details = `
  // <ul>
  //   <li>Filnamn: ${value.fileName}</li>
  // </ul>`;
  const details = '';
  return { title: `Bilaga ${operation}: ${value.fileName}`, description: `<p>${details}</p>` };
};

const parseGenericStringDiff: (
  d: SupportRevisionDifference,
  key: string,
  keyMapper?: { [key: string]: string }
) => { title: string; description: string } = (d, key, keyMapper) => {
  const operation = parseDiffOperation(d);
  const { value, fromValue } = extractValues(d);
  const strVal = value as string;
  const details =
    d.op === 'add'
      ? `<p>${keyMapper ? keyMapper[strVal] : strVal}</p>`
      : d.op === 'replace'
      ? `<div><p>Före: ${
          keyMapper && fromValue ? keyMapper[fromValue] || '(tomt)' : fromValue ?? '(tomt)'
        }</p><p>Efter: ${keyMapper ? keyMapper[strVal] : value}</p></div>`
      : `<p>${value}</p>`;
  return { title: `${key} ${operation}`, description: `<p>${details}</p>` };
};

const parseAdministratorDiff: (
  d: SupportRevisionDifference,
  key: string,
  admins: Admin[]
) => { title: string; description: string } = (d, key, admins) => {
  const operation = parseDiffOperation(d);
  const { value, fromValue } = extractValues(d);
  const fromAdmin = admins.find((a) => a.adAccount === fromValue);
  const fromName = fromAdmin ? `${fromAdmin?.firstName} ${fromAdmin?.lastName} (${fromAdmin?.adAccount})` : '(tomt)';
  const toAdmin = admins.find((a) => a.adAccount === value);
  const toName = toAdmin ? `${toAdmin.firstName} ${toAdmin.lastName} (${toAdmin.adAccount})` : '(okänd)';
  const strVal = toName as string;
  const details =
    d.op === 'add'
      ? `<p>${strVal}</p>`
      : d.op === 'replace'
      ? `<div><p>Före: ${fromName}</p><p>Efter: ${toName}</p></div>`
      : `<p>${value}</p>`;
  return { title: `${key} ${operation}`, description: `<p>${details}</p>` };
};

const parseExternalTagDiff: (d: SupportRevisionDifference) => { title: string; description: string } = (d) => {
  // The channels a tag can name, each by the name it is shown under.
  const externalTagValues: Record<string, string | undefined> = Object.fromEntries(
    ['CHAT', 'SOCIAL_MEDIA', 'EMAIL', 'IN_PERSON', 'PHONE', 'ESERVICE', 'ESERVICE_INTERNAL'].map((channel) => [
      channel,
      getChannelLabel(channel),
    ])
  );
  const operation = parseDiffOperation(d);
  let value, fromValue;
  try {
    value = JSON.parse(d.value).value;
  } catch (error) {
    value = d.value;
  }
  try {
    fromValue = JSON.parse(d.fromValue);
  } catch (error) {
    fromValue = d.fromValue;
  }
  const itemType = Object.keys(Channels).includes(value) ? 'Kanal' : 'Tagg';
  const details =
    d.op === 'add'
      ? `<p>${externalTagValues[value]}</p>`
      : d.op === 'replace'
      ? `<div><p>Före: ${externalTagValues[fromValue]}</p><p>Efter: ${externalTagValues[value]}</p></div>`
      : '';
  return { title: `${itemType} ${operation}`, description: `<p>${details}</p>` };
};

const parseDiff: (
  d: SupportRevisionDifference,
  keyMapper: { [key: string]: string },
  admins: Admin[]
) => ParsedSupportRevisionDifference = (d, keyMapper, admins) => {
  const { title, description } = d.path.includes('stakeholders')
    ? parseStakeholderDiff(d)
    : d.path.includes('attachments')
    ? parseAttachmentDiff(d)
    : d.path.includes('description')
    ? parseGenericStringDiff(d, 'Beskrivning')
    : d.path.includes('externalTags')
    ? parseExternalTagDiff(d)
    : d.path.includes('category')
    ? parseGenericStringDiff(d, 'Verksamhet', keyMapper)
    : d.path.includes('type')
    ? parseGenericStringDiff(d, 'Ärendetyp', keyMapper)
    : d.path.includes('status')
    ? parseGenericStringDiff(d, 'Status', keyMapper)
    : d.path.includes('priority')
    ? parseGenericStringDiff(d, 'Prioritet', keyMapper)
    : d.path.includes('resolution')
    ? parseGenericStringDiff(d, 'Lösning', keyMapper)
    : d.path.includes('escalationEmail')
    ? parseGenericStringDiff(d, 'Eskaleringsadress')
    : d.path.includes('body')
    ? parseGenericStringDiff(d, 'Text')
    : d.path.includes('assignedGroupId')
    ? parseGenericStringDiff(d, 'Text')
    : d.path.includes('assignedUserId') || d.path.includes('reporterUserId')
    ? parseAdministratorDiff(d, 'Handläggare', admins)
    : d.path.includes('businessRelated')
    ? parseGenericStringDiff(d, 'Företagsärende', keyMapper)
    : d.path.includes('channel')
    ? parseGenericStringDiff(d, 'Kanal', keyMapper)
    : d.path.includes('labels') ||
      d.path.includes('created') ||
      d.path.includes('modified') ||
      d.path.includes('touched') ||
      d.path.includes('subject') ||
      d.path.includes('previousStatus') ||
      d.path.includes('tempPreviousStatus') ||
      d.path.includes('timeMeasure')
    ? { title: '', description: '' }
    : { title: 'Ej implementerad', description: '' };
  return {
    ...d,
    title,
    description,
  };
};

export const fetchRevisionDiff: (
  errandId: string,
  event: ParsedSupportEvent,
  municipalityId: string,
  keyMapper: { [key: string]: string },
  admins: Admin[]
) => Promise<ParsedSupportRevisionDifference[]> = (errandId, event, municipalityId, keyMapper, admins) => {
  const currentVersion = event.metadata.find((item) => item.key === 'CurrentVersion')?.value;
  const previousVersion = event.metadata.find((item) => item.key === 'PreviousVersion')?.value;
  if (!currentVersion || !previousVersion) {
    return Promise.resolve([]);
  }
  const noteId = event.sourceType === 'Note' ? event.metadata.find((item) => item.key === 'NoteId')?.value : '';
  const url =
    event.sourceType === 'Errand'
      ? `supporthistory/${municipalityId}/${errandId}/revisions/difference?source=${previousVersion}&target=${currentVersion}`
      : event.sourceType === 'Note'
      ? `supporthistory/${municipalityId}/${errandId}/notes/${noteId}/revisions/difference?source=${previousVersion}&target=${currentVersion}`
      : `supporthistory/${municipalityId}/${errandId}/revisions/difference?source=${previousVersion}&target=${currentVersion}`;
  return apiService
    .get<RevisionDifferenceData>(url)
    .then((res) => res.data.operations.map((diff) => parseDiff(diff, keyMapper, admins)))
    .catch((e) => {
      console.error('Something went wrong when fetching revision difference', e);
      throw e;
    });
};
