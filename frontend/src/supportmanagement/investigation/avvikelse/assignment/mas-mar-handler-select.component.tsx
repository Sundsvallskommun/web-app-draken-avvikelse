'use client';

import { FormControl, FormErrorMessage, FormLabel, Select } from '@sk-web-gui/react';
import { useSupportStore, useUserStore } from '@stores/index';
import { useErrandSaveParticipant } from '@supportmanagement/components/support-errand/errand-save/use-errand-save-participant';
import { getSupportErrandById } from '@supportmanagement/services/support-errand-service';
import { supportErrandWriteErrorMessage } from '@supportmanagement/services/support-errand-write-version';
import { FC, useState } from 'react';

import type { InvestigationHandlerFieldsProps } from '../../investigation-variant';
import { MAS_MAR_ROLE_KEY } from './avvikelse-handler-roles';
import { actsAsMasMar, readMasMarHandler } from './mas-mar-handler';
import { saveMasMarHandler } from './mas-mar-handler-service';

/**
 * The MAS/MAR handler, beside Ansvarig. It is recorded in an errand parameter rather than as the assignee: the
 * errand stays with its handler, and MAS/MAR is the one who answers for the HSL side. Saved with Spara ärende, the
 * parameter written on its own version.
 *
 * Only MAS/MAR choose it, and on every errand they reach - which errands those are, the high HSL risk label among
 * them, is AccessMapper's to say. Nobody else is shown the select. MAS/MAR choose it on an errand assigned to
 * somebody else, so being its handler is not asked for.
 */
export const MasMarHandlerSelect: FC<InvestigationHandlerFieldsProps> = ({ locked }) => {
  const supportErrand = useSupportStore((state) => state.supportErrand);
  const user = useUserStore((state) => state.user);
  const administrators = useUserStore((state) => state.administrators);
  // Undefined until the handler picks somebody; the recorded handler stands until then.
  const [chosen, setChosen] = useState<string>();
  const [error, setError] = useState<string>();

  const recorded = readMasMarHandler(supportErrand);
  const dirty = chosen !== undefined && chosen !== (recorded ?? '');
  const candidates = administrators.filter((administrator) => administrator.roleKeys.includes(MAS_MAR_ROLE_KEY));

  useErrandSaveParticipant('mas-mar-handler', dirty, {
    label: 'MAS/MAR',
    reveal: () => undefined,
    save: async () => {
      // Read at save time: an earlier step of the same Spara ärende may have moved the errand on.
      const errand = useSupportStore.getState().supportErrand;
      if (!errand?.id || !chosen) return true;
      setError(undefined);
      try {
        await saveMasMarHandler(errand, chosen);
        const saved = await getSupportErrandById(errand.id);
        if (!saved.error) useSupportStore.getState().setSupportErrand(saved.errand);
        setChosen(undefined);
        return true;
      } catch (cause) {
        setError(supportErrandWriteErrorMessage(cause, 'MAS/MAR kunde inte sparas. Försök igen.'));
        return false;
      }
    },
  });

  if (!actsAsMasMar(user)) return null;

  const selected = chosen ?? recorded ?? '';
  // A recorded handler who no longer holds the role is still shown, rather than silently dropped.
  const options =
    recorded && !candidates.some((candidate) => candidate.adAccount === recorded)
      ? [...candidates, { adAccount: recorded, displayName: recorded }]
      : candidates;

  return (
    <FormControl
      id="mas-mar-handler"
      className="w-full"
      disabled={locked || !user.permissions?.canEditSupportManagement}
      invalid={Boolean(error)}
    >
      <FormLabel className="text-small">MAS/MAR</FormLabel>
      <Select
        className="w-full"
        size="sm"
        aria-label="Välj MAS/MAR"
        value={selected}
        onChange={(event) => setChosen(event.target.value)}
        data-cy="mas-mar-input"
      >
        {!selected && <Select.Option value="">Välj MAS/MAR</Select.Option>}
        {options.map((candidate) => (
          <Select.Option key={candidate.adAccount} value={candidate.adAccount}>
            {candidate.displayName}
          </Select.Option>
        ))}
      </Select>
      {error && <FormErrorMessage>{error}</FormErrorMessage>}
    </FormControl>
  );
};
