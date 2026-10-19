'use client';

import { useSupportStore } from '@stores/index';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { resolveOwnErrandWriteAdvance } from '@supportmanagement/services/support-errand-write-version';
import { useCallback } from 'react';
import { useFormContext } from 'react-hook-form';

/**
 * The version the page knows the errand at, read when asked. It is the baseline for the caller's own child write:
 * a version remembered from an earlier read - a list loaded before the errand was saved, say - is already behind,
 * and an advance measured from it is never the caller's alone.
 */
export const knownSupportErrandVersion = (errandId: string | undefined): number | undefined => {
  const current = useSupportStore.getState().supportErrand;
  return current && current.id === errandId ? current.version : undefined;
};

/**
 * Moves the errand's known version on after one of the caller's own child writes, by the rule in
 * `resolveOwnErrandWriteAdvance`. Answers the version the errand is now known at.
 */
export function useAdvanceErrandVersion(errandId: string | undefined) {
  const { getValues, resetField } = useFormContext<SupportErrand>();

  return useCallback(
    (expected: number | undefined, received: number, ownWrites = 1): number | undefined => {
      const current = useSupportStore.getState().supportErrand;
      if (!current || current.id !== errandId) return expected;
      const advance = resolveOwnErrandWriteAdvance(
        { errandVersion: current.version, formVersion: getValues('version') },
        expected,
        received,
        ownWrites
      );
      if (advance.advancesErrand)
        useSupportStore.setState({ supportErrand: { ...current, version: advance.errandVersion } });
      if (advance.advancesForm) resetField('version', { defaultValue: advance.errandVersion });
      return advance.errandVersion;
    },
    [errandId, getValues, resetField]
  );
}
