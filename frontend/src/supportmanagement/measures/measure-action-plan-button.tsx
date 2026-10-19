import { Button, useSnackbar } from '@sk-web-gui/react';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { isAxiosError } from 'axios';
import { FileText } from 'lucide-react';
import { useId, useState } from 'react';

import { createMeasureActionPlan, refreshSupportAttachments } from './measure-action-plan-service';

const FALLBACK_MESSAGE = 'Handlingsplanen kunde inte skapas. Försök igen eller kontakta support om felet kvarstår.';

const failureMessage = (cause: unknown): string => {
  if (isAxiosError<{ message?: unknown }>(cause)) {
    if ([401, 403].includes(cause.response?.status ?? 0)) return 'Du saknar behörighet att skapa handlingsplanen.';
    const message = cause.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    return FALLBACK_MESSAGE;
  }
  return cause instanceof Error && cause.message ? cause.message : FALLBACK_MESSAGE;
};

/**
 * Skapa handlingsplan on the Åtgärder tab: one click renders every registered measure as a PDF and
 * attaches it to the errand. The plan is made by the BFF from the stored measures, so the button
 * needs nothing from the list except to know whether there is anything to plan.
 */
export function MeasureActionPlanButton({
  errand,
  municipalityId,
  measureCount,
  onCreated,
}: {
  errand: SupportErrand;
  municipalityId: string;
  measureCount: number;
  /** The plan is an attachment on the errand, which moves its version: the tab takes that in as its own write. */
  onCreated?: () => Promise<unknown>;
}) {
  const snackbar = useSnackbar();
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  const empty = measureCount === 0;

  const create = async () => {
    if (busy || empty || !errand.id) return;
    setBusy(true);
    try {
      const created = await createMeasureActionPlan(municipalityId, errand.id);
      snackbar({
        message: `Handlingsplanen ${created.fileName} har skapats och lagts som en bilaga på ärendet.`,
        status: 'success',
      });
      await Promise.all([refreshSupportAttachments(municipalityId, errand.id), onCreated?.()]);
    } catch (cause) {
      snackbar({ message: failureMessage(cause), status: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:items-end" data-cy="measure-action-plan">
      <Button
        type="button"
        variant="secondary"
        leftIcon={<FileText />}
        disabled={empty || busy}
        loading={busy}
        aria-describedby={hintId}
        onClick={() => void create()}
        data-cy="measure-action-plan-create"
      >
        Skapa handlingsplan
      </Button>
      <p id={hintId} className="text-small text-dark-secondary sm:text-right">
        {empty
          ? 'Handlingsplanen kan skapas när ärendet har minst en åtgärd.'
          : 'Alla registrerade åtgärder samlas i en PDF som läggs som bilaga på ärendet.'}
      </p>
    </div>
  );
}
