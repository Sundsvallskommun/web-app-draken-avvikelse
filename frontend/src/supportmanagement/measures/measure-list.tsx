import type { Measure, MeasureType, Role } from '@common/data-contracts/supportmanagement/data-contracts';
import { getNameFromADUsername } from '@common/services/user-service';
import { useUserStore } from '@stores/user-store';
import { useId } from 'react';

import { MeasureCard } from './measure-card';
import { measureCanBeDecided, measureCanBeRemoved } from './measure-decision';
import { measureCanBeFollowedUp } from './measure-follow-up';
import { isOwnMeasure } from './measure-ownership';
import { groupMeasuresByPerson, type MeasureSort, sortMeasuresByCreated } from './measure-sort';
import { measureTypeLabel } from './measure-types';

export function MeasureList({
  measures,
  types,
  roles,
  currentUser,
  mayFollowUp = false,
  sort = 'created',
  onEdit,
  onRemove,
  errandIsInvestigated = false,
  onDecide,
  onFollowUp,
  onChangeEndDate,
  emptyMessage = 'Det finns inga åtgärder registrerade.',
}: {
  measures: readonly Measure[];
  types: readonly MeasureType[];
  roles: readonly Role[];
  /** Session username; only the person who registered a measure may edit it. */
  currentUser?: string;
  /**
   * The BFF's answer on whether the user's role follows up measures: the unit's managers do, whoever
   * proposed the measure. The BFF applies the same rule on write.
   */
  mayFollowUp?: boolean;
  /** The latest added first, or gathered by who registered them. */
  sort?: MeasureSort;
  onEdit?: (measure: Measure) => void;
  /** Offered on the viewer's own measures that may still be removed. */
  onRemove?: (measure: Measure) => void;
  /** Whether the errand is in Utredning, where measures may still be removed. */
  errandIsInvestigated?: boolean;
  onDecide?: (measure: Measure) => void;
  onFollowUp?: (measure: Measure) => void;
  /** Moves the end date of a measure being followed up, offered to whoever follows it up. */
  onChangeEndDate?: (measure: Measure) => void;
  emptyMessage?: string;
}) {
  const groupId = useId();
  const administrators = useUserStore((state) => state.administrators);
  // Free text today; measures saved by the earlier picker hold an AD username, so resolve those.
  const userLabel = (username?: string) =>
    username ? getNameFromADUsername(username, administrators) || username : undefined;
  const roleLabel = (name?: string) => roles.find((role) => role.name === name)?.displayName || name;
  if (measures.length === 0) return <p>{emptyMessage}</p>;

  const card = (measure: Measure, index: number) => {
    const followsUp = mayFollowUp && measureCanBeFollowedUp(measure);
    return (
      <MeasureCard
        key={measure.id ?? index}
        measure={measure}
        title={measureTypeLabel(types, measure)}
        creator={userLabel(measure.addedByUser)}
        role={roleLabel(measure.addedByRole)}
        responsible={userLabel(measure.responsibleUser)}
        onEdit={onEdit && measure.id && isOwnMeasure(measure, currentUser) ? () => onEdit(measure) : undefined}
        onRemove={
          onRemove && isOwnMeasure(measure, currentUser) && measureCanBeRemoved(measure, errandIsInvestigated)
            ? () => onRemove(measure)
            : undefined
        }
        onDecide={onDecide && measureCanBeDecided(measure) ? () => onDecide(measure) : undefined}
        onFollowUp={onFollowUp && followsUp ? () => onFollowUp(measure) : undefined}
        onChangeEndDate={onChangeEndDate && followsUp ? () => onChangeEndDate(measure) : undefined}
      />
    );
  };

  if (sort === 'person') {
    return (
      <div className="flex flex-col gap-24" data-cy="measure-groups">
        {groupMeasuresByPerson(measures, userLabel).map((group, groupIndex) => {
          const headingId = `${groupId}-${groupIndex}`;
          return (
            // The person names the list itself, so the name is read once and each card keeps its heading level.
            <div key={group.key} className="flex flex-col gap-12">
              <p id={headingId} className="text-label-medium" data-cy="measure-group-person">
                {group.person ?? 'Ingen angiven'} ({group.measures.length})
              </p>
              <ul className="flex flex-col gap-16" aria-labelledby={headingId}>
                {group.measures.map((measure, index) => card(measure, index))}
              </ul>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-16" aria-label="Registrerade åtgärder">
      {sortMeasuresByCreated(measures).map((measure, index) => card(measure, index))}
    </ul>
  );
}
