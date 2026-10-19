import iconMap from '@common/components/lucide-icon-map/lucide-icon-map.component';
import { Badge, Button, cx, useGui } from '@sk-web-gui/react';
import { useBadgeStore, useSupportStore } from '@stores/index';
import { supportErrandIsEmpty } from '@supportmanagement/services/support-errand-service';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { FC, KeyboardEvent, ReactNode, useRef, useState } from 'react';
import { useMediaQuery } from 'usehooks-ts';

import { SidebarTooltip } from './sidebar-tooltip.component';

export type SidebarButtonKey = 'notes' | 'info' | 'history' | 'comments' | 'supportexport' | undefined;

export const Sidebar: FC<{
  buttons: {
    label: string;
    key: SidebarButtonKey;
    icon: string;
    component: ReactNode;
  }[];
  /** Panel to open on mount. Lets a deep link land the user straight on e.g. the errand log. */
  initialKey?: SidebarButtonKey;
}> = ({ buttons, initialKey }) => {
  const [open, setOpen] = useState(true);
  const [hover, setHover] = useState<SidebarButtonKey>();
  const [scrolled, setScrolled] = useState<number>(0);
  const [selected, setSelected] = useState<SidebarButtonKey>(initialKey ?? 'info');
  const [active, setActive] = useState<number>(buttons.findIndex((button) => selected === button.key));
  const menuRef = useRef<HTMLDivElement>(null);
  const gui = useGui();
  const isLg = useMediaQuery(`screen and (min-width: ${gui.theme.screens.lg})`);

  const supportErrand = useSupportStore((s) => s.supportErrand);
  const notesCount = useBadgeStore((s) => s.notesCount);
  const serviceNotesCount = useBadgeStore((s) => s.serviceNotesCount);

  const badgeCounts: Record<string, number> = {
    Kommentarer: notesCount,
    Tjänsteanteckningar: serviceNotesCount,
  };

  const updateScroll = () => {
    if (menuRef.current) {
      setScrolled(menuRef.current.scrollTop);
    }
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowUp':
        const prevIndex = index === 0 ? buttons.length : index - 1;
        document.getElementById(`sidebar-button-${prevIndex}`)?.focus();
        setActive(prevIndex);
        break;
      case 'ArrowDown':
        const nextIndex = index === buttons.length ? 0 : index + 1;
        document.getElementById(`sidebar-button-${nextIndex}`)?.focus();
        setActive(nextIndex);
        break;
      default:
        break;
    }
  };

  return (
    <aside
      data-cy="manage-sidebar"
      className={cx(
        'transition-all ease-in-out duration-150 absolute lg:static flex bg-background-content h-full max-h-[calc(100vh-7.2rem)] max-w-full',
        open ? 'max-lg:shadow-100 w-full sm:w-[40rem] sm:min-w-[40rem]' : 'w-[5.6rem]'
      )}
    >
      <div
        className="h-full bg-transparent flex flex-col pt-18 lg:pt-32 gap-12 pb-12 w-0"
        style={{ marginTop: `-${scrolled}px` }}
      >
        {buttons.map((b, idx) => (
          <SidebarTooltip key={`sidebartooltip-${idx}`} open={hover === b.key}>
            {b.label}
          </SidebarTooltip>
        ))}
      </div>
      <div
        onScroll={() => updateScroll()}
        ref={menuRef}
        role="menubar"
        aria-orientation="vertical"
        className="h-full flex flex-col justify-between border-1 border-y-0 border-divider overflow-y-auto overflow-x-visible min-w-[5.6rem]"
      >
        <div role="none" className="flex flex-col pt-18 lg:pt-32 gap-12 pb-12 items-center w-full px-8 overflow-hidden">
          {buttons.map((b, idx) => (
            <div key={`sidebarkey-${idx}`} className="relative w-full flex justify-center" role="none">
              <Button
                role="menuitem"
                key={`sidebarbutton-${b.key}`}
                size={isLg ? 'md' : 'sm'}
                aria-label={b.label}
                id={`sidebar-button-${idx}`}
                onClick={() => {
                  setSelected(b.key as SidebarButtonKey);
                  setOpen(true);
                }}
                disabled={idx !== 0 && supportErrandIsEmpty(supportErrand!)}
                onKeyDown={(e) => handleKeyboard(e, idx)}
                onMouseEnter={() => setHover(b.key)}
                onMouseLeave={() => setHover(undefined)}
                color="primary"
                inverted={selected !== b.key}
                tabIndex={active === idx ? 0 : -1}
                iconButton
                leftIcon={
                  <>
                    {(() => {
                      const DynIcon = iconMap[b.icon as any];
                      return DynIcon ? <DynIcon /> : undefined;
                    })()}
                  </>
                }
              >
                {badgeCounts[b.label] > 0 && (
                  <Badge
                    className="absolute -top-10 -right-10"
                    rounded
                    color="vattjom"
                    inverted
                    size="sm"
                    counter={badgeCounts[b.label] > 99 ? '99+' : badgeCounts[b.label]}
                  />
                )}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-12 pt-24 w-full justify-center pb-12">
          <Button
            id={`sidebar-button-${buttons.length}`}
            color="primary"
            size={isLg ? 'md' : 'sm'}
            variant="tertiary"
            aria-label={open ? 'Stäng sidomeny' : 'Öppna sidomeny'}
            iconButton
            tabIndex={active === buttons.length ? 0 : -1}
            leftIcon={open ? <ChevronsRight /> : <ChevronsLeft />}
            onClick={() => setOpen(!open)}
            onKeyDown={(e) => handleKeyboard(e, buttons.length)}
          />
        </div>
      </div>
      <div className={cx(`overflow-x-hidden overflow-y-auto`, open ? 'w-full px-20' : 'w-0 px-0')}>
        <div className="h-fit w-full py-32">{buttons.find((b) => b.key === selected)?.component || <></>}</div>
      </div>
    </aside>
  );
};
