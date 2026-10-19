import {
  getPlacePresentation,
  matchesPlaceSearch,
  placeKey,
  type PlaceNode,
} from '@common/components/json/utils/place-structure';
import { Alert, Button, Combobox, FormControl, FormLabel, Modal, Spinner } from '@sk-web-gui/react';
import { Pen } from 'lucide-react';
import { FC, useMemo, useRef, useState } from 'react';

import type { UnitManagerResponse } from './avvikelse-assignment-service';
import { describePlace } from './errand-location';
import { HandlerCandidateSelect, sortCandidates } from './handler-candidate-select.component';

interface MoveLocationModalProps {
  show: boolean;
  /** Where the labels put the errand today, for the handler to see what they are moving it from. */
  currentPlace: string | undefined;
  /** The places on offer: the units at the bottom of the structure. */
  placeNodes: readonly PlaceNode[];
  loadManagers: (locationLabelId: string) => Promise<UnitManagerResponse>;
  isSaving: boolean;
  error?: string;
  onMove: (locationLabelId: string, adAccount: string) => void;
  onClose: () => void;
}

type ManagersState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: UnitManagerResponse }
  | { status: 'error'; message: string };

/**
 * Moves a wrongly routed errand to the place it concerns.
 *
 * Two choices, in order: the place, searched the way Katla's reporter searched it, and then a manager
 * of that place to take the errand over. The manager comes second because the list depends on the
 * place - it is AccessMapper's answer for that place, fetched once a place is picked. The backend
 * resolves the same list again when it writes and refuses anybody outside it.
 *
 * What is being moved is the errand's location labels, and only those. The reported details in
 * Ärendeuppgifter are left exactly as they arrived; the dialog says so, because a handler who reads
 * a different place there afterwards should know that is by design.
 */
export const MoveLocationModal: FC<MoveLocationModalProps> = ({
  show,
  currentPlace,
  placeNodes,
  loadManagers,
  isSaving,
  error,
  onMove,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string>();
  const [managers, setManagers] = useState<ManagersState>({ status: 'idle' });
  const [chosenManager, setChosenManager] = useState<string>();
  // The managers are AccessMapper's answer for one place. Picking another place before the answer
  // arrives makes the earlier one stale, so each request is numbered and only the latest lands.
  const managerRequest = useRef(0);

  const selectedNode = useMemo(
    () => (selectedKey ? placeNodes.find((node) => placeKey(node) === selectedKey) : undefined),
    [placeNodes, selectedKey]
  );
  const filteredNodes = useMemo(
    () => placeNodes.filter((node) => matchesPlaceSearch(node, search)),
    [placeNodes, search]
  );
  const selectedLabelId = selectedNode?.label.id;

  const selectPlace = (key: string) => {
    const node = placeNodes.find((candidate) => placeKey(candidate) === key);
    if (!node?.label.id) return;

    setSelectedKey(key);
    setChosenManager(undefined);
    const request = ++managerRequest.current;
    setManagers({ status: 'loading' });
    loadManagers(node.label.id)
      .then((response) => {
        if (request === managerRequest.current) setManagers({ status: 'ready', response });
      })
      .catch((e: unknown) => {
        if (request !== managerRequest.current) return;
        const message =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Cheferna för den valda platsen kunde inte hämtas. Försök igen.';
        setManagers({ status: 'error', message });
      });
  };

  const changePlace = () => {
    managerRequest.current += 1;
    setSelectedKey(undefined);
    setSearch('');
    setChosenManager(undefined);
    setManagers({ status: 'idle' });
  };

  const candidates = managers.status === 'ready' ? sortCandidates(managers.response.candidates) : [];
  // A list of one is an answer rather than a question: the first candidate stands as the selection
  // until somebody picks another, and a stale pick from a previous place is dropped.
  const selectedManager =
    chosenManager && candidates.some((candidate) => candidate.adAccount === chosenManager)
      ? chosenManager
      : candidates[0]?.adAccount ?? '';

  return (
    <Modal
      show={show}
      label="Flytta ärendet till annan plats"
      className="w-[52rem]"
      data-cy="move-location-modal"
      onClose={onClose}
    >
      <Modal.Content>
        <p className="mb-8">
          Välj den plats ärendet gäller och en chef där som tar över det. Det är ärendets plats som styr vem som når
          ärendet.
        </p>
        <p className="mb-16 text-small text-text-secondary">
          De uppgifter som rapporterades in ändras inte: Ärendeuppgifter visar även fortsättningsvis den plats
          rapportören angav.
        </p>

        {currentPlace && (
          <p className="mb-16">
            <span className="font-bold">Nuvarande plats:</span>{' '}
            <span data-cy="move-location-current">{currentPlace}</span>
          </p>
        )}

        {!selectedNode ? (
          <FormControl id="move-location-place" className="w-full">
            <FormLabel className="font-bold">Ny plats</FormLabel>
            <Combobox
              className="w-full"
              size="sm"
              value=""
              autofilter={false}
              onChangeSearch={(event) => setSearch(event.target.value)}
              onChange={(event: { target: { value: unknown } }) => selectPlace(String(event.target.value))}
              data-cy="move-location-search"
            >
              <Combobox.Input placeholder="Sök plats" className="w-full" />
              <Combobox.List style={{ maxHeight: '24rem' }}>
                {filteredNodes.map((node) => (
                  <Combobox.Option
                    key={placeKey(node)}
                    value={placeKey(node)}
                    style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                  >
                    {describePlace(getPlacePresentation(node))}
                  </Combobox.Option>
                ))}
              </Combobox.List>
            </Combobox>
            <span className="text-small text-text-secondary mt-4">
              Sök på anläggning, avdelning eller någon överordnad organisationsnivå.
            </span>
          </FormControl>
        ) : (
          <div className="border-1 rounded-12 bg-background-content w-full p-16 mb-16" data-cy="move-location-selected">
            <div className="flex flex-wrap items-start justify-between gap-12">
              <div className="min-w-0">
                <div className="font-bold">Ny plats</div>
                <div className="break-words" data-cy="move-location-selected-name">
                  {describePlace(getPlacePresentation(selectedNode))}
                </div>
              </div>
              <Button
                type="button"
                variant="tertiary"
                color="vattjom"
                size="sm"
                leftIcon={<Pen size={16} aria-hidden="true" />}
                onClick={changePlace}
                disabled={isSaving}
                data-cy="move-location-change"
              >
                Ändra plats
              </Button>
            </div>

            <div className="mt-16">
              {managers.status === 'loading' && (
                <div className="flex items-center gap-12" role="status">
                  <Spinner size={2} />
                  <span>Hämtar chefer för platsen...</span>
                </div>
              )}

              {managers.status === 'error' && (
                <Alert type="error">
                  <Alert.Icon />
                  <Alert.Content>
                    <Alert.Content.Description>{managers.message}</Alert.Content.Description>
                  </Alert.Content>
                </Alert>
              )}

              {managers.status === 'ready' && candidates.length === 0 && (
                <Alert type="warning" data-cy="move-location-no-managers">
                  <Alert.Icon />
                  <Alert.Content>
                    <Alert.Content.Description>
                      Ingen chef är konfigurerad för {managers.response.locationDisplayName}. Välj en annan plats eller
                      kontakta support.
                    </Alert.Content.Description>
                  </Alert.Content>
                </Alert>
              )}

              {managers.status === 'ready' && candidates.length > 0 && (
                <>
                  <FormLabel className="font-bold" htmlFor="move-location-manager">
                    Chef som tar över ärendet
                  </FormLabel>
                  <HandlerCandidateSelect
                    id="move-location-manager"
                    selectLabel="Chef som tar över ärendet"
                    candidates={candidates}
                    roles={managers.response.roles}
                    value={selectedManager}
                    onChange={setChosenManager}
                    dataCy="move-location-manager"
                  />
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <Alert type="error" className="mt-16" data-cy="move-location-error">
            <Alert.Icon />
            <Alert.Content>
              <Alert.Content.Description>{error}</Alert.Content.Description>
            </Alert.Content>
          </Alert>
        )}
      </Modal.Content>
      <Modal.Footer>
        <Button
          variant="primary"
          color="vattjom"
          className="w-full"
          data-cy="move-location-confirm"
          disabled={isSaving || !selectedLabelId || selectedManager === ''}
          loading={isSaving}
          loadingText="Flyttar ärendet"
          onClick={() => selectedLabelId && onMove(selectedLabelId, selectedManager)}
        >
          Flytta ärendet
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
