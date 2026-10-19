import { groupHandlersByRole } from '@common/services/handler-role-grouping';
import { Admin, HandlerRole } from '@common/services/user-service';
import { Select } from '@sk-web-gui/react';
import { FC } from 'react';

interface HandlerSelectOptionsProps {
  administrators: Admin[];
  roles: HandlerRole[];
}

/**
 * The options inside a handler `Select`, under a heading per handler role.
 *
 * The option's value is its display name, matching how the errand form has always read the handler
 * back out of the select.
 */
export const HandlerSelectOptions: FC<HandlerSelectOptionsProps> = ({ administrators, roles }) => (
  <>
    {groupHandlersByRole(administrators, roles).map((group) => (
      <Select.Optgroup key={group.key} label={group.label}>
        {group.administrators.map((administrator) => (
          <Select.Option key={`${group.key}-${administrator.adAccount}`}>{administrator.displayName}</Select.Option>
        ))}
      </Select.Optgroup>
    ))}
  </>
);
