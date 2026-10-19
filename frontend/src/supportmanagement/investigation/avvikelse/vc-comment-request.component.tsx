'use client';

import { withRequestGroup } from '@common/services/api-service';
import { Button } from '@sk-web-gui/react';
import { useConfigStore, useMetadataStore, useSupportStore } from '@stores/index';
import {
  getSupportErrandById,
  isSupportErrandLocked,
  type SupportErrand,
} from '@supportmanagement/services/support-errand-service';
import { FC, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { hasErrandLabel, VC_COMMENT_REQUESTED_LABEL_PATH } from './assignment/avvikelse-access-labels';
import {
  applyInvestigationHandover,
  investigationHandoverErrorMessage,
} from './assignment/avvikelse-assignment-service';

/**
 * Ä4. In the HSL event analysis, MAS/MAR asks the head of operations - who commissioned the analysis - for their
 * comment on it. The BFF marks the errand with a label: it opens VC kommentar HSL, and Support Management notifies
 * the head of operations from it. Nobody is assigned; the errand stays with its handler.
 *
 * Shown only to those who act as MAS/MAR (`actsAsMasMar`). The BFF holds the request to write access to the
 * analysis, so a request somebody else sends is refused there too.
 */
export const VcCommentRequest: FC = () => {
  const supportErrand = useSupportStore((state) => state.supportErrand);
  const labelStructure = useMetadataStore((state) => state.supportMetadata?.labels?.labelStructure);
  const municipalityId = useConfigStore((state) => state.municipalityId);
  const { resetField } = useFormContext<SupportErrand>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const requested = hasErrandLabel(supportErrand?.labels, labelStructure, VC_COMMENT_REQUESTED_LABEL_PATH);
  const locked = !supportErrand || isSupportErrandLocked(supportErrand);

  const request = () =>
    withRequestGroup(async () => {
      const errandId = supportErrand?.id;
      if (!errandId || typeof supportErrand.version !== 'number') {
        setError('Ärendets version saknas. Ladda om ärendet och försök igen.');
        return;
      }
      setBusy(true);
      setError(undefined);
      try {
        await applyInvestigationHandover(municipalityId, errandId, 'request-vc-comment', supportErrand.version);
        // The label is this action's own write, read right after it: the page takes the labels and the version it
        // left, so the tab opens and the next save is not refused as somebody else's change.
        const { errand } = await getSupportErrandById(errandId, municipalityId);
        if (errand) {
          useSupportStore.setState((state) =>
            state.supportErrand?.id === errandId
              ? { supportErrand: { ...state.supportErrand, labels: errand.labels, version: errand.version } }
              : state
          );
          resetField('labels', { defaultValue: errand.labels });
          resetField('version', { defaultValue: errand.version });
        }
      } catch (cause) {
        setError(investigationHandoverErrorMessage(cause, 'VC kommentar HSL kunde inte aktiveras. Försök igen.'));
      } finally {
        setBusy(false);
      }
    });

  if (requested) {
    return (
      <p className="text-small" role="status" data-cy="vc-comment-requested">
        Verksamhetschefen har aviserats och kommenterar analysen i fliken VC kommentar HSL.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8" data-cy="vc-comment-request">
      <p className="text-small" id="vc-comment-request-description">
        När analysen har kommit så långt att verksamhetschefen ska kommentera den aktiverar du fliken VC kommentar HSL.
        Verksamhetschefen aviseras. Ärendet tilldelas inte om.
      </p>
      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-describedby="vc-comment-request-description"
          disabled={locked || busy}
          loading={busy}
          loadingText="Aktiverar"
          onClick={() => void request()}
          data-cy="vc-comment-request-button"
        >
          Aktivera VC kommentar HSL
        </Button>
      </div>
      {error && (
        <p className="text-small text-error" role="alert" data-cy="vc-comment-request-error">
          {error}
        </p>
      )}
    </div>
  );
};
