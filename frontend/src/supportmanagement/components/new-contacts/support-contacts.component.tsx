import { Avatar, Button, Disclosure, FormControl, FormLabel, useConfirm } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore } from '@stores/index';
import {
  emptyContact,
  ExternalIdType,
  isSupportErrandLocked,
  SupportErrand,
  SupportStakeholderFormModel,
} from '@supportmanagement/services/support-errand-service';
import { buildStakeholdersList } from '@supportmanagement/services/support-stakeholder-service';
import { Users } from 'lucide-react';
import { FC, useEffect, useState } from 'react';
import { useFieldArray, useFormContext, UseFormReturn } from 'react-hook-form';

import { handlerManagesStakeholderRole } from './support-contact-handler-managed-roles';
import { SupportSimplifiedContactForm } from './support-simplified-contact-form.component';

interface SupportContactsProps {
  setUnsaved: (unsaved: boolean) => void;
  update: () => void;
  registeringNewErrand?: boolean;
}

export const SupportContactsComponent: FC<SupportContactsProps> = (props) => {
  const [selectedContact, setSelectedContact] = useState<SupportStakeholderFormModel>();
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);
  const deleteConfirm = useConfirm();
  const updateConfirm = useConfirm();

  const setStakeholderContacts = useSupportStore((s) => s.setStakeholderContacts);
  const stakeholderContacts = useSupportStore((s) => s.stakeholderContacts);
  const setStakeholderCustomers = useSupportStore((s) => s.setStakeholderCustomers);
  const stakeholderCustomers = useSupportStore((s) => s.stakeholderCustomers);
  const avatarColorArray = ['vattjom', 'juniskar', 'gronsta', 'bjornstigen'];
  // The deployment's metadata names the role - IAF/VOF call the errand owner "Brukare" there. The
  // page waits for metadata before rendering, so the literal only covers a role without displayName.
  const errandOwnerTitle = supportMetadata?.roles?.find((r) => r.name === 'PRIMARY')?.displayName ?? 'Ärendeägare';
  const handlerAddsOtherParties = handlerManagesStakeholderRole('CONTACT');

  const { control, setValue, reset }: UseFormReturn<SupportErrand, any, undefined> = useFormContext();

  const errandId = supportErrand?.id;

  useEffect(() => {
    setSelectedContact(undefined);
    if (supportErrand) {
      reset(supportErrand);
    }
    setStakeholderContacts(supportErrand?.contacts ?? []);
    setStakeholderCustomers(supportErrand?.customer ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errandId]);

  const contactsFieldArray = useFieldArray({
    control,
    keyName: 'arrayId',
    name: 'contacts',
  });

  const { fields: contactsFields } = contactsFieldArray;

  const onRemove = async (c: SupportStakeholderFormModel) => {
    const customer = stakeholderCustomers.filter((cus) => cus.internalId !== c.internalId);
    const contacts = stakeholderContacts.filter((con) => con.internalId !== c.internalId);

    const data = { customer, contacts };
    const stakeholders = buildStakeholdersList(data);

    setValue('stakeholders', stakeholders);
    setValue('contacts', contacts, { shouldDirty: true });
    setValue('customer', customer, { shouldDirty: true });
    setStakeholderContacts(contacts);
    setStakeholderCustomers(customer);
  };

  const onMakeOwner = async (stakeholder: SupportStakeholderFormModel) => {
    stakeholder.role = 'PRIMARY';

    const customer = stakeholderCustomers;
    const contacts = stakeholderContacts.filter((con) => con.internalId !== stakeholder.internalId);
    customer.push(stakeholder);

    setValue('contacts', contacts, { shouldDirty: true });
    setValue('customer', customer, { shouldDirty: true });
    setStakeholderContacts(contacts);
    setStakeholderCustomers(customer);
  };

  const renderContact = (contact: SupportStakeholderFormModel, index: number, header: string) => {
    const administrationName =
      contact.administrationName ||
      contact.parameters?.find((param) => param.key === 'administrationName')?.values?.[0] ||
      null;
    const title = contact.title || contact.parameters?.find((param) => param.key === 'title')?.values?.[0] || null;
    const referenceNumber =
      contact.referenceNumber ||
      contact.parameters?.find((param) => param.key === 'referenceNumber')?.values?.[0] ||
      null;
    const department =
      contact.department || contact.parameters?.find((param) => param.key === 'department')?.values?.[0] || null;
    const username =
      contact.username ||
      contact.parameters?.find((param) => param.key === 'username' || param.key === 'userId')?.values?.[0] ||
      null;
    const migratedContact = contact.parameters?.find((param) => param.key === 'corrected')?.displayName;
    return (
      <div
        key={`rendered-${contact.internalId}-${contact.role}-${index}`}
        data-cy={`rendered-${contact.role}`}
        className="w-full bg-background-content border rounded-button"
      >
        {selectedContact && selectedContact.internalId === contact.internalId ? (
          <SupportSimplifiedContactForm
            disabled={isSupportErrandLocked(supportErrand!)}
            setUnsaved={props.setUnsaved}
            contact={contact}
            editing={true}
            label={header}
            onSave={(e) => {
              const existingStakeholders = [...stakeholderCustomers, ...stakeholderContacts];
              const matchingIndex = existingStakeholders.findIndex(
                (stakeholder) => stakeholder.internalId === e.internalId
              );
              if (matchingIndex !== -1) {
                existingStakeholders[matchingIndex] = e;
                const newContacts = existingStakeholders.filter((stakeholder) => stakeholder.role !== 'PRIMARY');
                const newCustomers = existingStakeholders.filter((stakeholder) => stakeholder.role === 'PRIMARY');
                setValue('stakeholders', existingStakeholders, { shouldDirty: true });
                setStakeholderContacts(newContacts);
                setStakeholderCustomers(newCustomers);
                setValue('contacts', newContacts, { shouldDirty: true });
                setValue('customer', newCustomers, { shouldDirty: true });
              }
            }}
            onClose={() => setSelectedContact(undefined)}
            id="edit"
          />
        ) : null}

        <div className="bg-vattjom-background-200 px-16 py-8 flex justify-between rounded-t-button">
          <div className="font-bold text-small">
            {header} {!!migratedContact && `(${migratedContact})`}
          </div>

          {!isSupportErrandLocked(supportErrand!) && (
            <div className="flex flex-wrap gap-16 text-small">
              <Button
                disabled={isSupportErrandLocked(supportErrand!)}
                data-cy={`edit-stakeholder-button-${contact.role}-${index}`}
                variant="link"
                className="text-body"
                onClick={() => {
                  setSelectedContact(contact);
                }}
              >
                Redigera uppgifter
              </Button>

              {handlerManagesStakeholderRole(contact.role) && (
                <Button
                  disabled={isSupportErrandLocked(supportErrand!)}
                  data-cy="delete-stakeholder-button"
                  variant="link"
                  className="text-body"
                  onClick={() => {
                    return deleteConfirm
                      .showConfirmation(
                        'Ta bort?',
                        `Vill du ta bort denna ${header?.toLowerCase() || 'intressent'}?`,
                        'Ja',
                        'Nej',
                        'info',
                        'info'
                      )
                      .then((confirmed) => {
                        if (confirmed) {
                          onRemove(contact);
                        }
                      });
                  }}
                >
                  Ta bort
                </Button>
              )}

              {contact.role === 'CONTACT' &&
              stakeholderCustomers.length === 0 &&
              handlerManagesStakeholderRole(contact.role) ? (
                <Button
                  disabled={isSupportErrandLocked(supportErrand!)}
                  data-cy="make-stakeholder-owner-button"
                  variant="link"
                  className="text-body"
                  onClick={() => {
                    return updateConfirm
                      .showConfirmation(
                        'Gör till ärendeägare?',
                        'Vill du göra denna ärendeintressent till ärendeägare?',
                        'Ja',
                        'Nej',
                        'info',
                        'info'
                      )
                      .then((confirmed) => {
                        if (confirmed) {
                          onMakeOwner(contact);
                        }
                      });
                  }}
                >
                  Gör till ärendeägare
                </Button>
              ) : null}
            </div>
          )}
        </div>
        {/* Left side of errand Disclosure */}
        <div className="md:flex md:gap-24 px-16 py-12">
          <div className={`md:w-1/3 flex gap-8 break-all ${administrationName ? `items-start` : `items-center`}`}>
            <Avatar
              rounded
              color={(avatarColorArray[index % 4] as 'vattjom') || 'juniskar' || 'gronsta' || 'bjornstigen'}
              size={'sm'}
              initials={contact.firstName?.[0] || contact.organizationName?.[0] || '?'}
            />
            <div>
              <div>
                {contact.externalIdType === ExternalIdType.COMPANY ? (
                  <>
                    <p className="my-xs mt-0 text-small" data-cy={`stakeholder-name`}>
                      <strong>{`${contact.organizationName ? contact.organizationName : ''}`}</strong>
                    </p>
                    <p
                      className={`my-xs mt-0 flex flex-col text-small ${
                        contact.organizationNumber ? null : 'text-dark-disabled'
                      }`}
                      data-cy={`stakeholder-ssn`}
                    >
                      {contact.organizationNumber || '(organisationsnummer saknas)'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="my-xs mt-0 text-small" data-cy={`stakeholder-name`}>
                      <strong>{`${contact.firstName ? contact.firstName : ''} ${
                        contact.lastName ? contact.lastName : ''
                      }`}</strong>
                    </p>
                    <p
                      className={`my-xs mt-0 flex flex-col text-small ${
                        contact.personNumber ? null : 'text-dark-disabled'
                      }`}
                      data-cy={`stakeholder-ssn`}
                    >
                      {contact.personNumber || '(personnummer saknas)'}
                    </p>
                    <p className={`my-xs mt-0 flex flex-col text-small`} data-cy={`stakeholder-title`}>
                      {title}
                    </p>
                    <p className={`my-xs mt-0 flex flex-col text-small`} data-cy={`stakeholder-administrationName`}>
                      {administrationName}
                    </p>
                    <p className={`my-xs mt-0 flex flex-col text-small`} data-cy={`stakeholder-department`}>
                      {department}
                    </p>
                    <p className={`my-xs mt-0 flex flex-col text-small`} data-cy={`stakeholder-referenceNumber`}>
                      {referenceNumber}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
          {/* Middle of errand Disclosure */}
          <div className="md:w-1/3 md:mt-0 mt-md break-all">
            <p
              className={`my-xs mt-0 flex flex-col text-small ${
                contact.address || contact.zipCode || contact.city ? null : 'text-dark-disabled'
              }`}
              data-cy={`stakeholder-adress`}
            >
              {contact.address || contact.zipCode || contact.city
                ? `${contact.address} ${contact.zipCode} ${contact.city || ''}`
                : '(adress saknas)'}
            </p>
          </div>
          {/* Right side of errand Disclosure */}
          <div className="md:w-1/3 md:mt-0 mt-md">
            <div data-cy={`stakeholder-phone`} className="text-small">
              {contact.phoneNumbers?.map((n) => n.value).join(', ') || (
                <Button
                  disabled={isSupportErrandLocked(supportErrand!)}
                  color="vattjom"
                  variant="link"
                  onClick={() => {
                    setSelectedContact(contact);
                  }}
                >
                  Lägg till telefonnummer
                </Button>
              )}
            </div>

            <div>
              <div data-cy={`stakeholder-email`} className="text-small">
                {contact.emails?.map((n) => n.value).join(', ') || (
                  <Button
                    disabled={isSupportErrandLocked(supportErrand!)}
                    color="vattjom"
                    variant="link"
                    onClick={() => {
                      setSelectedContact(contact);
                    }}
                  >
                    Lägg till e-post
                  </Button>
                )}
              </div>
              {username ? (
                <div className="text-small my-xs mt-0" data-cy={`stakeholder-username`}>
                  <p className="flex flex-col">{username}</p>
                </div>
              ) : null}
              <div></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const addStakeholder = (stakeholder: SupportStakeholderFormModel) => {
    if (stakeholder.role === 'PRIMARY') {
      stakeholderCustomers.push(stakeholder);
      setValue('customer', stakeholderCustomers, { shouldDirty: true });
    } else {
      stakeholderContacts.push(stakeholder);
      setValue('contacts', stakeholderContacts, { shouldDirty: true });
    }
  };

  return (
    <>
      <div className="mt-md">
        <Disclosure variant="alt" initalOpen>
          <Disclosure.Header>
            <Disclosure.Icon icon={<Users />} />
            <Disclosure.Title>{errandOwnerTitle}</Disclosure.Title>
            <Disclosure.Button />
          </Disclosure.Header>
          <Disclosure.Content>
            <div data-cy="registered-applicants">
              <div className="flex flex-row gap-12 flex-wrap">
                {stakeholderCustomers.map((stakeholder, idx) => renderContact(stakeholder, idx, errandOwnerTitle))}
              </div>
              <div className="w-full">
                {stakeholderCustomers.length === 0 ? (
                  <SupportSimplifiedContactForm
                    disabled={isSupportErrandLocked(supportErrand!)}
                    setUnsaved={props.setUnsaved}
                    onSave={(contact) => addStakeholder(contact)}
                    contact={{ ...emptyContact, role: 'PRIMARY' }}
                    editing={false}
                    label={errandOwnerTitle}
                    id="owner"
                  />
                ) : null}
              </div>
            </div>
          </Disclosure.Content>
        </Disclosure>
      </div>
      <div className="mt-md">
        <Disclosure variant="alt" initalOpen>
          <Disclosure.Header>
            <Disclosure.Icon icon={<Users />} />
            <Disclosure.Title>Övriga parter</Disclosure.Title>
            <Disclosure.Button />
          </Disclosure.Header>
          <Disclosure.Content>
            <div data-cy="registered-contacts">
              {handlerAddsOtherParties && (
                <div className="w-full mt-md">
                  <SupportSimplifiedContactForm
                    disabled={isSupportErrandLocked(supportErrand!)}
                    setUnsaved={props.setUnsaved}
                    contact={{ ...emptyContact, role: 'CONTACT' }}
                    editing={false}
                    onSave={(contact) => addStakeholder(contact)}
                    label="Övrig part"
                    id="person"
                  />
                </div>
              )}

              {contactsFields.length !== 0 ? (
                <FormControl className="mt-40 w-full">
                  <FormLabel>Tillagda parter</FormLabel>
                  <div className="flex flex-row gap-12 flex-wrap">
                    {stakeholderContacts.map((stakeholder, idx) => {
                      const role = supportMetadata?.roles?.find((r) => r.name === stakeholder.role)?.displayName;
                      return role ? renderContact(stakeholder, idx, role) : null;
                    })}
                  </div>
                </FormControl>
              ) : null}
            </div>
          </Disclosure.Content>
        </Disclosure>
      </div>
    </>
  );
};
