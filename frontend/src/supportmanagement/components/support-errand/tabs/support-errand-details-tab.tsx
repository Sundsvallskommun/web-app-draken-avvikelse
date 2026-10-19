import { JsonParametersDisplay } from '@common/components/json/schema/json-parameters-display.component';
import { Table } from '@sk-web-gui/react';
import { useConfigStore, useSupportStore } from '@stores/index';
import {
  type InvestigationAccessState,
  isInvestigationParameterReadable,
} from '@supportmanagement/investigation/investigation-access';
import { useInvestigationProfileStore } from '@supportmanagement/investigation/investigation-profile-store';
import { isOpenEErrand } from '@supportmanagement/services/support-errand-service';
import { ReactNode, useMemo } from 'react';

export const SupportErrandDetailsTab = ({
  access,
  header,
}: {
  readonly access: InvestigationAccessState;
  /** Rendered first, beneath the heading; an investigation variant may put errand-level controls here. */
  readonly header?: ReactNode;
}) => {
  const _supportErrand = useSupportStore((s) => s.supportErrand);
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const profile = useInvestigationProfileStore((state) => state.profile);
  const handledJsonParameterKeys = useInvestigationProfileStore((state) => state.handledJsonParameterKeys);
  const supportErrand = _supportErrand!;
  // Avoid both duplicate rendering and exposing a hidden document from an older errand snapshot.
  const readonlyJsonParameters = useMemo(
    () =>
      (supportErrand.jsonParameters ?? []).filter(
        ({ key }) => !handledJsonParameterKeys[key] && isInvestigationParameterReadable(profile, access, key)
      ),
    [access, profile, handledJsonParameterKeys, supportErrand.jsonParameters]
  );

  const simpleParams = useMemo(
    () =>
      supportErrand.parameters?.filter((p) => {
        return typeof p.displayName === 'string' && !p.displayName.includes('|') && !p.key.includes('recruitment@');
      }) || [],
    [supportErrand.parameters]
  );

  const tableParams = useMemo(
    () =>
      supportErrand?.parameters?.filter(
        (param) =>
          typeof param.displayName === 'string' &&
          param.displayName.includes('|') &&
          param.displayName.split('|').length > 1 &&
          !param.key.includes('recruitment@')
      ) || [],
    [supportErrand.parameters]
  );

  const tables: { label: string; header: string[]; rows: { key: string; value: string }[][] }[] = useMemo(
    () =>
      tableParams?.map((param) => {
        const header = param.displayName!.split('|');
        const rows = param.values!.map((row: string) => {
          const columns = row?.split('|') || [];
          return columns.map((column, idx) => {
            return {
              key: `${param.key}-${idx}`,
              value: column,
            };
          });
        });
        return {
          label: param.group || '',
          header: header,
          rows: rows,
        };
      }) || [],
    [tableParams]
  );

  return (
    <div className="pt-xl pb-16 px-40 flex flex-col">
      <div className="flex flex-col gap-md mb-32">
        <h2 className="text-h2-md">Ärendeuppgifter</h2>
        {header}
        {(isOpenEErrand(supportErrand) || simpleParams.length > 0) && (
          <div className="rounded-lg gap-md p-16">
            <h3 className="text-h3-md mb-12">Grunduppgifter</h3>
            {isOpenEErrand(supportErrand) ? (
              <div className="flex flex-row gap-md">
                <strong>Ärendenummer i e-tjänst</strong>
                <span>{supportErrand.externalTags?.find((tag) => tag.key === 'caseId')?.value}</span>
              </div>
            ) : null}
            {simpleParams
              .filter((param) => (param.values?.length ?? 0) > 0)
              .map((param, idx) => (
                <div key={`first-${param.key}-${idx}`} className="flex flex-row gap-md my-sm">
                  <div className="font-bold">{param.displayName}</div>
                  <div>{param.values?.join(', ')}</div>
                </div>
              ))}
          </div>
        )}

        {tables.map((table, idx) => (
          <div key={`table-${idx}`} className="p-16">
            <h3 className="text-h3-md mb-12">{table.label}</h3>
            <Table dense background>
              <Table.Header>
                {table.header.map((header, headerIdx) => (
                  <Table.HeaderColumn key={`header-${headerIdx}`} className="flex justify-start">
                    {header}
                  </Table.HeaderColumn>
                ))}
              </Table.Header>
              <Table.Body>
                {table.rows.map((row, rowIdx) => (
                  <Table.Row key={`row-${rowIdx}`}>
                    {row.map((cell) => (
                      <Table.Column key={cell.key} className="flex justify-start">
                        {cell.value}
                      </Table.Column>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ))}
        {readonlyJsonParameters.length > 0 && municipalityId ? (
          <div className="p-16">
            <JsonParametersDisplay jsonParameters={readonlyJsonParameters} municipalityId={municipalityId} />
          </div>
        ) : null}
      </div>
    </div>
  );
};
