import { MUNICIPALITY_ID } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { HANDLER_ROLES_SETTING } from '@/config/handler-group-roles';
import { ActiveDirectoryController, AdUser } from '@/controllers/active-directory.controller';
import ApiService from '@/services/api.service';

import { mockReq } from './helpers/http';

const manager: AdUser = { name: 'manager', displayName: 'Manager Test', guid: 'manager-id' };
const investigator: AdUser = { name: 'investigator', displayName: 'Investigator Test', guid: 'investigator-id' };
const groupUrl = (group: string) => `${apiServiceName('activedirectory')}/${MUNICIPALITY_ID}/groupmembers/personal/${encodeURIComponent(group)}`;

const managerRole = { key: 'enhetschef', label: 'Enhetschef', group: 'managers' };
const investigatorRole = { key: 'lex-utredare', label: 'LEX-utredare', group: 'investigators' };
const configuredRoles = [managerRole, investigatorRole].map(({ key, label }) => ({ key, label }));

const configureRoles = (...roles: { key: string; label: string; group: string }[]) => vi.stubEnv(HANDLER_ROLES_SETTING, JSON.stringify(roles));

beforeEach(() => {
  vi.stubEnv('DOMAIN', 'personal');
  configureRoles(managerRole, investigatorRole);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('ActiveDirectoryController assignable handlers', () => {
  it('answers the members of every role group with the roles they hold, and the roles in configured order', async () => {
    const get = vi.spyOn(ApiService.prototype, 'get').mockImplementation(async ({ url }) => {
      if (url === groupUrl('managers')) return { data: [{ ...manager, personId: 'excluded', description: 'excluded' }], message: 'ok' };
      if (url === groupUrl('investigators')) return { data: [investigator], message: 'ok' };
      throw new Error(`Unexpected directory group URL: ${url}`);
    });
    const req = mockReq();

    await expect(new ActiveDirectoryController().getAssignableHandlers(req)).resolves.toEqual({
      data: [
        { ...manager, roleKeys: ['enhetschef'] },
        { ...investigator, roleKeys: ['lex-utredare'] },
      ],
      roles: configuredRoles,
      message: 'ok',
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith({ url: groupUrl('managers') }, req.user);
  });

  it('shows an account in several role groups once, holding each of the roles', async () => {
    vi.spyOn(ApiService.prototype, 'get').mockImplementation(async ({ url }) => {
      if (url === groupUrl('managers')) return { data: [manager], message: 'ok' };
      if (url === groupUrl('investigators')) return { data: [{ ...manager, name: 'MANAGER' }, investigator], message: 'ok' };
      throw new Error(`Unexpected directory group URL: ${url}`);
    });

    const { data } = await new ActiveDirectoryController().getAssignableHandlers(mockReq());

    expect(data).toEqual([
      { ...manager, roleKeys: ['enhetschef', 'lex-utredare'] },
      { ...investigator, roleKeys: ['lex-utredare'] },
    ]);
  });

  it('encodes group names as individual URL path segments', async () => {
    configureRoles({ key: 'mas-mar', label: 'MAS/MAR', group: 'MAS/MAR Test' });
    const get = vi.spyOn(ApiService.prototype, 'get').mockResolvedValue({ data: [investigator], message: 'ok' });

    await new ActiveDirectoryController().getAssignableHandlers(mockReq());
    expect(get).toHaveBeenCalledExactlyOnceWith({ url: groupUrl('MAS/MAR Test') }, expect.anything());
  });

  it('keeps a complete list for one hour and then refreshes membership', async () => {
    configureRoles(managerRole);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(ApiService.prototype, 'get')
      .mockResolvedValueOnce({ data: [manager], message: 'ok' })
      .mockResolvedValueOnce({ data: [investigator], message: 'ok' });
    const controller = new ActiveDirectoryController();
    const accounts = async () => (await controller.getAssignableHandlers(mockReq())).data.map(handler => handler.name);

    await expect(accounts()).resolves.toEqual(['manager']);
    vi.advanceTimersByTime(60 * 60 * 1000 - 1);
    await expect(accounts()).resolves.toEqual(['manager']);
    vi.advanceTimersByTime(1);
    await expect(accounts()).resolves.toEqual(['investigator']);
  });

  it('caches an empty directory result too', async () => {
    const get = vi.spyOn(ApiService.prototype, 'get').mockResolvedValue({ data: [], message: 'ok' });
    const controller = new ActiveDirectoryController();

    await expect(controller.getAssignableHandlers(mockReq())).resolves.toEqual({ data: [], roles: configuredRoles, message: 'ok' });
    await expect(controller.getAssignableHandlers(mockReq())).resolves.toEqual({ data: [], roles: configuredRoles, message: 'ok' });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('fails the complete lookup when one group fails and retries without caching a partial list', async () => {
    const failure = new Error('Directory unavailable');
    vi.spyOn(ApiService.prototype, 'get')
      .mockResolvedValueOnce({ data: [manager], message: 'ok' })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ data: [], message: 'ok' })
      .mockResolvedValueOnce({ data: [investigator], message: 'ok' });
    const controller = new ActiveDirectoryController();

    await expect(controller.getAssignableHandlers(mockReq())).rejects.toBe(failure);
    const { data } = await controller.getAssignableHandlers(mockReq());
    expect(data).toEqual([{ ...investigator, roleKeys: ['lex-utredare'] }]);
  });

  it('does not share a cached directory between differently configured controller instances', async () => {
    configureRoles(managerRole);
    vi.spyOn(ApiService.prototype, 'get')
      .mockResolvedValueOnce({ data: [manager], message: 'ok' })
      .mockResolvedValueOnce({ data: [investigator], message: 'ok' });

    const first = await new ActiveDirectoryController().getAssignableHandlers(mockReq());
    configureRoles(investigatorRole);
    const second = await new ActiveDirectoryController().getAssignableHandlers(mockReq());

    expect(first.data).toEqual([{ ...manager, roleKeys: ['enhetschef'] }]);
    expect(second).toEqual({
      data: [{ ...investigator, roleKeys: ['lex-utredare'] }],
      roles: [{ key: 'lex-utredare', label: 'LEX-utredare' }],
      message: 'ok',
    });
  });

  it('refuses to start without handler roles', () => {
    vi.stubEnv(HANDLER_ROLES_SETTING, undefined);
    expect(() => new ActiveDirectoryController()).toThrow(`${HANDLER_ROLES_SETTING} must be set`);
  });
});
