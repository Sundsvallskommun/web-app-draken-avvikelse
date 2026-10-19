'use client';

import {
  findPlaceEmploymentMatch,
  findPlaceNode,
  findPlaceNodeByKey,
  getEmploymentPrefillNode,
  getFacilityPlaceInfo,
  getParentPlaceNode,
  getPlaceNodes,
  getPlacePresentation,
  getSubPlaceNodes,
  hasSubPlaces,
  isSameLabel,
  matchesPlaceSearch,
  type PlaceEmploymentMatch,
  placeKey,
  placeName,
  type PlaceNode,
} from '@common/components/json/utils/place-structure';
import { getUserEmployments, OrgManagerDTO } from '@common/services/employee-service';
import { ariaDescribedByIds, type FieldProps } from '@rjsf/utils';
import { Button, Combobox, FormControl, FormLabel, RadioButton } from '@sk-web-gui/react';
import { useMetadataStore } from '@stores/metadata-store';
import { Pen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Fler underenheter än så blir en ohanterlig radioknappsgrupp — då används sökning istället */
const MAX_RADIO_SUB_PLACES = 6;

/**
 * Platsvalet delas med web-app-katla-sm och måste skrivas likadant där: `orgName` är den valda noden i
 * platsstrukturen och `parentOrgName` dess förälder. `orgId` och `manager` finns bara när valet ligger
 * inom användarens egen anställning, eftersom labelstrukturen i sig inte bär organisationsdata.
 */
interface FacilityInfo {
  orgId?: number;
  orgName?: string;
  parentOrgName?: string;
  manager?: OrgManagerDTO;
}

export function FacilitySearchField(props: FieldProps) {
  const { idSchema, formData, disabled, readonly, required, rawErrors, onBlur, onChange, onFocus, uiSchema } = props;
  const id = idSchema.$id;
  const searchLabelId = `${id}__search-label`;
  const subPlaceLabelId = `${id}__sub-place-label`;
  const describedBy = ariaDescribedByIds(id);
  const invalid = Boolean(rawErrors?.length);

  const uiOptions = (uiSchema?.['ui:options'] || {}) as Record<string, unknown>;
  const className = (uiOptions.className as string) || 'w-full';

  const facilityInfo = formData as FacilityInfo | undefined;
  const { orgName, parentOrgName } = facilityInfo ?? {};
  const latestFacilityInfoRef = useRef(facilityInfo);
  const mountedRef = useRef(false);

  useEffect(() => {
    latestFacilityInfoRef.current = facilityInfo;
  }, [facilityInfo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Platsvalet styrs av labelstrukturen, inte av organisationsträdet: strukturen är det som
  // rättighetsstyr ärendet i Support Management, och den är också det enda som kan avgöra vilket av de
  // sparade namnen som är anläggning respektive avdelning.
  const supportMetadata = useMetadataStore((state) => state.supportMetadata);
  const placeNodes = useMemo(
    () => getPlaceNodes(supportMetadata?.labels?.labelStructure),
    [supportMetadata?.labels?.labelStructure]
  );
  const selectablePlaceNodes = useMemo(() => placeNodes.filter((node) => !hasSubPlaces(node)), [placeNodes]);

  const [placeSearchValue, setPlaceSearchValue] = useState('');
  const employmentMatchRef = useRef<PlaceEmploymentMatch<OrgManagerDTO> | undefined>(undefined);
  const prefillDoneRef = useRef(false);

  const isEditable = !disabled && !readonly;

  const selectedNode = useMemo(
    () => findPlaceNode(placeNodes, orgName, parentOrgName),
    [placeNodes, orgName, parentOrgName]
  );
  const selectedPlacePresentation = useMemo(() => {
    if (selectedNode) return getPlacePresentation(selectedNode);
    if (!orgName) return undefined;

    // Utan träff i strukturen går nivåerna inte att avgöra. Namnen visas då kvalificerade med föräldern
    // i stället för att en gissad avdelning presenteras som fakta.
    return {
      place: parentOrgName ? `${parentOrgName} ${orgName}` : orgName,
      department: undefined,
    };
  }, [orgName, parentOrgName, selectedNode]);

  const filteredSelectablePlaceNodes = useMemo(
    () => selectablePlaceNodes.filter((node) => matchesPlaceSearch(node, placeSearchValue)),
    [placeSearchValue, selectablePlaceNodes]
  );
  const subPlaceParentNode = useMemo(() => {
    if (!selectedNode) return undefined;
    if (hasSubPlaces(selectedNode)) return selectedNode;
    return selectedPlacePresentation?.department ? getParentPlaceNode(placeNodes, selectedNode) : undefined;
  }, [placeNodes, selectedNode, selectedPlacePresentation?.department]);
  const subPlaceNodes = useMemo(
    () => (subPlaceParentNode ? getSubPlaceNodes(placeNodes, subPlaceParentNode) : []),
    [placeNodes, subPlaceParentNode]
  );
  const mustChooseSubPlace = Boolean(selectedNode && hasSubPlaces(selectedNode));
  const showSubPlaceChoice =
    mustChooseSubPlace || Boolean(selectedPlacePresentation?.department && subPlaceNodes.length > 1);
  const selectedSubPlaceKey = useMemo(
    () =>
      selectedNode && subPlaceNodes.some((node) => isSameLabel(node.label, selectedNode.label))
        ? placeKey(selectedNode)
        : '',
    [selectedNode, subPlaceNodes]
  );

  const selectPlace = useCallback(
    (node: PlaceNode) => {
      onChange(getFacilityPlaceInfo(node, employmentMatchRef.current));
    },
    [onChange]
  );

  // Förpopulera från användarens anställning. Anställningen används bara för att hitta rätt nod i
  // labelstrukturen — har noden underenheter måste användaren själv välja en av dem.
  useEffect(() => {
    if (!isEditable || prefillDoneRef.current || placeNodes.length === 0) return;
    prefillDoneRef.current = true;

    const loadEmploymentMatch = async () => {
      try {
        const employments = await getUserEmployments();
        if (!mountedRef.current) return;
        const currentFacility = latestFacilityInfoRef.current;
        const currentNode = findPlaceNode(placeNodes, currentFacility?.orgName, currentFacility?.parentOrgName);
        const match = findPlaceEmploymentMatch<OrgManagerDTO>(placeNodes, employments, currentNode);
        if (!match) return;

        // Load the match even for persisted facilities. A later place change can then retain the
        // manager for a node in the employment branch without replacing the saved selection now.
        employmentMatchRef.current = match;
        // A node with sub-places is not a complete place, so it is never written to the form for the
        // user; the match is still kept so a chosen department inherits the employment metadata.
        const prefillNode = getEmploymentPrefillNode(match, currentFacility?.orgName);
        if (prefillNode && !hasSubPlaces(prefillNode)) selectPlace(prefillNode);
      } catch (error) {
        console.error('Failed to load employments:', error);
      }
    };

    void loadEmploymentMatch();
  }, [isEditable, placeNodes, orgName, selectPlace, selectedNode]);

  const handleSelectPlace = useCallback(
    (key: string) => {
      const node = findPlaceNodeByKey(placeNodes, key);
      if (node) {
        selectPlace(node);
      }
    },
    [placeNodes, selectPlace]
  );

  const handleChangePlace = useCallback(() => {
    onChange(undefined);
    setPlaceSearchValue('');
  }, [onChange]);

  const sectionTitle = <h2 className="text-xl font-bold mb-6">Mer information om platsen</h2>;

  // The place structure is part of Support Management's metadata; until it has loaded there is nothing to pick from.
  if (!supportMetadata && !selectedPlacePresentation) {
    return (
      <div className={className}>
        {sectionTitle}
        <p className="text-text-secondary">Laddar...</p>
      </div>
    );
  }

  if (placeNodes.length === 0 && !selectedPlacePresentation) {
    return (
      <div className={className}>
        {sectionTitle}
        <p className="text-text-secondary" data-cy="facility-structure-missing">
          Platsstrukturen är inte tillgänglig i den här applikationen.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {sectionTitle}

      {!selectedPlacePresentation && isEditable && (
        <FormControl disabled={!isEditable} invalid={invalid} required={required} className="w-full">
          <FormLabel id={searchLabelId} htmlFor={id} className="font-bold">
            Lägg till plats där händelsen inträffade
          </FormLabel>
          <Combobox
            id={`${id}__combobox`}
            className="w-full"
            size="lg"
            value=""
            autofilter={false}
            aria-labelledby={searchLabelId}
            aria-describedby={describedBy}
            onChangeSearch={(e) => setPlaceSearchValue(e.target.value)}
            onChange={(e: { target: { value: unknown } }) => handleSelectPlace(String(e.target.value))}
            data-cy="facility-search"
          >
            <Combobox.Input
              id={id}
              placeholder="Sök plats"
              className="w-full"
              disabled={!isEditable}
              required={required}
              aria-labelledby={searchLabelId}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onBlur={() => onBlur(id, formData)}
              onFocus={() => onFocus(id, formData)}
            />
            <Combobox.List style={{ maxHeight: '32rem' }}>
              {filteredSelectablePlaceNodes.map((node) => {
                const presentation = getPlacePresentation(node);
                const optionText = presentation.department
                  ? `${presentation.place} — Avdelning: ${presentation.department}`
                  : presentation.place;

                return (
                  <Combobox.Option
                    key={placeKey(node)}
                    value={placeKey(node)}
                    style={{
                      alignItems: 'flex-start',
                      lineHeight: 1.4,
                      overflowWrap: 'anywhere',
                      paddingBlock: '0.75rem',
                      whiteSpace: 'normal',
                    }}
                  >
                    {optionText}
                  </Combobox.Option>
                );
              })}
            </Combobox.List>
          </Combobox>
          <span className="text-small text-text-secondary mt-4">
            Sök på anläggning, avdelning eller någon överordnad organisationsnivå.
          </span>
        </FormControl>
      )}

      {selectedPlacePresentation && (
        <div className="border-1 rounded-12 bg-background-content w-full mt-16" data-cy="facility-card">
          <div className="rounded-t-12 bg-vattjom-background-200 px-16 py-12">
            <strong>Plats där händelsen inträffade</strong>
          </div>
          <div className="p-16">
            <div className="flex flex-col gap-16">
              <div className="min-w-0">
                <p className="text-[1.6rem] font-semibold break-words" data-cy="facility-name">
                  {selectedPlacePresentation.place}
                </p>
                {selectedPlacePresentation.department && (
                  <p className="text-small text-text-secondary break-words" data-cy="facility-department">
                    <span className="font-semibold">Avdelning:</span> {selectedPlacePresentation.department}
                  </p>
                )}
              </div>

              {isEditable && showSubPlaceChoice && subPlaceParentNode && selectedNode ? (
                <FormControl disabled={!isEditable} required={mustChooseSubPlace} className="w-full">
                  <FormLabel id={subPlaceLabelId} className="font-bold">
                    Välj enhet inom {placeName(subPlaceParentNode)}
                  </FormLabel>
                  {subPlaceNodes.length <= MAX_RADIO_SUB_PLACES ? (
                    <RadioButton.Group aria-labelledby={subPlaceLabelId} data-cy="facility-sub-place-options">
                      {subPlaceNodes.map((node) => (
                        <RadioButton
                          key={placeKey(node)}
                          name="facility-sub-place"
                          value={placeKey(node)}
                          checked={isSameLabel(node.label, selectedNode.label)}
                          disabled={!isEditable}
                          onChange={(e) => handleSelectPlace(e.target.value)}
                        >
                          {placeName(node)}
                        </RadioButton>
                      ))}
                    </RadioButton.Group>
                  ) : (
                    <Combobox
                      className="w-full"
                      value={selectedSubPlaceKey}
                      aria-labelledby={subPlaceLabelId}
                      onChange={(e: { target: { value: unknown } }) => handleSelectPlace(String(e.target.value))}
                      data-cy="facility-sub-place-options"
                    >
                      <Combobox.Input
                        id={`${id}__sub-place`}
                        placeholder="Sök plats"
                        className="w-full"
                        aria-labelledby={subPlaceLabelId}
                      />
                      <Combobox.List style={{ maxHeight: '32rem' }}>
                        {subPlaceNodes.map((node) => (
                          <Combobox.Option
                            key={placeKey(node)}
                            value={placeKey(node)}
                            style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}
                          >
                            {placeName(node)}
                          </Combobox.Option>
                        ))}
                      </Combobox.List>
                    </Combobox>
                  )}
                  {mustChooseSubPlace && (
                    <span className="text-small mt-4" data-cy="facility-sub-place-required">
                      Du behöver välja en enhet för att platsen ska bli komplett.
                    </span>
                  )}
                </FormControl>
              ) : null}

              {isEditable && placeNodes.length > 0 && (
                <div className="flex flex-wrap border-t-1 border-divider pt-12">
                  <Button
                    type="button"
                    variant="tertiary"
                    color="vattjom"
                    size="sm"
                    leftIcon={<Pen size={16} aria-hidden="true" />}
                    onClick={handleChangePlace}
                    data-cy="facility-change-button"
                  >
                    Ändra plats
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
