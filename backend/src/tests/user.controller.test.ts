import { resolveHandlerGroupRoles } from '@/config/handler-group-roles';
import { UserController } from '@/controllers/user.controller';

import { mockReq, mockRes, mockUser } from './helpers/http';
import {
  MOCK_SUPERADMIN_GROUP,
  MOCK_UNIT_MANAGER_GROUP,
  mockAdUsername,
  mockCity,
  mockEmail,
  mockFirstName,
  mockLastName,
  mockPhoneNumber,
  mockStreet,
} from './helpers/mock-data';

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

const readEmployeeName = async (adaccount: string, person: Record<string, unknown>) => {
  const controller = new UserController();
  const get = vi.fn().mockResolvedValue({ data: person, message: 'success' });
  (controller as unknown as { apiService: { get: typeof get } }).apiService = { get };
  const body = await controller.getEmployeeName(mockReq(), adaccount);
  return { body, url: get.mock.calls[0][0].url as string };
};

describe('UserController.getEmployeeName', () => {
  it('answers with the name and nothing else of the portal profile', async () => {
    const { body } = await readEmployeeName(mockAdUsername, {
      givenname: mockFirstName,
      lastname: mockLastName,
      fullname: `${mockFirstName} ${mockLastName}`,
      address: mockStreet,
      city: mockCity,
      mobilePhone: mockPhoneNumber,
      email: mockEmail,
    });

    expect(body).toEqual({ data: { name: `${mockFirstName} ${mockLastName}` }, message: 'success' });
  });

  it('falls back to the full name, and to null when Employee holds no name', async () => {
    expect((await readEmployeeName(mockAdUsername, { fullname: mockFirstName })).body.data.name).toBe(mockFirstName);
    expect((await readEmployeeName(mockAdUsername, {})).body.data.name).toBeNull();
  });

  it('keeps the account to one path segment of the Employee URL', async () => {
    const { url } = await readEmployeeName('../other', { givenname: mockFirstName });

    expect(url.endsWith('/portalpersondata/PERSONAL/..%2Fother')).toBe(true);
  });
});

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
