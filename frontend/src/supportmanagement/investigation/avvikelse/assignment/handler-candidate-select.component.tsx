import { FormControl, Select } from '@sk-web-gui/react';
import { FC, useMemo } from 'react';

export interface AssignableCandidate {
  adAccount: string;
  displayName: string;
  /** Which group heading the candidate belongs under. Absent for a picker without groups. */
  roleKey?: string;
}

/** One group heading, in display order. An empty list renders the candidates as one flat list. */
export interface AssignableRole {
  key: string;
  label: string;
}

/** Candidates in the order the picker shows them, so a default selection is the first one shown. */
export const sortCandidates = (candidates: readonly AssignableCandidate[] | undefined): AssignableCandidate[] =>
  [...(candidates ?? [])].sort((first, second) => first.displayName.localeCompare(second.displayName, 'sv'));

interface HandlerCandidateSelectProps {
  id: string;
  /** Accessible name only: the surrounding dialog says what is being chosen, the groups name the roles. */
  selectLabel: string;
  candidates: readonly AssignableCandidate[];
  roles?: readonly AssignableRole[];
  value: string;
  onChange: (adAccount: string) => void;
  dataCy?: string;
}

/**
 * The person an errand is handed to, grouped exactly like the handler list in the sidebar: a heading
 * per role, in the order the backend sent them, and roles nobody holds left out rather than shown
 * empty.
 */
export const HandlerCandidateSelect: FC<HandlerCandidateSelectProps> = ({
  id,
  selectLabel,
  candidates,
  roles,
  value,
  onChange,
  dataCy = 'handler-assignment-input',
}) => {
  const sortedCandidates = useMemo(() => sortCandidates(candidates), [candidates]);
  const groups = useMemo(
    () =>
      (roles ?? [])
        .map((role) => ({
          ...role,
          members: sortedCandidates.filter((candidate) => candidate.roleKey === role.key),
        }))
        .filter((group) => group.members.length > 0),
    [roles, sortedCandidates]
  );

  return (
    <FormControl id={id} className="w-full">
      <Select
        className="w-full"
        size="sm"
        data-cy={dataCy}
        aria-label={selectLabel}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {groups.length > 0
          ? groups.map((group) => (
              <Select.Optgroup key={group.key} label={group.label}>
                {group.members.map((candidate) => (
                  <Select.Option key={`${group.key}-${candidate.adAccount}`} value={candidate.adAccount}>
                    {candidate.displayName}
                  </Select.Option>
                ))}
              </Select.Optgroup>
            ))
          : sortedCandidates.map((candidate) => (
              <Select.Option key={candidate.adAccount} value={candidate.adAccount}>
                {candidate.displayName}
              </Select.Option>
            ))}
      </Select>
    </FormControl>
  );
};
