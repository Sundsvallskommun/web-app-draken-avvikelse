import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService } from '@common/services/api-service';
import type { AxiosError } from 'axios';

import type { AvvikelseGroupedClassificationUpdate } from './label-classification';

interface ErrandLabelReference {
  id: string;
}

/** One classification of the errand: the category path chosen in one legal base group. */
interface SupportInvestigationClassificationSelection {
  classification: {
    category: string;
    type: string;
  };
  categoryLabels: ErrandLabelReference[];
}

export interface SupportInvestigationClassificationRequest {
  expectedVersion: number;
  classifications: SupportInvestigationClassificationSelection[];
  documentKey: string;
  documentETag: string;
}

export interface SupportInvestigationClassificationResponse {
  version: number;
  classification: {
    category: string;
    type: string;
  };
  labels: Label[];
}

const requireLabelReferences = (labels: readonly Label[]): ErrandLabelReference[] => {
  const references: ErrandLabelReference[] = [];

  for (const label of labels) {
    if (!label.id) {
      throw new Error(`Etiketten ${label.displayName || label.resourcePath || label.resourceName} saknar id.`);
    }
    if (!references.some(({ id }) => id === label.id)) references.push({ id: label.id });
  }

  return references;
};

export const buildSupportInvestigationClassificationRequest = (
  update: AvvikelseGroupedClassificationUpdate,
  expectedVersion: number | undefined,
  documentKey: string,
  documentETag: string | undefined
): SupportInvestigationClassificationRequest => {
  if (typeof expectedVersion !== 'number' || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error('Ärendets version saknas. Ladda om ärendet innan klassificeringen sparas.');
  }
  if (update.classifications.length === 0) {
    throw new Error('Välj lagrum innan klassificeringen kan sparas.');
  }
  for (const classification of update.classifications) {
    if (!classification.category || !classification.type) {
      throw new Error(`Typ för ${classification.groupLabel} måste väljas innan klassificeringen kan sparas.`);
    }
    if (classification.requiresSubType && !classification.subType) {
      throw new Error(`Underkategori för ${classification.groupLabel} måste väljas innan klassificeringen kan sparas.`);
    }
    if (classification.categoryLabels.length === 0) {
      throw new Error('Klassificeringens etiketter kunde inte bestämmas.');
    }
  }
  if (!documentKey.trim()) {
    throw new Error('Dokumentnyckeln för klassificeringen saknas.');
  }
  if (typeof documentETag !== 'string' || !/^"(0|[1-9]\d*)"$/u.test(documentETag)) {
    throw new Error('Utredningsdokumentets version saknas. Ladda om utredningen innan klassificeringen sparas.');
  }

  return {
    expectedVersion,
    classifications: update.classifications.map((classification) => ({
      classification: {
        category: classification.category,
        type: classification.type,
      },
      categoryLabels: requireLabelReferences(classification.categoryLabels),
    })),
    documentKey,
    documentETag,
  };
};

export async function saveSupportInvestigationClassification(
  municipalityId: string,
  errandId: string,
  request: SupportInvestigationClassificationRequest
): Promise<SupportInvestigationClassificationResponse> {
  const response = await apiService.patch<
    SupportInvestigationClassificationResponse,
    SupportInvestigationClassificationRequest
  >(`supporterrands/${municipalityId}/${errandId}/classification`, request);

  return response.data;
}

export function isSupportInvestigationClassificationConflict(error: unknown): boolean {
  const status = (error as AxiosError).response?.status;
  return status === 409 || status === 412;
}
