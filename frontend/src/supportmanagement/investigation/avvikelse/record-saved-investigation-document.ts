import { useSupportStore } from '@stores/index';

import type { SupportInvestigationDocument as SavedInvestigationDocument } from './support-investigation-service';

/**
 * Puts a document just saved onto the errand the page holds, in place of the one it replaces, so every rule that
 * reads the saved document sees it at once. A save that lands after the page moved to another errand changes nothing.
 */
export const recordSavedInvestigationDocument = (
  errandId: string | undefined,
  document: SavedInvestigationDocument
): void =>
  useSupportStore.setState((state) => {
    if (!state.supportErrand || state.supportErrand.id !== errandId) return state;

    return {
      supportErrand: {
        ...state.supportErrand,
        jsonParameters: [
          ...(state.supportErrand.jsonParameters ?? []).filter((parameter) => parameter.key !== document.key),
          document,
        ],
      },
    };
  });
