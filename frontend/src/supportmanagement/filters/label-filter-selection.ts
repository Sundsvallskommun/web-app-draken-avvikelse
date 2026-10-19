import type { LabelFilterChoice, LabelFilterGroupProjection, LabelFilterSelection } from './label-filter-projector';

const identityKey = ({ groupKey, fieldKey, resourcePath }: LabelFilterSelection): string =>
  JSON.stringify([groupKey, fieldKey, resourcePath]);

const allChoices = (projections: readonly LabelFilterGroupProjection[]): readonly LabelFilterChoice[] =>
  projections.flatMap((group) => group.fields.flatMap((field) => field.choices));

const selectionFromChoice = ({ groupKey, fieldKey, resourcePath }: LabelFilterChoice): LabelFilterSelection =>
  Object.freeze({ groupKey, fieldKey, resourcePath });

/**
 * Drops stale and duplicate values and orders the remainder by profile group,
 * field and metadata order. Click order therefore never leaks into persistence.
 */
export const normalizeLabelFilterSelections = (
  projections: readonly LabelFilterGroupProjection[],
  selections: readonly LabelFilterSelection[]
): readonly LabelFilterSelection[] => {
  const requestedKeys = new Set(selections.map(identityKey));
  return Object.freeze(
    allChoices(projections)
      .filter((choice) => requestedKeys.has(identityKey(choice)))
      .map(selectionFromChoice)
  );
};

const selectedPathsByField = (
  selections: readonly LabelFilterSelection[]
): ReadonlyMap<string, ReadonlySet<string>> => {
  const pathsByField = new Map<string, Set<string>>();
  for (const selection of selections) {
    const fieldIdentity = JSON.stringify([selection.groupKey, selection.fieldKey]);
    const paths = pathsByField.get(fieldIdentity) ?? new Set<string>();
    paths.add(selection.resourcePath);
    pathsByField.set(fieldIdentity, paths);
  }
  return pathsByField;
};

const choiceIsReachable = (
  choice: LabelFilterChoice,
  pathsByField: ReadonlyMap<string, ReadonlySet<string>>
): boolean =>
  choice.ancestors.every((ancestor) => {
    const selectedAncestorPaths = pathsByField.get(JSON.stringify([ancestor.groupKey, ancestor.fieldKey]));
    return !selectedAncestorPaths?.size || selectedAncestorPaths.has(ancestor.resourcePath);
  });

/**
 * Returns a field's choices after applying selected ancestors in the same
 * group. With no selection in an ancestor field all of that field's branches
 * remain visible.
 */
export const getVisibleLabelFilterChoices = (
  projections: readonly LabelFilterGroupProjection[],
  groupKey: string,
  fieldKey: string,
  selections: readonly LabelFilterSelection[]
): readonly LabelFilterChoice[] => {
  const group = projections.find(({ key }) => key === groupKey);
  const field = group?.fields.find(({ key }) => key === fieldKey);
  if (!group || !field) throw new Error(`Unknown label filter field ${groupKey}.${fieldKey}`);

  const normalizedSelections = normalizeLabelFilterSelections(projections, selections);
  const pathsByField = selectedPathsByField(normalizedSelections);
  return Object.freeze(field.choices.filter((choice) => choiceIsReachable(choice, pathsByField)));
};

export const isLabelFilterChoiceSelected = (
  choice: LabelFilterChoice,
  selections: readonly LabelFilterSelection[]
): boolean => selections.some((selection) => identityKey(selection) === identityKey(choice));

/**
 * Controlled selection reducer. Removing a choice also removes every selected
 * descendant that names it as an ancestor. Adding a parent prunes selected
 * descendants from branches that the new parent selection makes unreachable.
 */
export const reduceLabelFilterSelection = (
  projections: readonly LabelFilterGroupProjection[],
  selections: readonly LabelFilterSelection[],
  target: LabelFilterSelection,
  selected: boolean
): readonly LabelFilterSelection[] => {
  const choices = allChoices(projections);
  const targetChoice = choices.find((choice) => identityKey(choice) === identityKey(target));
  if (!targetChoice) {
    throw new Error(`Unknown label filter choice ${target.groupKey}.${target.fieldKey}:${target.resourcePath}`);
  }

  const normalizedSelections = normalizeLabelFilterSelections(projections, selections);
  const targetKey = identityKey(targetChoice);

  if (!selected) {
    const removedKeys = new Set(
      choices
        .filter(
          (choice) =>
            identityKey(choice) === targetKey ||
            choice.ancestors.some((ancestor) => identityKey(ancestor) === targetKey)
        )
        .map(identityKey)
    );
    return normalizeLabelFilterSelections(
      projections,
      normalizedSelections.filter((selection) => !removedKeys.has(identityKey(selection)))
    );
  }

  const withTarget = normalizeLabelFilterSelections(projections, [...normalizedSelections, targetChoice]);
  const pathsByField = selectedPathsByField(withTarget);
  const reachableSelectionKeys = new Set(
    choices.filter((choice) => choiceIsReachable(choice, pathsByField)).map(identityKey)
  );

  return normalizeLabelFilterSelections(
    projections,
    withTarget.filter((selection) => reachableSelectionKeys.has(identityKey(selection)))
  );
};
