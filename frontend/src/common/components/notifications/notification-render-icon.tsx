import iconMap from '@common/components/lucide-icon-map/lucide-icon-map.component';
import { cx } from '@sk-web-gui/react';
import { FC } from 'react';

/**
 * Takes the fields it draws rather than a whole notification, so the same icon renders both a
 * collapsed notification row and a single event inside an expanded one.
 */
interface NotificationRenderIconProps {
  subType?: string;
  acknowledged?: boolean;
}

/**
 * Keyed on subtype rather than on the description text, so the icon survives upstream rewording of
 * the notification message.
 */
const iconConfig: Record<string, { icon?: string; defaultColor: string }> = {
  MESSAGE: { icon: 'message-circle', defaultColor: 'gronsta' },
  SUSPENSION: { icon: 'bell-ring', defaultColor: 'juniskar' },
  ERRAND: { icon: 'bell-ring', defaultColor: 'juniskar' },
  ATTACHMENT: { icon: 'file', defaultColor: 'vattjom' },
  DECISION: { icon: 'file-text', defaultColor: 'vattjom' },
  ASSIGNMENT: { icon: 'user', defaultColor: 'bjornstigen' },
  NOTE: { icon: 'clipboard-pen', defaultColor: 'juniskar' },
  default: { icon: 'bell', defaultColor: 'vattjom' },
};

const surfaceColor: Record<string, string> = {
  juniskar: 'bg-juniskar-surface-accent',
  gronsta: 'bg-gronsta-surface-accent',
  vattjom: 'bg-vattjom-surface-accent',
  bjornstigen: 'bg-bjornstigen-surface-accent',
};

const textColor: Record<string, string> = {
  juniskar: 'text-juniskar-surface-primary',
  gronsta: 'text-gronsta-surface-primary',
  vattjom: 'text-vattjom-surface-primary',
  bjornstigen: 'text-bjornstigen-surface-primary',
  primary: 'text-primary',
};

export const NotificationRenderIcon: FC<NotificationRenderIconProps> = ({ subType, acknowledged }) => {
  const config = (subType && iconConfig[subType]) || iconConfig.default;
  const color = acknowledged ? 'primary' : config.defaultColor;
  const bgColor = surfaceColor[color] ?? 'bg-tertiary-surface';

  const iconColor = textColor[color] ?? 'text-primary';

  return (
    <div className={cx(`w-[4rem] h-[4rem] rounded-12 flex items-center justify-center`, bgColor, iconColor)}>
      {config.icon &&
        (() => {
          const DynIcon = iconMap[config.icon as string];
          return DynIcon ? <DynIcon size="2.4rem" /> : null;
        })()}
    </div>
  );
};
