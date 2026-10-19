import { resolveHandlerGroupRoles } from '@/config/handler-group-roles';
import { UserController } from '@/controllers/user.controller';

import { mockReq, mockRes, mockUser } from './helpers/http';
import { MOCK_SUPERADMIN_GROUP, MOCK_UNIT_MANAGER_GROUP } from './helpers/mock-data';

const handlerRoles = resolveHandlerGroupRoles(
  JSON.stringify([
    { key: 'enhetschef', label: 'Enhetschef', group: MOCK_UNIT_MANAGER_GROUP },
    { key: 'lex-ansvarig', label: 'LEX-ansvarig', group: 'MOCK_LEX_MANAGERS' },
  ]),
);

const readMe = async (groups: string[]) => {
  const controller = new UserController();
  (controller as unknown as { handlerRoles: typeof handlerRoles }).handlerRoles = handlerRoles;
  const res = mockRes();
  await controller.getUser(mockReq(mockUser({ groups })), res as never);
  return (res.body as { data: Record<string, unknown> }).data;
};

describe('UserController.getUser', () => {
  it('names the handler roles the user holds through their groups', async () => {
    const me = await readMe([MOCK_UNIT_MANAGER_GROUP]);

    expect(me.roleKeys).toEqual(['enhetschef']);
    expect(me.superadmin).toBe(false);
  });

  it('says when the user is a superadmin', async () => {
    const me = await readMe([MOCK_SUPERADMIN_GROUP.toUpperCase()]);

    expect(me.roleKeys).toEqual([]);
    expect(me.superadmin).toBe(true);
  });
});
