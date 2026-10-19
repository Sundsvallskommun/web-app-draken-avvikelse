import CommonNestedEmailArrayV2 from '@common/components/commonNestedEmailArrayV2';
import CommonNestedPhoneArrayV2 from '@common/components/commonNestedPhoneArrayV2';
import { AddressResult } from '@common/services/adress-service';
import { Button, FormErrorMessage } from '@sk-web-gui/react';
import { useSupportStore } from '@stores/index';
import { SupportStakeholderFormModel } from '@supportmanagement/services/support-errand-service';
import { Plus } from 'lucide-react';
import { FC } from 'react';
import { UseFormReturn } from 'react-hook-form';

interface SupportSearchResultProps {
  searchMode: string;
  disabled: boolean;
  form: UseFormReturn<SupportStakeholderFormModel>;
  selectedUser: AddressResult;
  loading: boolean;
  onSubmit: () => void;
  label: string;
}

export const SupportSearchResult: FC<SupportSearchResultProps> = ({
  searchMode,
  disabled,
  form,
  selectedUser,
  loading,
  onSubmit,
  label,
}) => {
  const supportErrand = useSupportStore((s) => s.supportErrand);

  const username = form.watch('username');
  const administrationName = form.watch('administrationName');
  const firstName = form.watch(`firstName`);
  const lastName = form.watch(`lastName`);
  const address = form.watch(`address`);
  const zipCode = form.watch(`zipCode`);
  const city = form.watch(`city`);
  const organizationName = form.watch(`organizationName`);
  const phoneNumbers = form.watch(`phoneNumbers`);
  const personNumber = form.watch(`personNumber`);
  const organizationNumber = form.watch(`organizationNumber`);
  const title = form.watch(`title`);
  const department = form.watch(`department`);
  const referenceNumber = form.watch(`referenceNumber`);

  return (
    <>
      <div data-cy={`search-result`} className="bg-content-main border rounded-16 p-16 my-sm relative">
        {(searchMode === 'person' || 'employee') && (firstName || lastName) ? (
          <>
            {firstName || lastName ? (
              <p className="my-xs mt-0" data-cy={`stakeholder-name`}>
                {`${firstName} ${lastName}`}
              </p>
            ) : null}
            <p className="my-xs mt-0" data-cy={`stakeholder-ssn`}>
              {personNumber || '(personnummer saknas)'}
            </p>
            {title ? (
              <p className="my-xs mt-0" data-cy={`stakeholder-title`}>
                {title}
              </p>
            ) : null}
            {administrationName ? (
              <p className="my-xs mt-0" data-cy={`stakeholder-administrationName`}>
                {administrationName}
              </p>
            ) : null}
            {department ? (
              <p className="my-xs mt-0" data-cy={`stakeholder-department`}>
                {department}
              </p>
            ) : null}
            {referenceNumber ? (
              <p className="my-xs mt-0" data-cy={`stakeholder-referenceNumber`}>
                {referenceNumber}
              </p>
            ) : null}
            {username ? (
              <p className="my-xs mt-0" data-cy={`stakeholder-username`}>
                {username}
              </p>
            ) : null}

            <p className="my-xs mt-0" data-cy={`stakeholder-adress`}>
              {address || zipCode ? `${address} ${zipCode} ${city}` : '(adress saknas)'}
            </p>
            <p className="my-xs w-1/2" data-cy={`stakeholder-phone`}>
              {phoneNumbers?.length === 0 ? <em>Telefonnummer saknas</em> : null}
            </p>
          </>
        ) : null}

        <>
          <div className="my-md">
            <CommonNestedEmailArrayV2
              errors={form.formState.errors}
              required={false}
              errand={supportErrand}
              addingStakeholder={true}
              disabled={disabled}
              error={!!form.formState.errors.emails}
              key={`nested-email-array`}
              {...form}
            />
          </div>
          <div className="my-md">
            <CommonNestedPhoneArrayV2
              errors={form.formState.errors}
              disabled={disabled}
              error={!!form.formState.errors.phoneNumbers}
              key={`nested-phone-array`}
              {...form}
            />
          </div>
          {(form.formState.errors.emails || form.formState.errors.phoneNumbers) && (
            <div className="flex gap-lg my-sm text-error">
              <FormErrorMessage>
                {form.formState.errors.emails?.message || form.formState.errors.phoneNumbers?.message}
              </FormErrorMessage>
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            loading={loading}
            loadingText="Sparar"
            className="mt-20"
            disabled={!form.formState.isValid}
            onClick={form.handleSubmit(onSubmit)}
            data-cy="submit-contact-person-button"
            leftIcon={<Plus />}
          >
            Lägg till {label.toLowerCase()}
          </Button>
        </>
      </div>
    </>
  );
};
