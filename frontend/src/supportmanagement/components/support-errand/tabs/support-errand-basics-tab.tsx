import { useSupportStore } from '@stores/index';
import { SupportContactsComponent } from '@supportmanagement/components/new-contacts/support-contacts.component';
import { RelatedReportsDisclosure } from '@supportmanagement/components/support-errand/related-reports/related-reports-disclosure.component';
import { supportErrandIsEmpty } from '@supportmanagement/services/support-errand-service';
import { FC } from 'react';

export const SupportErrandBasicsTab: FC<{
  setUnsaved: (unsaved: boolean) => void;
}> = (props) => {
  const supportErrand = useSupportStore((s) => s.supportErrand);

  return (
    <div className="pt-xl pb-64 px-40 flex flex-col">
      <div className="flex flex-col gap-md mb-32">
        <h2 className="text-h2-md">Grundinformation</h2>
        <span>Fyll i följande uppgifter för att säkerställa att vi har all nödvändig information om ärendet.</span>
      </div>

      {supportErrand?.id ? (
        <SupportContactsComponent
          registeringNewErrand={typeof supportErrand?.id === 'undefined'}
          setUnsaved={props.setUnsaved}
          update={() => {}}
        />
      ) : null}

      <div className="mt-md">
        <RelatedReportsDisclosure errand={supportErrand!} disabled={supportErrandIsEmpty(supportErrand!)} />
      </div>
    </div>
  );
};
