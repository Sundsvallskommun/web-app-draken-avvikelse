import {
  AVVIKELSE_LABEL_CLASSIFICATION_CATALOGS,
  type AvvikelseGroupedClassificationSelection,
  getChosenAvvikelseClassificationGroups,
  type LabelClassificationCatalog,
  type LabelClassificationSelection,
} from '@supportmanagement/investigation/avvikelse/label-classification';

import { AVVIKELSE_CLASSIFICATION_POLICY } from '../avvikelse-classification-policy';
import type { AvvikelseGroupedClassificationField } from '../avvikelse-grouped-classification-fields.component';
import { getInvestigationLegalBases } from '../investigation-classification';
import type { InvestigationFormData } from '../investigation-document';

/** The lab's local catalog per group key, standing in for Support Management's label tree. */
const labCatalogsByGroupKey: Readonly<Partial<Record<string, LabelClassificationCatalog>>> =
  AVVIKELSE_LABEL_CLASSIFICATION_CATALOGS;

/** An example classification in every group, so the example forms open with complete selectors. */
export const defaultLabClassificationSelections: AvvikelseGroupedClassificationSelection = Object.freeze({
  HSL: Object.freeze({ typeCode: 'hsl_fall', subtypeCode: 'hsl_fall_vid_forflyttning_med_personal' }),
  SOL_LSS: Object.freeze({
    typeCode: 'sol_lss_brister_arbetssatt_metoder_rutiner',
    subtypeCode: 'sol_lss_brister_arbetssatt_brister_i_rutin',
  }),
});

/**
 * The categorization selectors a form shows: one per group its legal bases reach, by the same rule the
 * errand follows. Undefined for a form that holds no categorization.
 */
export const getLabClassificationFields = (
  schemaName: string,
  formData: InvestigationFormData
): AvvikelseGroupedClassificationField[] | undefined => {
  const { defaultOwnerSchemaName, reportedMisconductOwnerSchemaName, classificationGroups } =
    AVVIKELSE_CLASSIFICATION_POLICY;
  if (schemaName !== defaultOwnerSchemaName && schemaName !== reportedMisconductOwnerSchemaName) return undefined;
  // Both investigations categorize by the legal bases chosen in them: LEX chooses SoL, LSS or both.
  const legalBases = getInvestigationLegalBases(formData);

  return getChosenAvvikelseClassificationGroups(legalBases, classificationGroups).flatMap(({ group, label }) => {
    const catalog = labCatalogsByGroupKey[group.key];
    return catalog ? [{ key: group.key, label, catalog }] : [];
  });
};

const retainSelection = (
  catalog: LabelClassificationCatalog,
  selection: LabelClassificationSelection | undefined
): LabelClassificationSelection => {
  const type = catalog.types.find(({ code }) => code === selection?.typeCode);
  if (!type) return {};
  return {
    typeCode: type.code,
    subtypeCode: type.subtypes.find(({ code }) => code === selection?.subtypeCode)?.code,
  };
};

/**
 * The selections the selectors can still show. A group the legal bases no longer reach loses its
 * selection, the way the errand loses that group's labels, and a code its catalog does not hold is dropped.
 */
export const retainLabClassificationSelections = (
  fields: readonly AvvikelseGroupedClassificationField[],
  selections: AvvikelseGroupedClassificationSelection
): AvvikelseGroupedClassificationSelection =>
  Object.fromEntries(
    fields.flatMap(({ key, catalog }) => {
      const selection = retainSelection(catalog, selections[key]);
      return selection.typeCode ? [[key, selection]] : [];
    })
  );

export const isSameLabClassificationSelections = (
  left: AvvikelseGroupedClassificationSelection,
  right: AvvikelseGroupedClassificationSelection
): boolean =>
  [...new Set([...Object.keys(left), ...Object.keys(right)])].every(
    (groupKey) =>
      left[groupKey]?.typeCode === right[groupKey]?.typeCode &&
      left[groupKey]?.subtypeCode === right[groupKey]?.subtypeCode
  );

/** The group keys the selectors are for, so a change of legal bases can be told from any other edit. */
export const getLabClassificationGroupKeys = (fields: readonly AvvikelseGroupedClassificationField[]): string =>
  fields.map(({ key }) => key).join('|');
