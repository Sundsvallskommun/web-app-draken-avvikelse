import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import type { AxiosError } from 'axios';

import type {
  AvvikelseClassificationLabelTree,
  AvvikelseClassificationLegalBaseRule,
} from './avvikelse-classification-policy';
import type { InvestigationDocumentKey, InvestigationFormData } from './investigation-document';
import {
  applyAvvikelseGroupedClassificationSelection,
  type AvvikelseClassificationGroup,
  type AvvikelseGroupedClassificationModel,
  type AvvikelseGroupedClassificationUpdate,
  createAvvikelseGroupedClassificationModel,
  getAvvikelseGroupedClassificationSelection,
  getPersistedAvvikelseGroupedClassificationState,
} from './label-classification';
import {
  buildSupportInvestigationClassificationRequest,
  isSupportInvestigationClassificationConflict,
  saveSupportInvestigationClassification,
  type SupportInvestigationClassificationResponse,
} from './support-investigation-classification-service';
import {
  isSupportInvestigationAccessDenied,
  isSupportInvestigationConflict,
  type SavedSupportInvestigationDocument,
  saveSupportInvestigationDocument,
} from './support-investigation-service';

export interface InvestigationClassificationDraft {
  readonly labels: Label[];
  readonly category: string;
  readonly type: string;
  readonly subType: string;
  readonly classificationHasSubTypes: boolean;
}

export interface PreparedInvestigationClassification {
  readonly model: AvvikelseGroupedClassificationModel;
  readonly update: AvvikelseGroupedClassificationUpdate;
}

interface PrepareClassificationInput {
  readonly required: boolean;
  /**
   * Whether this save marks the investigation finished. The errand's classification is what the
   * finished investigation is filed under, so it is demanded then - not on every draft in between,
   * the same way the schema asks nothing of a half-written document.
   */
  readonly completed: boolean;
  readonly canEditClassification: boolean;
  readonly dirty: boolean;
  readonly labelTree?: AvvikelseClassificationLabelTree;
  readonly labelStructure: readonly Label[] | undefined;
  readonly legalBases: readonly string[];
  readonly legalBaseRules: readonly AvvikelseClassificationLegalBaseRule[];
  readonly classificationGroups: readonly AvvikelseClassificationGroup[];
  readonly errandClassificationGroupPriority: readonly string[];
  readonly persistedClassification: InvestigationClassificationDraft;
  readonly triggerValidation: () => Promise<boolean>;
  readonly getDraft: () => InvestigationClassificationDraft;
}

const persistedClassificationError = (
  state: ReturnType<typeof getPersistedAvvikelseGroupedClassificationState>
): string | undefined => {
  if (state === 'known-valid' || state === 'legacy-unknown') return undefined;
  if (state === 'known-disallowed-legal-base') {
    return 'Den befintliga kategoriseringen stämmer inte med valda lagrum. Välj en giltig typ och underkategori för varje valt lagrum.';
  }
  if (state === 'known-missing-required-type')
    return 'Välj underkategori för varje valt lagrum innan utredningen sparas.';
  return 'Välj typ och underkategori för varje valt lagrum innan utredningen sparas.';
};

type PersistedClassificationInput = Pick<
  PrepareClassificationInput,
  | 'labelStructure'
  | 'legalBases'
  | 'legalBaseRules'
  | 'classificationGroups'
  | 'errandClassificationGroupPriority'
  | 'persistedClassification'
> &
  Readonly<{ labelTree: AvvikelseClassificationLabelTree }>;

const getPersistedClassificationState = ({
  labelStructure,
  labelTree,
  legalBases,
  legalBaseRules,
  classificationGroups,
  errandClassificationGroupPriority,
  persistedClassification,
}: PersistedClassificationInput) =>
  getPersistedAvvikelseGroupedClassificationState(
    labelStructure,
    labelTree,
    legalBases,
    persistedClassification,
    legalBaseRules,
    classificationGroups,
    errandClassificationGroupPriority
  );

/** The same prerequisite is shown before editing and enforced again before either save step. */
export function investigationClassificationWriteBlock({
  required,
  completed,
  canEditClassification,
  dirty,
  labelTree,
  ...persisted
}: Omit<PrepareClassificationInput, 'triggerValidation' | 'getDraft'>): string | undefined {
  if (!required || canEditClassification) return undefined;
  if (dirty) return 'Du saknar behörighet att spara ändrad kategorisering. Dina ändringar finns kvar på sidan.';
  // An untouched classification is only in the way once the investigation is marked finished.
  if (!completed) return undefined;
  if (!labelTree)
    return 'Kategoriseringen kan inte kontrolleras just nu. Försök igen när klassificeringsprofilen har laddats.';
  const state = getPersistedClassificationState({ ...persisted, labelTree });
  if (persistedClassificationError(state)) {
    return 'Dokumentet kräver en giltig kategorisering för valda lagrum. Du saknar behörighet att ändra kategoriseringen. Behåll lagrum som stämmer med kategoriseringen eller be en behörig handläggare att uppdatera den.';
  }
  return undefined;
}

export async function prepareInvestigationClassification({
  triggerValidation,
  getDraft,
  ...input
}: PrepareClassificationInput): Promise<PreparedInvestigationClassification | undefined> {
  const { required, completed, dirty, labelTree, labelStructure, legalBases, legalBaseRules } = input;
  if (!required) return undefined;
  const writeBlock = investigationClassificationWriteBlock(input);
  if (writeBlock) throw new Error(writeBlock);

  // A draft is saved as it stands. A classification the handler has edited is still written and
  // still has to be valid - what waits for the completion mark is the demand that one exists.
  if (!dirty && !completed) return undefined;

  if (!dirty && labelTree) {
    const persistedState = getPersistedClassificationState({ ...input, labelTree });
    const errorMessage = persistedClassificationError(persistedState);
    if (errorMessage) {
      await triggerValidation();
      throw new Error(errorMessage);
    }
    return undefined;
  }

  if (!dirty) return undefined;
  if (!labelTree) {
    throw new Error('Klassificeringsprofilens labelträd saknas. Ladda om sidan innan utredningen sparas.');
  }
  if (!(await triggerValidation())) {
    throw new Error('Välj typ och underkategori för varje valt lagrum innan utredningen sparas.');
  }

  const draft = getDraft();
  const model = createAvvikelseGroupedClassificationModel(
    labelStructure,
    labelTree,
    legalBases,
    legalBaseRules,
    input.classificationGroups,
    input.errandClassificationGroupPriority
  );
  const selections = getAvvikelseGroupedClassificationSelection(model, draft.labels, draft);

  return {
    model,
    update: applyAvvikelseGroupedClassificationSelection(model, draft.labels, selections),
  };
}

interface SaveDocumentStepInput {
  readonly municipalityId: string;
  readonly errandId: string;
  readonly documentKey: InvestigationDocumentKey;
  readonly schemaId: string;
  readonly value: InvestigationFormData;
  readonly persisted: boolean;
  readonly etag?: string;
  readonly parentErrandVersion: number | undefined;
  readonly documentDirty: boolean;
  readonly classificationDirty: boolean;
  readonly documentSavedPendingClassification: boolean;
}

export async function saveInvestigationDocumentStep({
  municipalityId,
  errandId,
  documentKey,
  schemaId,
  value,
  persisted,
  etag,
  parentErrandVersion,
  documentDirty,
  classificationDirty,
  documentSavedPendingClassification,
}: SaveDocumentStepInput): Promise<SavedSupportInvestigationDocument | undefined> {
  const mustCreateDocumentBeforeClassification = !persisted && classificationDirty;
  const shouldWriteDocument = documentDirty || mustCreateDocumentBeforeClassification;
  if (documentSavedPendingClassification || !shouldWriteDocument) return undefined;

  // The errand version is passed along but is not a precondition for the document write, so a
  // missing one no longer blocks the save. The classification step still requires it, and refuses
  // there, because that step writes the errand itself.
  const loadedParentErrandVersion =
    typeof parentErrandVersion === 'number' && Number.isSafeInteger(parentErrandVersion) && parentErrandVersion >= 0
      ? parentErrandVersion
      : undefined;

  return saveSupportInvestigationDocument(
    municipalityId,
    errandId,
    documentKey,
    { schemaId, value },
    loadedParentErrandVersion,
    etag
  );
}

interface SaveClassificationStepInput {
  readonly municipalityId: string;
  readonly errandId: string;
  readonly documentKey: InvestigationDocumentKey;
  readonly prepared?: PreparedInvestigationClassification;
  readonly parentErrandVersion: number | undefined;
  readonly documentETag: string | undefined;
}

/**
 * Whether the save wrote more on the errand than the document it sent. The BFF marks the errand with what follows
 * from the document - a high HSL risk - in the same call, and says so in how many of the errand's version steps
 * were the call's own. The labels the page holds are then behind the errand's.
 */
export const savedBeyondTheDocument = (saved: { readonly ownErrandWrites?: number } | undefined): boolean =>
  (saved?.ownErrandWrites ?? 1) > 1;

export async function saveInvestigationClassificationStep({
  municipalityId,
  errandId,
  documentKey,
  prepared,
  parentErrandVersion,
  documentETag,
}: SaveClassificationStepInput): Promise<SupportInvestigationClassificationResponse | undefined> {
  if (!prepared) return undefined;
  const request = buildSupportInvestigationClassificationRequest(
    prepared.update,
    parentErrandVersion,
    documentKey,
    documentETag
  );
  return saveSupportInvestigationClassification(municipalityId, errandId, request);
}

/**
 * What the handler calls the document, capitalised for the start of a sentence. The investigation
 * wording is the default; the decision tab passes its own.
 */
export interface InvestigationDocumentWording {
  readonly noun: string;
  readonly kind: string;
}

export const investigationDocumentWording: InvestigationDocumentWording = Object.freeze({
  noun: 'Utredningen',
  kind: 'utredningsdokumentet',
});

export const decisionDocumentWording: InvestigationDocumentWording = Object.freeze({
  noun: 'Beslutet',
  kind: 'beslutsdokumentet',
});

interface SaveErrorMessageInput {
  readonly error: unknown;
  readonly documentSavedForClassification: boolean;
  readonly classificationDirty: boolean;
  readonly classificationRequired: boolean;
  readonly wording?: InvestigationDocumentWording;
}

export function investigationSaveErrorMessage({
  error,
  documentSavedForClassification,
  classificationDirty,
  classificationRequired,
  wording = investigationDocumentWording,
}: SaveErrorMessageInput): string {
  if (isSupportInvestigationAccessDenied(error)) {
    return `Support Management nekade åtkomst till det här ${wording.kind}.`;
  }
  const classificationConflict = isSupportInvestigationClassificationConflict(error);
  if (classificationConflict && documentSavedForClassification && classificationDirty) {
    return `${wording.noun} har sparats, men ärendets klassificering har ändrats av någon annan. Dina kategoriseringsval finns kvar här. Ladda om ärendet och jämför innan du sparar klassificeringen igen.`;
  }
  if (classificationConflict && classificationDirty) {
    return 'Ärendets klassificering har ändrats av någon annan. Dina kategoriseringsval finns kvar här. Ladda om ärendet och jämför innan du sparar igen.';
  }
  if (documentSavedForClassification && classificationDirty) {
    return `${wording.noun} har sparats, men ärendets klassificering kunde inte synkroniseras. Försök igen; nästa försök uppdaterar bara klassificeringen.`;
  }
  if (isSupportInvestigationConflict(error)) {
    return `${wording.noun} har ändrats av någon annan. Dina ändringar finns kvar här. Ladda om ärendet och jämför innan du sparar igen.`;
  }

  const apiMessage = (error as AxiosError<{ message?: string }>).response?.data?.message;
  if (apiMessage) return apiMessage;
  if (error instanceof Error) return error.message;
  if (classificationRequired && classificationDirty) {
    return 'Ärendets klassificering kunde inte sparas. Dina ändringar finns kvar och du kan försöka igen.';
  }
  return `${wording.noun} kunde inte sparas. Dina ändringar finns kvar och du kan försöka igen.`;
}
