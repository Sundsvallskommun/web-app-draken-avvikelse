import { cx, Tooltip, useOnElementOutside } from '@sk-web-gui/react';
import { FC, ReactNode, useRef, useState } from 'react';
interface SidebarTooltipProps {
  children?: ReactNode;
  open?: boolean;
}

export const SidebarTooltip: FC<SidebarTooltipProps> = ({ children, open }) => {
  const [position, setPosition] = useState<'left' | 'right'>('left');
  const ref = useRef<HTMLElement>(null);

  useOnElementOutside(
    ref,
    ({ isOutsideLeft }) => {
      setPosition(isOutsideLeft ? 'right' : 'left');
    },
    [open],
    { updateOnResize: false, updateOnScroll: false }
  );

  return (
    <div className="relative h-32 lg:h-40 shrink-0">
      <Tooltip
        ref={ref}
        position={position}
        className={cx(
          'whitespace-nowrap -top-4 lg:top-0 z-20',
          `${open ? 'absolute' : 'hidden'}`,
          position === 'left' ? 'right-[-0.5rem]' : 'left-full ml-[4.8rem]'
        )}
      >
        {children}
      </Tooltip>
    </div>
  );
};
