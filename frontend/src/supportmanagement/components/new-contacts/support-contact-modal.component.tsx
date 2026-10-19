import CommonNestedEmailArrayV2 from '@common/components/commonNestedEmailArrayV2';
import CommonNestedPhoneArrayV2 from '@common/components/commonNestedPhoneArrayV2';
import { AddressResult } from '@common/services/adress-service';
import { Button, cx, FormControl, FormErrorMessage, FormLabel, Input, Modal } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore } from '@stores/index';
import { ExternalIdType, SupportStakeholderFormModel } from '@supportmanagement/services/support-errand-service';
import { Dispatch, FC, SetStateAction } from 'react';
import { UseFieldArrayReplace, UseFormReturn } from 'react-hook-form';

interface SupportContactModalProps {
  manual: boolean;
  editing: boolean;
  closeHandler: () => void;
  onSubmit: () => void;
  label: string;
  searchMode: string;
  disabled: boolean;
  loading: boolean;
  form: UseFormReturn<SupportStakeholderFormModel>;
  contact: SupportStakeholderFormModel;
  id: string;
  setSearchMode: Dispatch<SetStateAction<string>>;
  setSelectedUser: Dispatch<SetStateAction<AddressResult | undefined>>;
  setSearchResult: Dispatch<SetStateAction<boolean>>;
  setSearchResultArray: Dispatch<SetStateAction<AddressResult[]>>;
  replacePhonenumbers: UseFieldArrayReplace<SupportStakeholderFormModel, 'phoneNumbers'>;
}

export const SupportContactModal: FC<SupportContactModalProps> = ({
  manual,
  editing,
  closeHandler,
  onSubmit,
  label,
  searchMode,
  disabled,
  loading,
  form,
  contact,
  id,
  setSearchMode,
  setSelectedUser,
  setSearchResult,
  setSearchResultArray,
  replacePhonenumbers,
}) => {
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const supportErrand = useSupportStore((s) => s.supportErrand);

  const username = form.watch('username');
  const personNumber = form.watch('personNumber');
  const showPersonNumberField = searchMode === 'employee' || !!personNumber || !!username;
  const showUsername = !!username && !personNumber;
  const personNumberFieldName = showUsername ? 'username' : 'personNumber';

  return (
    <Modal
      show={manual || editing}
      className="w-[56rem]"
      onClose={closeHandler}
      label={manual ? `Lägg till ${label.toLowerCase()}` : `Redigera ${label.toLowerCase()}`}
    >
      <Modal.Content className="p-0">
        <>
          {searchMode === 'person' || searchMode === 'employee' ? (
            <>
              <div className="flex gap-lg">
                {showPersonNumberField ? (
                  <FormControl id={`contact-personnumber`} className="w-1/2">
                    <FormLabel>{showUsername ? 'Användarnamn' : 'Personnummer'}</FormLabel>
                    <Input
                      size="sm"
                      disabled={disabled}
                      readOnly
                      data-cy={`contact-${personNumberFieldName}`}
                      {...form.register(personNumberFieldName)}
                    />
                    {form.formState.errors.personNumber && (
                      <div className="my-sm text-error">
                        <FormErrorMessage>{form.formState.errors.personNumber?.message}</FormErrorMessage>
                      </div>
                    )}
                  </FormControl>
                ) : null}
                {showPersonNumberField ? <div className="w-1/2"></div> : null}
              </div>
              <div className="flex gap-lg">
                <FormControl id={`firstName`} className="w-1/2">
                  <FormLabel>
                    Förnamn<span aria-hidden="true">*</span>
                  </FormLabel>
                  <Input
                    size="sm"
                    disabled={disabled}
                    className={cx(
                      form.formState.errors.firstName ? 'border-2 border-error' : null,
                      'read-only:bg-gray-lighter read-only:cursor-not-allowed'
                    )}
                    data-cy={`contact-firstName`}
                    {...form.register(`firstName`)}
                  />

                  {form.formState.errors?.firstName && (
                    <div className="my-sm text-error">
                      <FormErrorMessage>{form.formState.errors.firstName?.message}</FormErrorMessage>
                    </div>
                  )}
                </FormControl>

                <FormControl id={`lastName`} className="w-1/2">
                  <FormLabel>
                    Efternamn{' '}
                    {contact.externalIdType !== ExternalIdType.COMPANY ? <span aria-hidden="true">*</span> : null}
                  </FormLabel>
                  <Input
                    size="sm"
                    disabled={disabled}
                    className={cx(
                      form.formState.errors.lastName ? 'border-2 border-error' : null,
                      'read-only:bg-gray-lighter read-only:cursor-not-allowed'
                    )}
                    data-cy={`contact-lastName`}
                    {...form.register(`lastName`)}
                  />

                  {form.formState.errors.lastName && (
                    <div className="my-sm text-error">
                      <FormErrorMessage>{form.formState.errors.lastName?.message}</FormErrorMessage>
                    </div>
                  )}
                </FormControl>
              </div>
            </>
          ) : (
            <div className="flex gap-lg">
              <FormControl id={`contact-organizationNumber`} className="w-1/2">
                <FormLabel>Organisationsnummer</FormLabel>
                <Input
                  size="sm"
                  disabled={disabled}
                  readOnly
                  data-cy={`contact-organizationNumber`}
                  className={cx(
                    form.formState.errors.personNumber ? 'border-2 border-error' : null,
                    'read-only:bg-gray-lighter read-only:cursor-not-allowed'
                  )}
                  {...form.register(`organizationNumber`)}
                />

                {form.formState.errors && form.formState.errors.personNumber && (
                  <div className="my-sm text-error">
                    <FormErrorMessage>{form.formState.errors.personNumber?.message}</FormErrorMessage>
                  </div>
                )}
              </FormControl>

              <FormControl id={`organizationName`} className="w-1/2">
                <FormLabel>
                  Organisationsnamn<span aria-hidden="true">*</span>
                </FormLabel>
                <Input
                  size="sm"
                  disabled={disabled}
                  className={cx(
                    form.formState.errors.firstName ? 'border-2 border-error' : null,
                    'read-only:bg-gray-lighter read-only:cursor-not-allowed'
                  )}
                  data-cy={`contact-organizationName`}
                  {...form.register(`organizationName`)}
                />

                {form.formState.errors?.organizationName && (
                  <div className="my-sm text-error">
                    <FormErrorMessage>{form.formState.errors.organizationName?.message}</FormErrorMessage>
                  </div>
                )}
              </FormControl>
            </div>
          )}
        </>
        <>
          <div className="flex gap-lg">
            <FormControl id={`street`} className="w-1/2">
              <FormLabel>Adress</FormLabel>
              <Input
                size="sm"
                disabled={disabled}
                aria-disabled={disabled}
                className={cx(`readonly:bg-gray-lighter readonly:cursor-not-allowed`)}
                data-cy={`contact-address`}
                {...form.register(`address`)}
              />

              {form.formState.errors.address && (
                <div className="my-sm text-error">
                  <FormErrorMessage>{form.formState.errors.address?.message}</FormErrorMessage>
                </div>
              )}
            </FormControl>
            <FormControl id={`careOf`} className="w-1/2">
              <FormLabel>C/o-adress</FormLabel>
              <Input
                size="sm"
                disabled={disabled}
                aria-disabled={disabled}
                className={cx(`readonly:bg-gray-lighter readonly:cursor-not-allowed`)}
                data-cy={`contact-careOf`}
                {...form.register(`careOf`)}
              />
              {form.formState.errors.careOf && (
                <div className="my-sm text-error">
                  <FormErrorMessage>{form.formState.errors.careOf?.message}</FormErrorMessage>
                </div>
              )}
            </FormControl>
          </div>
          <div className="flex gap-lg">
            <FormControl id={`zip`} className="w-1/2">
              <FormLabel>Postnummer</FormLabel>
              <Input
                size="sm"
                disabled={disabled}
                aria-disabled={disabled}
                className={cx(`readonly:bg-gray-lighter readonly:cursor-not-allowed`)}
                data-cy={`contact-zipCode`}
                {...form.register(`zipCode`)}
              />

              {form.formState.errors.zipCode && (
                <div className="my-sm text-error">
                  <FormErrorMessage>{form.formState.errors.zipCode?.message}</FormErrorMessage>
                </div>
              )}
            </FormControl>
            <FormControl id={`zip`} className="w-1/2">
              <FormLabel>Stad</FormLabel>
              <Input
                size="sm"
                disabled={disabled}
                aria-disabled={disabled}
                className={cx(`readonly:bg-gray-lighter readonly:cursor-not-allowed`)}
                data-cy={`contact-city`}
                {...form.register(`city`)}
              />

              {form.formState.errors.city && (
                <div className="my-sm text-error">
                  <FormErrorMessage>{form.formState.errors.city?.message}</FormErrorMessage>
                </div>
              )}
            </FormControl>
          </div>
        </>
        <CommonNestedEmailArrayV2
          required={false}
          errand={supportErrand}
          addingStakeholder={true}
          disabled={disabled}
          error={!!form.formState.errors.emails}
          key={`nested-email-array`}
          errors={form.formState.errors}
          {...form}
        />
        <CommonNestedPhoneArrayV2
          disabled={disabled}
          error={!!form.formState.errors.phoneNumbers}
          key={`nested-phone-array`}
          errors={form.formState.errors}
          {...form}
        />
        {(form.formState.errors.emails || form.formState.errors.phoneNumbers) && (
          <div className="flex gap-lg my-sm text-error">
            <FormErrorMessage>
              {form.formState.errors.emails?.message || form.formState.errors.phoneNumbers?.message}
            </FormErrorMessage>
          </div>
        )}
        <div className="mt-md flex gap-lg justify-start">
          <div>
            <Button
              type="button"
              className="w-full"
              variant="secondary"
              color="primary"
              onClick={closeHandler}
              data-cy="cancel-contact-button"
            >
              Avbryt
            </Button>
          </div>
          <div>
            <Button
              type="button"
              data-cy="submit-contact-button"
              loading={loading}
              loadingText="Sparar"
              className="w-full"
              disabled={!form.formState.isValid}
              variant="primary"
              color="primary"
              onClick={form.handleSubmit(onSubmit)}
            >
              {editing ? 'Ändra uppgifter' : 'Lägg till uppgifter'}
            </Button>
          </div>
        </div>
      </Modal.Content>
    </Modal>
  );
};
