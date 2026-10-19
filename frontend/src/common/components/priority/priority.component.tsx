import { Badge } from '@sk-web-gui/react';
import { Priority } from '@supportmanagement/interfaces/priority';
import { FC } from 'react';

export const PriorityComponent: FC<{ priority?: string }> = ({ priority = '' }) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case Priority.HIGH:
        return 'error';
      case Priority.MEDIUM:
        return 'warning';
      case Priority.LOW:
        return 'vattjom';
      default:
        return 'vattjom';
    }
  };

  if (!priority) {
    return null;
  }

  return (
    <>
      <Badge
        className="!max-w-[10px] !min-w-[10px] !max-h-[10px] !min-h-[10px] align-center"
        color={getPriorityColor(priority)}
        data-cy="errandPriority"
      />
      {priority}
    </>
  );
};
