import { AddressResult, isValidOrgNumber } from '@common/services/adress-service';
import {
  invalidOrgNumberMessage,
  invalidPhoneMessage,
  invalidSsnMessage,
  invalidUsernameMessage,
  luhnCheck,
  newNumberPhonePattern,
  orgNumberPattern,
  phonePattern,
  ssnPattern,
  usernamePattern,
} from '@common/services/helper-service';
import { yupResolver } from '@hookform/resolvers/yup';
import { Button, FormControl, Input } from '@sk-web-gui/react';
import { useConfigStore, useMetadataStore } from '@stores/index';
import {
  emptyContact,
  ExternalIdType,
  SupportStakeholderFormModel,
  SupportStakeholderTypeEnum,
} from '@supportmanagement/services/support-errand-service';
import { getSupportMetadata } from '@supportmanagement/services/support-metadata-service';
import { Pen } from 'lucide-react';
import { FC, useEffect, useState } from 'react';
import { Resolver, useFieldArray, useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';
import * as yup from 'yup';

import { withholdsEmployeeSearchFrom } from './support-contact-employee-search';
import { SupportContactModal } from './support-contact-modal.component';
import { SupportContactSearchField } from './support-contact-search-field.component';
import { SupportContactSearchModeSelector } from './support-contact-search-mode-selector.component';
import { SupportSearchResult } from './support-search-result.component';
export const SupportSimplifiedContactForm: FC<{
  contact: SupportStakeholderFormModel;
  editing: boolean;
  setUnsaved: (unsaved: boolean) => void;
  disabled?: boolean;
  onSave?: (data: any) => void;
  onClose?: () => void;
  label: string;
  id: string;
}> = (props) => {
  const {
    contact = emptyContact,
    setUnsaved = () => {},
    onClose = () => {},
    onSave = () => {},
    label = '',
    id,
  } = props;

  const yupContact = yup.object().shape(
    {
      personNumber: yup.string().when('stakeholderType', {
        is: (type: string) => {
          return (
            type === 'PERSON' &&
            searchMode === 'employee' &&
            !personNumber?.toString().startsWith('1') &&
            !personNumber?.toString().startsWith('2')
          );
        },
        then: (schema) => schema.matches(usernamePattern, invalidUsernameMessage),
        otherwise: (schema) =>
          schema
            .trim()
            .matches(ssnPattern, invalidSsnMessage)
            .test('luhncheck', invalidSsnMessage, (ssn) => luhnCheck(ssn) || !ssn),
      }),

      personId: yup.string(),
      stakeholderType: yup.string(),
      organizationName: yup.string().when(['stakeholderType', 'lastName'], {
        is: (sType: string, lastName: string) =>
          sType === 'ORGANIZATION' && (searchMode === 'organization' || searchMode === 'enterprise'),
        then: (schema) => schema.required('Organisationsnamn måste anges'),
      }),
      organizationNumber: yup.string().when('stakeholderType', {
        is: (type: string) => type === 'ORGANIZATION',
        then: (schema) =>
          schema
            .trim()
            .matches(orgNumberPattern, invalidOrgNumberMessage)
            .test('isValidOrgNr', invalidOrgNumberMessage, (orgNr) => isValidOrgNumber(orgNr!) || !orgNr),
      }),
      firstName: yup.string().when('organizationName', {
        is: (_: string) => searchMode === 'person' || searchMode === 'employee',
        then: (schema) => schema.required('Förnamn måste anges'),
      }),
      lastName: yup.string().when('organizationName', {
        is: (sType: string) => searchMode === 'person' || searchMode === 'employee',
        then: (schema) => schema.required('Efternamn måste anges'),
      }),
      address: yup.string(),
      careOf: yup.string(),
      zipCode: yup.string(),
      city: yup.string(),
      username: yup.string(),
      administrationCode: yup.string(),
      administrationName: yup.string(),
      department: yup.string(),
      referencenumber: yup.string().optional(),
      title: yup.string(),
      newPhoneNumber: yup
        .string()
        .trim()
        .transform((val) => val && val.replace('-', ''))
        .matches(newNumberPhonePattern, invalidPhoneMessage),
      phoneNumbers: yup.array().of(
        yup.object().shape({
          value: yup
            .string()
            .trim()
            .transform((val) => val.replace('-', ''))
            .matches(phonePattern, invalidPhoneMessage),
        })
      ),
      newEmail: yup.string().trim().email('E-postadress har fel format'),
      emails: yup.array().of(
        yup.object().shape({
          value: yup.string().trim().email('E-postadress har fel format'),
        })
      ),
      primaryContact: yup.boolean(),
      messageAllowed: yup.boolean(),
      role: yup.string(),
    },
    [
      ['emails', 'phoneNumbers'],
      ['firstName', 'organizationName'],
      ['lastName', 'organizationName'],
    ]
  );

  const municipalityId = useConfigStore((s) => s.municipalityId);
  const setSupportMetadata = useMetadataStore((s) => s.setSupportMetadata);
  const [searchMode, setSearchMode] = useState('person');
  // Without organisations the search starts on employees, unless the stakeholder's role is never one.
  const searchModeWithoutOrganizations = withholdsEmployeeSearchFrom(contact.role) ? 'person' : 'employee';
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [manual, setManual] = useState(false);
  const [searchResult, setSearchResult] = useState(false);
  const [loading, setIsLoading] = useState(false);
  const [searchResultArray, setSearchResultArray] = useState<AddressResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<AddressResult>();
  const [query, setQuery] = useState('');
  const [searchFieldKey, setSearchFieldKey] = useState(0);

  const searchProps = {
    searchResult,
    setSearchResult,
    searchResultArray,
    setSearchResultArray,
    searching,
    setSearching,
    query,
    setQuery,
    notFound,
    setNotFound,
    setSelectedUser,
    searchMode,
    setUnsaved,
    setSearchMode,
    searchFieldKey,
  };

  const form = useForm<SupportStakeholderFormModel>({
    defaultValues: contact,
    mode: 'onBlur', // NOTE: Needed if we want to disable submit until valid
    resolver: yupResolver(yupContact) as unknown as Resolver<SupportStakeholderFormModel>,
  });

  const { register, control, handleSubmit, watch, setValue, formState, reset } = form;

  const firstName = watch(`firstName`);
  const lastName = watch(`lastName`);
  const organizationName = watch(`organizationName`);
  const personNumber = watch(`personNumber`);
  const organizationNumber = watch(`organizationNumber`);

  const closeHandler = () => {
    setManual(false);
    onClose();
  };

  const { append: appendPhonenumber, replace: replacePhonenumbers } = useFieldArray({
    control,
    name: `phoneNumbers`,
  });

  const { append: appendEmail } = useFieldArray({ control, name: 'emails' });

  const editing = props.editing;

  const resetPersonNumber = () => {
    setValue(`personNumber`, '', { shouldDirty: false });
  };

  useEffect(() => {
    if (manual && !editing) {
      resetPersonNumber();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual]);

  useEffect(() => {
    setSearchMode(searchModeWithoutOrganizations);
    if (!contact.internalId) {
      setValue(`stakeholderType`, contact.stakeholderType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      manual &&
      !editing &&
      (formState.dirtyFields?.firstName || formState.dirtyFields?.lastName || formState.dirtyFields?.organizationName)
    ) {
      resetPersonNumber();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, organizationName]);

  useEffect(() => {
    if (searchResult) {
      setSearchResult(false);
      const currentStakeholderType = form.getValues('stakeholderType');
      const currentExternalIdType = form.getValues('externalIdType');
      reset({ stakeholderType: currentStakeholderType, externalIdType: currentExternalIdType }, { keepErrors: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationNumber, personNumber]);

  useEffect(() => {
    municipalityId && getSupportMetadata(municipalityId).then((res) => setSupportMetadata(res.metadata));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [municipalityId]);

  const onSubmit = async (e: SupportStakeholderFormModel) => {
    if (!editing) {
      e.internalId = uuidv4();
    }
    setIsLoading(true);
    onSave(e);
    setManual(false);
    setSearchResult(false);
    setSearchMode(searchModeWithoutOrganizations);
    onClose();
    setIsLoading(false);
    reset();
    resetPersonNumber();
  };

  useEffect(() => {
    if (selectedUser) {
      setValue(`externalId`, selectedUser.personId, { shouldDirty: true });
      setValue(`firstName`, selectedUser.firstName, { shouldDirty: true });
      setValue(`lastName`, selectedUser.lastName, { shouldDirty: true });
      setValue(`organizationName`, selectedUser.organizationName, {
        shouldDirty: true,
      });
      setValue(`address`, selectedUser.street, { shouldDirty: true });
      setValue(`careOf`, selectedUser.careof, { shouldDirty: true });
      setValue(`zipCode`, selectedUser.zip, { shouldDirty: true });
      setValue(`city`, selectedUser.city, { shouldDirty: true });
      setValue(`administrationCode`, selectedUser.administrationCode, { shouldDirty: true });
      setValue(`administrationName`, selectedUser.administrationName, { shouldDirty: true });
      setValue(`department`, selectedUser.department, { shouldDirty: true });
      setValue(`title`, selectedUser.title, { shouldDirty: true });
      setValue(`referenceNumber`, selectedUser.referenceNumber, { shouldDirty: true });
      if (selectedUser.phone) {
        appendPhonenumber({ value: selectedUser.phone });
      }
      if (selectedUser.workPhone) {
        appendPhonenumber({ value: selectedUser.workPhone });
      }
      if (selectedUser.email) {
        appendEmail({ value: selectedUser.email });
      }
      if (selectedUser.loginName) {
        setValue('username', selectedUser.loginName);
      }

      setSearchResult(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser]);

  return (
    <div data-cy={`contact-form`} key={contact.internalId}>
      <div className="hidden">
        <FormControl id={`id`}>
          <Input data-cy={`contact-externalId-${id}`} {...register(`externalId`)} type="hidden" />
          <Input data-cy={`contact-externalIdType-${id}`} {...register(`externalIdType`)} type="hidden" />
          <Input data-cy={`contact-id-${id}`} {...register(`internalId`)} type="hidden" />
          <Input data-cy={`contact-role-${id}`} {...register(`role`)} />
        </FormControl>
      </div>

      {!editing ? (
        <>
          <SupportContactSearchModeSelector
            inName={'form'}
            disabled={props.disabled!}
            form={form}
            contact={contact}
            id={id}
            label={label}
            replacePhonenumbers={replacePhonenumbers}
            {...searchProps}
          />
          <SupportContactSearchField
            disabled={props.disabled!}
            form={form}
            id={id}
            appendPhonenumber={appendPhonenumber}
            appendEmail={appendEmail}
            {...searchProps}
          />
        </>
      ) : null}

      {searchResult ? (
        <SupportSearchResult
          searchMode={searchMode}
          disabled={props.disabled!}
          form={form}
          selectedUser={selectedUser!}
          loading={loading}
          onSubmit={handleSubmit(onSubmit)}
          label={label}
        />
      ) : null}

      {editing || searchResult ? null : (
        <div className="">
          <Button
            disabled={props.disabled}
            className="mt-20"
            data-cy={`add-manually-button-${id}`}
            color="vattjom"
            inverted
            size="sm"
            leftIcon={<Pen />}
            onClick={() => {
              reset({}, { keepErrors: false });
              setQuery('');
              setSearchFieldKey((prev) => prev + 1);
              setValue('organizationNumber', '', { shouldDirty: false });
              setValue('personNumber', '', { shouldDirty: false });
              setValue(
                'stakeholderType',
                searchMode === 'person' || searchMode === 'employee'
                  ? SupportStakeholderTypeEnum.PERSON
                  : SupportStakeholderTypeEnum.ORGANIZATION
              );
              setValue(
                'externalIdType',
                searchMode === 'person' || searchMode === 'employee' ? ExternalIdType.PRIVATE : ExternalIdType.COMPANY
              );
              setManual(true);
            }}
          >
            Lägg till manuellt
          </Button>
        </div>
      )}

      <SupportContactModal
        manual={manual}
        editing={editing}
        closeHandler={closeHandler}
        onSubmit={handleSubmit(onSubmit)}
        label={label}
        disabled={props.disabled!}
        loading={loading}
        contact={contact}
        form={form}
        id={id}
        replacePhonenumbers={replacePhonenumbers}
        {...searchProps}
      />
    </div>
  );
};
