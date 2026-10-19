'use client';

import { useToastMessages } from '@common/hooks/use-toast-messages';
import { countWithNoun } from '@common/utils/count-with-noun';
import { Alert, Checkbox, SearchField, Spinner, useConfirm } from '@sk-web-gui/react';
import { useConfigStore, useMetadataStore } from '@stores/index';
import { FC, useEffect, useMemo, useState } from 'react';

import { PlaceManagerPanel } from './place-manager-panel.component';
import { type PlaceManagerRow, toPlaceManagerRows } from './place-manager-rows';
import {
  changePlaceManagerPlaces,
  getPlaceManagerAssignments,
  lookupPlaceManagerPeople,
  type PlaceManagerAssignment,
  placeManagerErrorMessage,
  type PlaceManagerPerson,
  type PlaceManagerPlaceChange,
  type PlaceManagerRole,
} from './place-manager-service';
import {
  areaIdsOf,
  buildPlaceTree,
  countPlaceHolders,
  countUnitsWithoutHolder,
  filterPlaceTree,
  findPlaceTreeNode,
  holdersOfPlace,
  isPlaceTreeFiltered,
  type PlaceTreeFilter,
  type PlaceTreeNode,
  withChangedAssignment,
} from './place-manager-tree';
import { PlaceTree } from './place-tree.component';
import { usePlaceManagerPeople } from './use-place-manager-people';

type LoadState =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; assignments: PlaceManagerAssignment[]; roles: PlaceManagerRole[] };

const NO_FILTER: PlaceTreeFilter = { query: '', onlyWithoutHolder: false };
const NO_ASSIGNMENTS: readonly PlaceManagerAssignment[] = [];
const NO_ROLES: readonly PlaceManagerRole[] = [];

const describeUnits = (place: PlaceTreeNode): string =>
  place.kind === 'unit'
    ? place.name
    : `alla ${countWithNoun(place.unitPaths.length, 'enhet', 'enheter')} under ${place.name}`;

/**
 * Chefer per plats: which places each manager has, set by the administrators. Only the places are set here - they
 * are label patterns on the person in AccessMapper. That the person is a manager at all is a role that comes with
 * an AD group ordered elsewhere, so the view shows the role and says when a person with a place lacks it.
 */
export const PlaceManagers: FC = () => {
  const municipalityId = useConfigStore((state) => state.municipalityId);
  const labelStructure = useMetadataStore((state) => state.supportMetadata?.labels?.labelStructure);
  const confirm = useConfirm();
  const { showSuccess, showError } = useToastMessages();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<PlaceTreeFilter>(NO_FILTER);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selectedLabelId, setSelectedLabelId] = useState<string>();
  const [savingAccount, setSavingAccount] = useState<string>();

  useEffect(() => {
    if (!municipalityId) return;
    let current = true;
    getPlaceManagerAssignments(municipalityId).then(
      ({ assignments, roles }) => current && setState({ status: 'ready', assignments, roles }),
      (cause: unknown) =>
        current &&
        setState({
          status: 'failed',
          message: placeManagerErrorMessage(cause, 'Cheferna kunde inte hämtas. Försök igen om en stund.'),
        })
    );
    return () => {
      current = false;
    };
  }, [municipalityId]);

  const assignments = state.status === 'ready' ? state.assignments : NO_ASSIGNMENTS;
  const roles = state.status === 'ready' ? state.roles : NO_ROLES;
  const tree = useMemo(() => buildPlaceTree(labelStructure), [labelStructure]);
  const holderCounts = useMemo(() => countPlaceHolders(assignments), [assignments]);
  const shownTree = useMemo(() => filterPlaceTree(tree, filter, holderCounts), [tree, filter, holderCounts]);
  const selected = useMemo(() => findPlaceTreeNode(tree, selectedLabelId), [tree, selectedLabelId]);
  const holders = useMemo(() => (selected ? holdersOfPlace(selected, assignments) : []), [selected, assignments]);
  const shownAccounts = useMemo(() => holders.map((holder) => holder.adAccount), [holders]);
  const { people, failed: peopleFailed, remember } = usePlaceManagerPeople(municipalityId, shownAccounts);
  const rows = useMemo(
    () => (selected ? toPlaceManagerRows(selected, holders, people, roles) : []),
    [selected, holders, people, roles]
  );
  const unitCount = tree.reduce((count, node) => count + node.unitPaths.length, 0);
  const unitsWithoutHolder = tree.reduce((count, node) => count + countUnitsWithoutHolder(node, holderCounts), 0);

  // A filter narrows the tree to what it found, so what it found is shown opened.
  const changeFilter = (next: PlaceTreeFilter) => {
    setFilter(next);
    if (isPlaceTreeFiltered(next)) setExpanded(new Set(areaIdsOf(filterPlaceTree(tree, next, holderCounts))));
  };

  const toggle = (labelId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(labelId)) next.add(labelId);
      return next;
    });

  const change = async (adAccount: string, placeChange: PlaceManagerPlaceChange, done: string): Promise<boolean> => {
    if (!municipalityId) return false;
    setSavingAccount(adAccount);
    try {
      const changed = await changePlaceManagerPlaces(municipalityId, adAccount, placeChange);
      setState((current) =>
        current.status === 'ready'
          ? { ...current, assignments: withChangedAssignment(current.assignments, changed) }
          : current
      );
      showSuccess(done);
      return true;
    } catch (cause) {
      showError(placeManagerErrorMessage(cause, 'Ändringen kunde inte sparas. Försök igen.'));
      return false;
    } finally {
      setSavingAccount(undefined);
    }
  };

  const lookup = async (adAccount: string): Promise<PlaceManagerPerson> => {
    const [person] = await lookupPlaceManagerPeople(municipalityId, [adAccount]);
    if (person.displayName) remember([person]);
    return person;
  };

  const add = (place: PlaceTreeNode, person: PlaceManagerPerson): Promise<boolean> =>
    change(
      person.adAccount,
      { add: [place.labelId] },
      `${person.displayName ?? person.adAccount} har fått ${describeUnits(place)}.`
    );

  const remove = async (place: PlaceTreeNode, row: PlaceManagerRow) => {
    const confirmed = await confirm.showConfirmation(
      'Ta bort plats',
      `Vill du ta bort ${row.name} från ${describeUnits(place)}?`,
      'Ja',
      'Nej',
      'info',
      'info'
    );
    if (confirmed) {
      await change(row.adAccount, { remove: [place.labelId] }, `${row.name} har inte längre ${describeUnits(place)}.`);
    }
  };

  return (
    <main className="pl-40 pb-40 w-full">
      <div className="container mx-auto p-0 w-full">
        <div
          className="mt-32 flex flex-col gap-24"
          role="region"
          aria-label="Chefer per plats"
          data-cy="place-managers"
        >
          <div className="flex flex-col gap-8 max-w-[80rem]">
            <h1 className="p-0 m-0">Chefer per plats</h1>
            <p className="m-0">
              Här sätter du vilka platser en chef har. En verksamhetschef får alla enheter under ett område, en
              enhetschef får sin enhet.
            </p>
            <p className="m-0 text-dark-secondary text-small">
              Rollen som enhetschef eller verksamhetschef följer med AD-gruppen och beställs för sig. En person som har
              en plats men saknar rollen är inte chef för platsen än.
            </p>
          </div>

          {state.status === 'loading' && (
            <div className="flex items-center gap-12 py-32" role="status">
              <Spinner size={3} />
              <span>Hämtar chefer per plats...</span>
            </div>
          )}

          {state.status === 'failed' && (
            <Alert type="error" data-cy="place-managers-error">
              <Alert.Icon />
              <Alert.Content>
                <Alert.Content.Description>{state.message}</Alert.Content.Description>
              </Alert.Content>
            </Alert>
          )}

          {state.status === 'ready' && tree.length === 0 && (
            <Alert type="warning" data-cy="place-managers-without-structure">
              <Alert.Icon />
              <Alert.Content>
                <Alert.Content.Description>Det finns ingen platsstruktur att sätta chefer i.</Alert.Content.Description>
              </Alert.Content>
            </Alert>
          )}

          {state.status === 'ready' && tree.length > 0 && (
            <div className="flex flex-col xl:flex-row gap-32 items-start">
              <section className="w-full xl:w-[36rem] shrink-0 flex flex-col gap-16" aria-label="Platser">
                <SearchField
                  value={filter.query}
                  size="md"
                  placeholder="Sök plats"
                  showSearchButton={false}
                  onChange={(event) => changeFilter({ ...filter, query: event.target.value })}
                  onReset={() => changeFilter({ ...filter, query: '' })}
                  data-cy="place-managers-search"
                />
                <Checkbox
                  checked={filter.onlyWithoutHolder}
                  onChange={(event) => changeFilter({ ...filter, onlyWithoutHolder: event.target.checked })}
                  data-cy="place-managers-only-without-holder"
                >
                  Visa bara enheter utan person
                </Checkbox>
                <p className="m-0 text-small text-dark-secondary" role="status" data-cy="place-managers-summary">
                  {unitsWithoutHolder} av {countWithNoun(unitCount, 'enhet', 'enheter')} saknar person.
                </p>
                {shownTree.length > 0 ? (
                  <PlaceTree
                    label="Platser"
                    nodes={shownTree}
                    holderCounts={holderCounts}
                    expanded={expanded}
                    selectedLabelId={selectedLabelId}
                    onToggle={toggle}
                    onSelect={setSelectedLabelId}
                  />
                ) : (
                  <p className="m-0" data-cy="place-managers-no-match">
                    Ingen plats matchar sökningen.
                  </p>
                )}
              </section>

              <section className="grow min-w-0 w-full" aria-label="Chefer för vald plats">
                {selected ? (
                  <PlaceManagerPanel
                    place={selected}
                    rows={rows}
                    roles={roles}
                    unitsWithoutHolder={countUnitsWithoutHolder(selected, holderCounts)}
                    peopleFailed={peopleFailed}
                    savingAccount={savingAccount}
                    lookup={lookup}
                    onAdd={(person) => add(selected, person)}
                    onRemove={(row) => remove(selected, row)}
                  />
                ) : (
                  <p className="m-0 text-dark-secondary" data-cy="place-managers-hint">
                    Välj en plats för att se vilka som har den.
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};
