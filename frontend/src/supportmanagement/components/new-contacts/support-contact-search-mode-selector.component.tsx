import { AddressResult } from '@common/services/adress-service';
import { FormLabel, Input, RadioButton } from '@sk-web-gui/react';
import {
  ExternalIdType,
  SupportStakeholderFormModel,
  SupportStakeholderTypeEnum,
} from '@supportmanagement/services/support-errand-service';
import { Dispatch, FC, SetStateAction } from 'react';
import { UseFieldArrayReplace, UseFormReturn } from 'react-hook-form';

import { offersEmployeeSearchFor } from './support-contact-employee-search';

interface SupportContactSearchModeSelectorProps {
  inName: string;
  searchMode: string;
  disabled: boolean;
  form: UseFormReturn<SupportStakeholderFormModel>;
  contact: SupportStakeholderFormModel;
  id: string;
  label: string;
  setSearchMode: Dispatch<SetStateAction<string>>;
  setSelectedUser: Dispatch<SetStateAction<AddressResult | undefined>>;
  setSearchResult: Dispatch<SetStateAction<boolean>>;
  setSearchResultArray: Dispatch<SetStateAction<AddressResult[]>>;
  replacePhonenumbers: UseFieldArrayReplace<SupportStakeholderFormModel, 'phoneNumbers'>;
}

export const SupportContactSearchModeSelector: FC<SupportContactSearchModeSelectorProps> = ({
  inName,
  searchMode,
  disabled,
  form,
  contact,
  id,
  label,
  setSearchMode,
  setSelectedUser,
  setSearchResult,
  setSearchResultArray,
  replacePhonenumbers,
}) => {
  const offersEmployeeSearch = offersEmployeeSearchFor(contact.role);

  const clearCommonFields = () => {
    replacePhonenumbers([]);
    form.setValue('city', '');
    form.setValue('zipCode', '');
    form.setValue('careOf', '');
    form.setValue('address', '');
    setSearchResult(false);
    setSearchResultArray([]);
    setSelectedUser(undefined);
  };

  const clearFields = (type: 'PERSON' | 'ORGANIZATION') => {
    clearCommonFields();
    setTimeout(() => {
      form.clearErrors(['phoneNumbers']);
      form.setValue(`personId`, '', { shouldDirty: false });
      form.setValue(`personNumber`, '', { shouldDirty: false });
      if (type === 'PERSON') {
        form.setValue(`organizationName`, '', { shouldDirty: false });
        form.setValue(`organizationNumber`, '', { shouldDirty: false });
        form.setValue(`stakeholderType`, SupportStakeholderTypeEnum.PERSON, { shouldDirty: true });
        form.clearErrors(['organizationNumber', 'organizationName']);
      } else {
        form.setValue(`firstName`, '', { shouldDirty: false });
        form.setValue(`lastName`, '', { shouldDirty: false });
        form.setValue(`stakeholderType`, SupportStakeholderTypeEnum.ORGANIZATION, { shouldDirty: true });
        form.clearErrors(['personNumber', 'firstName', 'lastName']);
      }
    }, 0);
  };

  return (
    <fieldset
      className="flex mt-ms mb-md gap-lg justify-start"
      data-cy={`searchmode-selector-${inName}`}
      disabled={disabled}
    >
      <Input type="hidden" {...form.register(`stakeholderType`)} />
      <div className="flex flex-col">
        <FormLabel className="mb-12">Välj typ av {label.toLocaleLowerCase()}</FormLabel>
        <RadioButton.Group inline>
          {offersEmployeeSearch ? (
            <RadioButton
              data-cy={`search-employee-${inName}-${contact.role}`}
              size="sm"
              className="mr-sm"
              name={`stakeholderType-${id}-${inName}`}
              id={`searchEmployee-${id}-${inName}`}
              value={'EMPLOYEE'}
              checked={searchMode === 'employee'}
              onChange={() => {
                setSearchMode('employee');
                form.setValue(`externalIdType`, ExternalIdType.EMPLOYEE);
                clearFields('PERSON');
              }}
            >
              Anställd
            </RadioButton>
          ) : null}
          <RadioButton
            data-cy={`search-person-${inName}-${contact.role}`}
            size="sm"
            className="mr-sm"
            name={`stakeholderType-${id}-${inName}`}
            id={`searchPerson-${id}-${inName}`}
            value={'PERSON'}
            checked={searchMode === 'person'}
            onChange={() => {
              setSearchMode('person');
              form.setValue(`externalIdType`, ExternalIdType.PRIVATE);
              clearFields('PERSON');
            }}
          >
            Privat
          </RadioButton>
        </RadioButton.Group>
      </div>
    </fieldset>
  );
};
