export { AVVIKELSE_LABEL_CLASSIFICATION_CATALOGS } from './avvikelse-label-classification.mock';
export type {
  AvvikelseClassificationGroup,
  AvvikelseGroupedClassificationModel,
  AvvikelseGroupedClassificationSelection,
  AvvikelseGroupedClassificationUpdate,
  LabelClassificationLegalBaseRule,
  MissingAvvikelseGroupedClassificationChoice,
} from './avvikelse-supportmanagement-label-classification';
export {
  applyAvvikelseGroupedClassificationSelection,
  createAvvikelseGroupedClassificationModel,
  getAvvikelseGroupedClassificationSelection,
  getChosenAvvikelseClassificationGroups,
  getMissingAvvikelseGroupedClassificationChoices,
  getPersistedAvvikelseGroupedClassificationState,
} from './avvikelse-supportmanagement-label-classification';
export { LabelClassification } from './label-classification.component';
export type { LabelClassificationCatalog, LabelClassificationSelection } from './label-classification.types';
