import {
  AvvikelseGroupedClassificationSelection,
  LabelClassificationSelection,
} from '@supportmanagement/investigation/avvikelse/label-classification';

import { InvestigationFormData } from '../investigation-document';
import { LocalInvestigationDocumentKey } from './investigation-schema-lab.types';

const storageNamespace = 'draken:investigation-schema-lab';
const labelClassificationStorageKey = `${storageNamespace}:supportmanagement-labels`;
// 2.0 keeps one selection per legal base group; a 1.0 draft held a single selection and is not read.
const labelClassificationCatalogVersion = '2.0';
const labelOwnedInvestigationFields = new Set(['deviationType', 'deviationSubtype']);

interface InvestigationDraftEnvelope {
  schemaKey: LocalInvestigationDocumentKey;
  schemaVersion: string;
  savedAt: string;
  formData: InvestigationFormData;
}

interface LabelClassificationDraftEnvelope {
  catalogVersion: string;
  savedAt: string;
  value: AvvikelseGroupedClassificationSelection;
}

export interface LoadedInvestigationDraft {
  formData: InvestigationFormData;
  savedAt?: string;
  warning?: string;
}

export interface LoadedLabelClassificationDraft {
  value: AvvikelseGroupedClassificationSelection;
  savedAt?: string;
  warning?: string;
}

type InvestigationDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStorageKey(schemaKey: LocalInvestigationDocumentKey): string {
  return `${storageNamespace}:${schemaKey}`;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
}

function stripLabelOwnedFields(formData: InvestigationFormData): {
  formData: InvestigationFormData;
  removed: boolean;
} {
  const cleanedFormData = Object.fromEntries(
    Object.entries(formData).filter(([fieldName]) => !labelOwnedInvestigationFields.has(fieldName))
  );

  return {
    formData: cleanedFormData,
    removed: Object.keys(cleanedFormData).length !== Object.keys(formData).length,
  };
}

function isDraftEnvelope(
  value: unknown,
  schemaKey: LocalInvestigationDocumentKey,
  schemaVersion: string
): value is InvestigationDraftEnvelope {
  if (!isRecord(value)) return false;

  return (
    value.schemaKey === schemaKey &&
    value.schemaVersion === schemaVersion &&
    isIsoTimestamp(value.savedAt) &&
    isRecord(value.formData)
  );
}

function isLabelClassificationSelection(value: unknown): value is LabelClassificationSelection {
  if (!isRecord(value)) return false;

  return (
    (value.typeCode === undefined || typeof value.typeCode === 'string') &&
    (value.subtypeCode === undefined || typeof value.subtypeCode === 'string')
  );
}

function isGroupedLabelClassificationSelection(value: unknown): value is AvvikelseGroupedClassificationSelection {
  return isRecord(value) && Object.values(value).every(isLabelClassificationSelection);
}

function isLabelClassificationDraftEnvelope(value: unknown): value is LabelClassificationDraftEnvelope {
  if (!isRecord(value)) return false;

  return (
    value.catalogVersion === labelClassificationCatalogVersion &&
    isIsoTimestamp(value.savedAt) &&
    isGroupedLabelClassificationSelection(value.value)
  );
}

export function loadInvestigationDraft(
  storage: InvestigationDraftStorage,
  schemaKey: LocalInvestigationDocumentKey,
  schemaVersion: string
): LoadedInvestigationDraft {
  try {
    const serializedDraft = storage.getItem(getStorageKey(schemaKey));
    if (!serializedDraft) return { formData: {} };

    const parsedDraft: unknown = JSON.parse(serializedDraft);
    if (!isDraftEnvelope(parsedDraft, schemaKey, schemaVersion)) {
      return {
        formData: {},
        warning: 'Det lokala utkastet tillhör en annan schemaversion eller är ogiltigt och har därför inte lästs in.',
      };
    }

    const sanitizedDraft = stripLabelOwnedFields(parsedDraft.formData);
    return {
      formData: sanitizedDraft.formData,
      savedAt: parsedDraft.savedAt,
      warning: sanitizedDraft.removed
        ? 'Labelägda fält hittades i det lokala utkastet och har tagits bort från utredningsdatan.'
        : undefined,
    };
  } catch {
    return {
      formData: {},
      warning: 'Det lokala utkastet kunde inte läsas och har därför ignorerats.',
    };
  }
}

export function saveInvestigationDraft(
  storage: InvestigationDraftStorage,
  schemaKey: LocalInvestigationDocumentKey,
  schemaVersion: string,
  formData: InvestigationFormData
): string {
  if (stripLabelOwnedFields(formData).removed) {
    throw new Error('SupportManagement-labels får inte sparas i utredningens formulärdata.');
  }

  const savedAt = new Date().toISOString();
  const envelope: InvestigationDraftEnvelope = {
    schemaKey,
    schemaVersion,
    savedAt,
    formData,
  };

  storage.setItem(getStorageKey(schemaKey), JSON.stringify(envelope));
  return savedAt;
}

export function removeInvestigationDraft(
  storage: InvestigationDraftStorage,
  schemaKey: LocalInvestigationDocumentKey
): void {
  storage.removeItem(getStorageKey(schemaKey));
}

export function loadLabelClassificationDraft(storage: InvestigationDraftStorage): LoadedLabelClassificationDraft {
  try {
    const serializedDraft = storage.getItem(labelClassificationStorageKey);
    if (!serializedDraft) return { value: {} };

    const parsedDraft: unknown = JSON.parse(serializedDraft);
    if (!isLabelClassificationDraftEnvelope(parsedDraft)) {
      return {
        value: {},
        warning:
          'Den lokala labelmocken tillhör en annan katalogversion eller är ogiltig och har därför inte lästs in.',
      };
    }

    return { value: parsedDraft.value, savedAt: parsedDraft.savedAt };
  } catch {
    return {
      value: {},
      warning: 'Den lokala labelmocken kunde inte läsas och har därför ignorerats.',
    };
  }
}

export function saveLabelClassificationDraft(
  storage: InvestigationDraftStorage,
  value: AvvikelseGroupedClassificationSelection
): string {
  const savedAt = new Date().toISOString();
  const envelope: LabelClassificationDraftEnvelope = {
    catalogVersion: labelClassificationCatalogVersion,
    savedAt,
    value,
  };

  storage.setItem(labelClassificationStorageKey, JSON.stringify(envelope));
  return savedAt;
}

export function removeLabelClassificationDraft(storage: InvestigationDraftStorage): void {
  storage.removeItem(labelClassificationStorageKey);
}
