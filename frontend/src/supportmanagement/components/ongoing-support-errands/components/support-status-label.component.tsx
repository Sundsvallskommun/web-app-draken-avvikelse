import iconMap from '@common/components/lucide-icon-map/lucide-icon-map.component';
import { Label } from '@sk-web-gui/react';
import { useMetadataStore } from '@stores/index';
import { Hourglass } from 'lucide-react';
import { FC } from 'react';
import { CErrandAction } from 'src/data-contracts/backend/data-contracts';

/** A workflow records no resolution, so a closed errand is labelled by its status alone. */
export const SupportStatusLabelComponent: FC<{
  status: string;
  actions?: CErrandAction[];
}> = ({ status, actions }) => {
  const supportMetadata = useMetadataStore((s) => s.supportMetadata);

  const sevenDaysAction = actions?.find((action) => action.actionName === 'ADD_LABEL');

  let color,
    inverted = false,
    icon = null;
  switch (status) {
    case 'SOLVED':
      color = 'primary';
      icon = 'check';
      break;
    case 'ONGOING':
    // The workflow works in INQUIRY rather than ONGOING; to a reader it is the same state.
    case 'INQUIRY':
      color = 'gronsta';
      icon = 'pen';
      break;
    case 'NEW':
      color = 'vattjom';
      break;
    case 'PENDING':
      color = 'gronsta';
      inverted = true;
      icon = 'clock-10';
      break;
    case 'AWAITING_INTERNAL_RESPONSE':
    // The workflow waits for a completion in AWAITING_RESPONSE; to a reader it is the same state.
    case 'AWAITING_RESPONSE':
      color = 'gronsta';
      inverted = true;
      icon = 'clock-10';
      break;
    case 'SUSPENDED':
      color = 'warning';
      inverted = true;
      icon = 'circle-pause';
      break;
    case 'ASSIGNED':
      color = 'warning';
      inverted = false;
      icon = 'circle-pause';
      break;
    case 'REOPENED':
      color = 'bjornstigen';
      icon = 'lock-open';
      inverted = true;
      break;
    default:
      color = 'tertiary';
      break;
  }

  const statusText = supportMetadata?.statuses?.find((s) => s.name === status)?.displayName ?? status;

  return (
    <Label
      rounded
      inverted={inverted}
      color={sevenDaysAction ? 'error' : color}
      className={`max-h-full h-auto text-center whitespace-nowrap`}
    >
      {sevenDaysAction ? (
        <Hourglass size={16} />
      ) : icon ? (
        (() => {
          const DynIcon = iconMap[icon];
          return DynIcon ? <DynIcon size={16} /> : undefined;
        })()
      ) : null}{' '}
      {statusText}
    </Label>
  );
};
