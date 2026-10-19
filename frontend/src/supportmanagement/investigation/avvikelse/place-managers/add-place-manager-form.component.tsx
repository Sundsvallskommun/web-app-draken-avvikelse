import { countWithNoun } from '@common/utils/count-with-noun';
import { Alert, Button, FormControl, FormLabel, Input } from '@sk-web-gui/react';
import { FC, FormEvent, useId, useState } from 'react';

import type { PlaceManagerPerson, PlaceManagerRole } from './place-manager-service';
import type { PlaceTreeNode } from './place-manager-tree';

interface AddPlaceManagerFormProps {
  place: PlaceTreeNode;
  roles: readonly PlaceManagerRole[];
  /** True while a change to the place is being written. */
  isSaving: boolean;
  /** Looks an account up in the directory and in AccessMapper's roles. */
  lookup: (adAccount: string) => Promise<PlaceManagerPerson>;
  /** Gives the person the place. Resolves to whether it was written. */
  onAdd: (person: PlaceManagerPerson) => Promise<boolean>;
}

type LookupState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'found'; person: PlaceManagerPerson }
  | { status: 'unknown'; adAccount: string }
  | { status: 'failed' };

const addLabel = (place: PlaceTreeNode): string =>
  place.kind === 'unit'
    ? 'Lägg till på enheten'
    : `Lägg till på alla ${countWithNoun(place.unitPaths.length, 'enhet', 'enheter')}`;

/**
 * Gives a person the selected place. The account is looked up first, so that what is added is a person the
 * administrator has seen by name - and seen the role of, since a person without a manager role is not yet a manager.
 */
export const AddPlaceManagerForm: FC<AddPlaceManagerFormProps> = ({ place, roles, isSaving, lookup, onAdd }) => {
  const id = useId();
  const [account, setAccount] = useState('');
  const [state, setState] = useState<LookupState>({ status: 'idle' });

  const search = (event: FormEvent) => {
    event.preventDefault();
    const adAccount = account.trim();
    if (!adAccount) return;
    setState({ status: 'searching' });
    lookup(adAccount).then(
      (person) => setState(person.displayName ? { status: 'found', person } : { status: 'unknown', adAccount }),
      () => setState({ status: 'failed' })
    );
  };

  const add = async (person: PlaceManagerPerson) => {
    if (await onAdd(person)) {
      setAccount('');
      setState({ status: 'idle' });
    }
  };

  const foundRoles = state.status === 'found' ? roles.filter((role) => state.person.roleKeys.includes(role.key)) : [];

  return (
    <div className="flex flex-col gap-16" data-cy="add-place-manager">
      <form className="flex items-end gap-8" onSubmit={search}>
        <FormControl id={`${id}-account`} size="sm" className="grow max-w-[32rem]">
          <FormLabel>Användarnamn</FormLabel>
          <Input
            id={`${id}-account`}
            size="sm"
            value={account}
            placeholder="abc01def"
            autoComplete="off"
            onChange={(event) => {
              setAccount(event.target.value);
              setState({ status: 'idle' });
            }}
            data-cy="add-place-manager-account"
          />
        </FormControl>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={account.trim() === '' || isSaving}
          loading={state.status === 'searching'}
          loadingText="Söker"
          data-cy="add-place-manager-search"
        >
          Sök
        </Button>
      </form>

      {state.status === 'unknown' && (
        <Alert type="warning" data-cy="add-place-manager-unknown">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description>
              Kontot {state.adAccount} finns inte i katalogen. Kontrollera användarnamnet.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}

      {state.status === 'failed' && (
        <Alert type="error" data-cy="add-place-manager-failed">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description>Kontot kunde inte slås upp. Försök igen om en stund.</Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}

      {state.status === 'found' && (
        <div
          className="border-1 rounded-12 bg-background-content p-16 flex flex-col gap-12"
          data-cy="add-place-manager-found"
        >
          <div>
            <span className="font-bold">{state.person.displayName}</span> ({state.person.adAccount})
            <div className="text-small text-dark-secondary">
              {foundRoles.length > 0 ? foundRoles.map((role) => role.label).join(', ') : 'Saknar chefsroll'}
            </div>
          </div>
          {foundRoles.length === 0 && (
            <Alert type="info" data-cy="add-place-manager-without-role">
              <Alert.Icon />
              <Alert.Content>
                <Alert.Content.Description>
                  Personen har ingen chefsroll ännu. Platsen kan läggas till redan nu, men personen blir chef för den
                  först när AD-gruppen för rollen är beställd och på plats.
                </Alert.Content.Description>
              </Alert.Content>
            </Alert>
          )}
          <div>
            <Button
              type="button"
              size="sm"
              variant="primary"
              color="vattjom"
              loading={isSaving}
              loadingText="Lägger till"
              onClick={() => add(state.person)}
              data-cy="add-place-manager-confirm"
            >
              {addLabel(place)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
