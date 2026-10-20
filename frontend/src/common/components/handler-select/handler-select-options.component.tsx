import { groupHandlersByRole } from '@common/services/handler-role-grouping';
import { Admin, HandlerRole } from '@common/services/user-service';
import { Select } from '@sk-web-gui/react';
import { FC } from 'react';

import { handlerOptionValue } from './handler-option-value';

interface HandlerSelectOptionsProps {
  administrators: Admin[];
  roles: HandlerRole[];
}

/**
 * The options inside a handler `Select`, under a heading per handler role.
 *
 * Each option's value names its role and its account (`handlerOptionValue`), so a person listed under two
 * headings is two different choices; `findHandlerForOption` reads the choice back.
 */
export const HandlerSelectOptions: FC<HandlerSelectOptionsProps> = ({ administrators, roles }) => (
  <>
    {groupHandlersByRole(administrators, roles).map((group) => (
      <Select.Optgroup key={group.key} label={group.label}>
        {group.administrators.map((administrator) => (
          <Select.Option
            key={`${group.key}-${administrator.adAccount}`}
            value={handlerOptionValue(group.key, administrator.adAccount)}
          >
            {administrator.displayName}
          </Select.Option>
        ))}
      </Select.Optgroup>
    ))}
  </>
);
