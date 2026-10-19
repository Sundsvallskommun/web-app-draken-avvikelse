import { countWithNoun } from '@common/utils/count-with-noun';
import { Alert, Button, Label, Spinner, Table } from '@sk-web-gui/react';
import { FC } from 'react';

import { AddPlaceManagerForm } from './add-place-manager-form.component';
import type { PlaceManagerRow } from './place-manager-rows';
import type { PlaceManagerPerson, PlaceManagerRole } from './place-manager-service';
import type { PlaceTreeNode } from './place-manager-tree';

interface PlaceManagerPanelProps {
  place: PlaceTreeNode;
  rows: readonly PlaceManagerRow[];
  roles: readonly PlaceManagerRole[];
  /** How many of the place's units nobody holds. */
  unitsWithoutHolder: number;
  /** True when names and roles could not be read; the accounts are then all there is to show. */
  peopleFailed: boolean;
  /** The account a change is being written for, if any. */
  savingAccount: string | undefined;
  lookup: (adAccount: string) => Promise<PlaceManagerPerson>;
  onAdd: (person: PlaceManagerPerson) => Promise<boolean>;
  onRemove: (row: PlaceManagerRow) => void;
}

/** The person's manager role, said beneath the name: it is what makes somebody with the place a manager there. */
const PersonRole: FC<{ row: PlaceManagerRow; peopleFailed: boolean }> = ({ row, peopleFailed }) => {
  if (!row.roleLabels) return peopleFailed ? null : <Spinner size={2} aria-label="Hämtar rollen" />;
  if (row.roleLabels.length === 0) {
    return (
      <Label rounded inverted color="warning" className="w-fit">
        Saknar chefsroll
      </Label>
    );
  }
  return <span>{row.roleLabels.join(', ')}</span>;
};

const describePlace = (place: PlaceTreeNode): string =>
  place.kind === 'unit' ? 'Enhet' : `Område med ${countWithNoun(place.unitPaths.length, 'enhet', 'enheter')}`;

const withoutHolderMessage = (place: PlaceTreeNode, unitsWithoutHolder: number): string =>
  place.kind === 'unit'
    ? 'Ingen person har enheten. Ett ärende på enheten har då ingen chef att lämnas till.'
    : `${countWithNoun(unitsWithoutHolder, 'enhet', 'enheter')} under ${place.name} har ingen person.`;

/**
 * The people on the selected place, and the controls that give the place to a person or take it away. On an area a
 * change means every unit beneath it.
 */
export const PlaceManagerPanel: FC<PlaceManagerPanelProps> = ({
  place,
  rows,
  roles,
  unitsWithoutHolder,
  peopleFailed,
  savingAccount,
  lookup,
  onAdd,
  onRemove,
}) => (
  <div className="flex flex-col gap-24" data-cy="place-manager-panel">
    <div className="flex flex-col gap-4">
      {place.ancestors.length > 0 && (
        <span className="text-small text-dark-secondary" data-cy="place-manager-breadcrumb">
          {place.ancestors.map((level) => level.name).join(' / ')}
        </span>
      )}
      <h2 className="m-0 text-h3-md" data-cy="place-manager-place">
        {place.name}
      </h2>
      <span className="text-small text-dark-secondary">{describePlace(place)}</span>
    </div>

    {unitsWithoutHolder > 0 && (
      <Alert type="warning" data-cy="place-manager-without-holder">
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Description>{withoutHolderMessage(place, unitsWithoutHolder)}</Alert.Content.Description>
        </Alert.Content>
      </Alert>
    )}

    {peopleFailed && (
      <Alert type="error" data-cy="place-manager-people-failed">
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Description>
            Namn och roller kunde inte hämtas, så personerna visas med användarnamn.
          </Alert.Content.Description>
        </Alert.Content>
      </Alert>
    )}

    {rows.length > 0 && (
      <Table data-cy="place-manager-table" scrollable>
        <Table.Header>
          <Table.HeaderColumn>Person och roll</Table.HeaderColumn>
          <Table.HeaderColumn>Omfattning</Table.HeaderColumn>
          <Table.HeaderColumn>
            <span className="sr-only">Ändra</span>
          </Table.HeaderColumn>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => {
            const isSaving = savingAccount === row.adAccount;
            return (
              <Table.Row key={row.adAccount} data-cy={`place-manager-row-${row.adAccount.toLowerCase()}`}>
                <Table.Column>
                  <div className="flex flex-col gap-2 whitespace-nowrap">
                    <span className="font-bold">{row.name}</span>
                    {row.name !== row.adAccount && (
                      <span className="text-small text-dark-secondary">{row.adAccount}</span>
                    )}
                    <PersonRole row={row} peopleFailed={peopleFailed} />
                  </div>
                </Table.Column>
                <Table.Column>
                  <div className="flex flex-col whitespace-nowrap">
                    <span>{row.extent}</span>
                    <span className="text-small text-dark-secondary">{row.originLabel}</span>
                  </div>
                </Table.Column>
                <Table.Column>
                  <div className="flex justify-end whitespace-nowrap">
                    {row.removable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        color="error"
                        disabled={savingAccount !== undefined}
                        loading={isSaving}
                        aria-label={`Ta bort ${row.name} från ${place.name}`}
                        onClick={() => onRemove(row)}
                        data-cy="place-manager-remove"
                      >
                        Ta bort
                      </Button>
                    )}
                  </div>
                </Table.Column>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
    )}

    <div className="flex flex-col gap-12">
      <h3 className="m-0 text-h4-md">Lägg till person</h3>
      {/* A new place starts a new search: the person found was found for the place that was shown. */}
      <AddPlaceManagerForm
        key={place.labelId}
        place={place}
        roles={roles}
        isSaving={savingAccount !== undefined}
        lookup={lookup}
        onAdd={onAdd}
      />
    </div>
  </div>
);
