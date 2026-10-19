import { Badge, cx } from '@sk-web-gui/react';
import { FC } from 'react';

export const SupportUiPhaseComponent: FC<{
  number: number;
  phase: string;
  active: boolean;
  showLabel: boolean;
  last?: boolean;
}> = ({ number, phase, active, showLabel, last }) => (
  <div className="flex items-center min-w-0">
    <span className={cx(last ? `pr-12` : null) + ` flex items-center min-w-0`}>
      <div className="block ml-18 shrink-0">
        <Badge rounded counter={number} color="vattjom" inverted={!active}></Badge>
      </div>
      {showLabel && (
        <div className={cx(active ? `font-bold` : `font-normal`) + ' min-w-0'}>
          <div className="truncate ml-8">{phase}</div>
        </div>
      )}
    </span>
  </div>
);
