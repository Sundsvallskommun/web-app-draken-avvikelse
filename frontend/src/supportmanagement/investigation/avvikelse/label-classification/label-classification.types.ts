type LabelClassificationCode = string;

interface LabelClassificationOption {
  readonly code: LabelClassificationCode;
  readonly displayName: string;
}

type LabelClassificationSubtypeOption = LabelClassificationOption;

export interface LabelClassificationTypeOption extends LabelClassificationOption {
  readonly subtypes: readonly LabelClassificationSubtypeOption[];
}

/**
 * One selectable classification group. A SupportManagement metadata adapter can
 * supply the same shape when the local mock catalog is retired.
 */
export interface LabelClassificationCatalog {
  readonly code: LabelClassificationCode;
  readonly displayName: string;
  readonly types: readonly LabelClassificationTypeOption[];
}

/** Shared controlled value for the component, page state and persistence. */
export interface LabelClassificationSelection {
  readonly typeCode?: LabelClassificationCode;
  readonly subtypeCode?: LabelClassificationCode;
}
