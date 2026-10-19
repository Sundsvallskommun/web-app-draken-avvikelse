'use client';

import { cx } from '@sk-web-gui/react';
import { FC } from 'react';

import type { FollowUpKeyFigureCount, FollowUpKeyFigureKey } from './unit-follow-up-key-figures';

interface UnitFollowUpKeyFiguresProps {
  figures: readonly FollowUpKeyFigureCount[];
  selected: FollowUpKeyFigureKey | '';
  onSelect: (key: FollowUpKeyFigureKey) => void;
}

/**
 * The key figure cards above the lists. Each card is a button that shows the errands behind its number;
 * the one whose errands are shown stays pressed. A card that warns - errands nobody has started on - is
 * drawn in the warning colour while it counts any.
 */
export const UnitFollowUpKeyFigures: FC<UnitFollowUpKeyFiguresProps> = ({ figures, selected, onSelect }) => (
  <ul
    className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-16"
    aria-label="Lägesbild"
    data-cy="follow-up-key-figures"
  >
    {figures.map((figure) => {
      const pressed = selected === figure.key;
      return (
        <li key={figure.key} className="flex">
          <button
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(figure.key)}
            className={cx(
              'w-full min-h-[11rem] flex flex-col justify-between gap-12 rounded-cards p-20 text-left',
              'border-2 focus-visible:ring ring-ring',
              figure.warning
                ? 'bg-warning-background-200 hover:bg-warning-background-300'
                : 'bg-vattjom-background-200 hover:bg-vattjom-background-300',
              pressed
                ? figure.warning
                  ? 'border-warning-surface-primary'
                  : 'border-vattjom-surface-primary'
                : 'border-transparent'
            )}
            data-cy={`follow-up-key-figure-${figure.key}`}
          >
            <span className="text-base">{figure.label}</span>
            <span
              className={cx('text-h2-md font-bold', figure.warning && 'text-warning-text-primary')}
              data-cy={`follow-up-key-figure-${figure.key}-count`}
            >
              {figure.count}
            </span>
          </button>
        </li>
      );
    })}
  </ul>
);
