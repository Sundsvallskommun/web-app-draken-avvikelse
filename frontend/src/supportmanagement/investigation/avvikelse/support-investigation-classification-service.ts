import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { apiService } from '@common/services/api-service';
import type { SeenSupportErrand, SupportErrandFacts } from '@supportmanagement/services/support-errand-facts';
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
  /** What the handler saw of the errand; the BFF checks the classification they changed against it. */
  seenFacts: SupportErrandFacts;
  classifications: SupportInvestigationClassificationSelection[];
  documentKey: string;
  documentETag: string;
}

export interface SupportInvestigationClassificationResponse {
  facts?: SupportErrandFacts;
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
  seen: SeenSupportErrand | undefined,
  documentKey: string,
  documentETag: string | undefined
): SupportInvestigationClassificationRequest => {
  if (!seen?.facts) {
    throw new Error('Ärendet är inte helt inläst. Ladda om ärendet innan klassificeringen sparas.');
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
    seenFacts: seen.facts,
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
  errandId: string,
  request: SupportInvestigationClassificationRequest
): Promise<SupportInvestigationClassificationResponse> {
  const response = await apiService.patch<
    SupportInvestigationClassificationResponse,
    SupportInvestigationClassificationRequest
  >(`supporterrands/${errandId}/classification`, request);

  return response.data;
}

export function isSupportInvestigationClassificationConflict(error: unknown): boolean {
  const status = (error as AxiosError).response?.status;
  return status === 409 || status === 412;
}
