import { Parameter } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService, withRequestGroup } from '@common/services/api-service';

import { toStrongSupportErrandETag } from './support-errand-write-version';

interface ParametersObject {
  RECRUITMENT?: Parameter[];
}

const template: ParametersObject = {
  RECRUITMENT: [
    {
      key: 'recruitment@upstart_0',
      displayName: 'Uppstart',
      group: 'Uppstartsmöte',
      values: ['Uppstartsmöte genomfört', 'false', ''],
    },
    {
      key: 'recruitment@upstart_1',
      displayName: 'Uppstart',
      group: 'Kravprofil',
      values: ['Kravprofil upprättad', 'false', ''],
    },
    {
      key: 'recruitment@upstart_2',
      displayName: 'Uppstart',
      group: 'Tidsplan och annonseringskanal',
      values: ['Tidsplan och annonseringskanal upprättad', 'false', ''],
    },
    {
      key: 'recruitment@advertisement_0',
      displayName: 'Annonspublicering',
      group: 'Annonsering',
      values: ['Annons skapad och chef godkänt', 'false'],
    },
    {
      key: 'recruitment@selection_1',
      displayName: 'Urval och intervjuer',
      group: 'Urvalsmöte',
      values: ['Urvalsmöte genomfört', 'false'],
    },
    {
      key: 'recruitment@selection_2',
      displayName: 'Urval och intervjuer',
      group: 'Internkontroll',
      values: ['Internkontroll genomförd', 'false', ''],
    },
    {
      key: 'recruitment@selection_3',
      displayName: 'Urval och intervjuer',
      group: 'Intervjuunderlag',
      values: ['Intervjuunderlag skapade', 'false'],
    },
    {
      key: 'recruitment@selection_4',
      displayName: 'Urval och intervjuer',
      group: 'Bedömningsmallar',
      values: ['Bedömningsmallar skapade', 'false'],
    },
    {
      key: 'recruitment@selection_5',
      displayName: 'Urval och intervjuer',
      group: 'Intervjutider',
      values: ['Intervjutider skapade', 'false'],
    },
    {
      key: 'recruitment@selection_6',
      displayName: 'Urval och intervjuer',
      group: 'Tester',
      values: ['Tester skapade och skickade', 'false', ''],
    },
    {
      key: 'recruitment@references_0',
      displayName: 'Referenstagning',
      group: 'Dokumentation',
      values: ['All befintlig dokumentation är skapad och dokumenterad', 'false'],
    },
    {
      key: 'recruitment@sync',
      displayName: 'Avstämning',
      group: 'Avstämning',
      values: ['Avstämning med chefen', 'false', ''],
    },
    {
      key: 'recruitment@closure_1',
      displayName: 'Avslut',
      group: 'Återkoppling',
      values: ['Återkoppling till övriga kandidater', 'false', ''],
    },
    {
      key: 'recruitment@closure_0',
      displayName: 'Avslut',
      group: 'Arkivera',
      values: ['Arkivera ansökningshandlingar', 'false', ''],
    },
    {
      key: 'recruitment@closure_2',
      displayName: 'Avslut',
      group: 'Antal rekryterade',
      values: ['Antal rekryterade', 'false', '', 'number'],
    },
    {
      key: 'recruitment@closure_3',
      displayName: 'Avslut',
      group: 'Fakturering',
      values: ['Fakturerat', 'false', ''],
    },
    {
      key: 'recruitment@closure_4',
      displayName: 'Avslut',
      group: 'Kandidatupplevelse',
      values: ['Enkät utskickad', 'false', ''],
    },
    {
      key: 'recruitment@closure_5',
      displayName: 'Avslut',
      group: 'Sammanfattning',
      values: ['Sammanfattning', 'false', ''],
    },
  ],
};

/**
 * One parameter write. `version` is the version the client loaded; leaving it out creates the
 * parameter.
 */
interface ErrandParameterWrite {
  key: string;
  values: string[];
  displayName?: string;
  group?: string;
  version?: number;
}

/**
 * Writes one parameter, conditioned on that parameter's own version.
 *
 * Support Management versions each parameter separately, so a conflict is decided where it happens.
 * A concurrent edit to some other part of the errand neither fails this write nor is overwritten by
 * it - which is what sending the whole parameter array used to do.
 */
const saveErrandParameter = (errandId: string, write: ErrandParameterWrite): Promise<Parameter> =>
  apiService
    .put<Parameter, Omit<ErrandParameterWrite, 'key' | 'version'>>(
      `supporterrands/${errandId}/parameters/${encodeURIComponent(write.key)}`,
      {
        values: write.values,
        ...(write.displayName ? { displayName: write.displayName } : {}),
        ...(write.group ? { group: write.group } : {}),
      },
      {
        headers:
          typeof write.version === 'number'
            ? { 'If-Match': toStrongSupportErrandETag(write.version) }
            : { 'If-None-Match': '*' },
      }
    )
    .then((response) => response.data);

const sameValues = (left: string[] | undefined, right: string[] | undefined): boolean => {
  const first = left ?? [];
  const second = right ?? [];
  return first.length === second.length && first.every((value, index) => value === second[index]);
};

/**
 * Writes only the parameters whose values actually changed, one request each.
 *
 * Unchanged parameters are left alone rather than rewritten with the value they already have: a
 * rewrite would move their version and could overwrite an edit somebody else made while this form
 * was open. Parameters missing from `next` are left untouched - this saves what the form holds and
 * is not a replacement of the collection.
 *
 * However many parameters changed, the requests are one action: they share a request group, so the
 * people following the errand get one notification rather than one for each parameter.
 */
export const saveChangedErrandParameters = (
  errandId: string,
  currentParameters: Parameter[] | undefined,
  nextParameters: Parameter[] | undefined
): Promise<void> =>
  withRequestGroup(async () => {
    const current = new Map((currentParameters ?? []).map((parameter) => [parameter.key, parameter]));

    for (const next of nextParameters ?? []) {
      if (!next.key) continue;
      const existing = current.get(next.key);
      if (existing && sameValues(existing.values, next.values)) continue;

      await saveErrandParameter(errandId, {
        key: next.key,
        values: next.values ?? [],
        displayName: next.displayName,
        group: next.group,
        ...(existing ? { version: existing.version } : {}),
      });
    }
  });
