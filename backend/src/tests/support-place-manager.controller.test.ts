import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  PlaceManagerLookupDto,
  PlaceManagerPlacesDto,
  SupportPlaceManagerController,
} from '@/controllers/supportmanagement/support-place-manager.controller';
import { AccessAccessLevelEnum, type AccessUser } from '@/data-contracts/access-mapper/data-contracts';
import type { Label } from '@/data-contracts/supportmanagement/data-contracts';

import { mockReq } from './helpers/http';
import { mockAdUsername, mockMunicipalityId, mockSupportNamespace } from './helpers/mock-data';

const MUNICIPALITY_ID = mockMunicipalityId;
const NAMESPACE = mockSupportNamespace;
const NEW_MANAGER = 'new01man';

const label = (id: string, classification: string, resourcePath: string, displayName: string, labels?: Label[]): Label => ({
  id,
  classification,
  resourcePath,
  resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
  displayName,
  ...(labels ? { labels } : {}),
});

const labelStructure: Label[] = [
  label('location-root', 'location-root', 'LOCATION', 'Platsstruktur', [
    label('north', 'location', 'LOCATION/NORTH', 'Norr', [
      label('north-home', 'location', 'LOCATION/NORTH/HOME', 'Norra hemtjänsten'),
      label('north-housing', 'location', 'LOCATION/NORTH/HOUSING', 'Norra boendet'),
    ]),
    label('south', 'location', 'LOCATION/SOUTH', 'Söder', [label('south-home', 'location', 'LOCATION/SOUTH/HOME', 'Södra hemtjänsten')]),
  ]),
  label('category-root', 'category-root', 'CATEGORY', 'Kategori', [label('category-hsl', 'category', 'CATEGORY/HSL', 'HSL')]),
];

const readWrite = (pattern: string) => ({ pattern, accessLevel: AccessAccessLevelEnum.RW });
const accessUser = (id: string, userId: string, origin: string, patterns: string[]): AccessUser => ({
  id,
  userId,
  origin,
  accessByType: [{ type: 'label', access: patterns.map(readWrite) }],
});

const seededAccessUsers = (): AccessUser[] => [
  // Written in upper case, as a quarter of the seeded entries are.
  accessUser('entry-north', mockAdUsername.toUpperCase(), 'AUTOMATIC', ['LOCATION/NORTH/HOME/**', 'CATEGORY/HSL/**']),
  accessUser('entry-area', 'area01man', 'MANUAL', ['LOCATION/SOUTH/**']),
  accessUser('entry-category', 'cat01egory', 'AUTOMATIC', ['CATEGORY/HSL/**']),
];

const makeController = ({ administersPlaceManagers = true, accessUsers = seededAccessUsers() } = {}) => {
  const controller = new SupportPlaceManagerController();
  const stubs = {
    get: vi.fn(async (config: { url?: string }) => {
      if (config.url === `${MUNICIPALITY_ID}/${NAMESPACE}/metadata`) return { data: { labels: { labelStructure } }, message: 'success' };
      if (config.url?.endsWith(`/access/ad/${mockAdUsername}`)) {
        return {
          data: [{ accessByType: [{ type: 'role', access: [{ pattern: 'UNIT_MANAGER' }, { pattern: 'SOMETHING_ELSE' }] }] }],
          message: 'success',
        };
      }
      if (config.url?.includes('/access/ad/')) return { data: [], message: 'success' };
      throw new Error(`Unexpected GET ${config.url}`);
    }),
    listAccessUsers: vi.fn(async () => accessUsers),
    createAccessUser: vi.fn(async () => undefined),
    updateAccessUser: vi.fn(async () => undefined),
    deleteAccessUser: vi.fn(async () => undefined),
    lookupDisplayNames: vi.fn(
      async () =>
        new Map([
          [mockAdUsername, 'Nora Norr'],
          [NEW_MANAGER, 'Nils Ny'],
        ]),
    ),
  };

  const internals = controller as unknown as Record<string, unknown>;
  internals.namespace = NAMESPACE;
  internals.apiService = { get: stubs.get };
  internals.accessMapperService = {
    listAccessUsers: stubs.listAccessUsers,
    createAccessUser: stubs.createAccessUser,
    updateAccessUser: stubs.updateAccessUser,
    deleteAccessUser: stubs.deleteAccessUser,
  };
  internals.handlerDirectory = { lookupDisplayNames: stubs.lookupDisplayNames };
  internals.investigationPolicyService = { iafVofClassificationPolicy: administersPlaceManagers ? {} : undefined };

  return { controller, stubs };
};

const validationOptions = { whitelist: true, forbidNonWhitelisted: true };

describe('the request bodies', () => {
  it('take lists of accounts and of place label ids', async () => {
    await expect(validate(plainToInstance(PlaceManagerLookupDto, { adAccounts: [mockAdUsername] }), validationOptions)).resolves.toEqual([]);
    await expect(validate(plainToInstance(PlaceManagerPlacesDto, { add: ['north-home'], remove: [] }), validationOptions)).resolves.toEqual([]);
  });

  it('refuse anything else', async () => {
    const invalid = [
      plainToInstance(PlaceManagerLookupDto, { adAccounts: [''] }),
      plainToInstance(PlaceManagerLookupDto, { adAccounts: mockAdUsername }),
      plainToInstance(PlaceManagerPlacesDto, { add: ['north-home'] }),
      plainToInstance(PlaceManagerPlacesDto, { add: [], remove: [7] }),
      plainToInstance(PlaceManagerPlacesDto, { add: [], remove: [], role: 'UNIT_MANAGER' }),
    ];

    for (const body of invalid) expect(await validate(body, validationOptions)).not.toEqual([]);
  });
});

describe('getAssignments', () => {
  it('answers with the places each person has, and the manager roles in display order', async () => {
    const { controller, stubs } = makeController();

    const response = await controller.getAssignments(mockReq(), MUNICIPALITY_ID);

    expect(stubs.listAccessUsers).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, NAMESPACE);
    expect(response).toEqual({
      assignments: [
        { adAccount: mockAdUsername.toUpperCase(), origin: 'AUTOMATIC', placePaths: ['LOCATION/NORTH/HOME'] },
        { adAccount: 'area01man', origin: 'MANUAL', placePaths: ['LOCATION/SOUTH'] },
      ],
      roles: [
        { key: 'UNIT_MANAGER', label: 'Enhetschef' },
        { key: 'HEAD_OF_OPERATIONS', label: 'Verksamhetschef' },
      ],
    });
  });

  it('is not offered by an application that has no place managers to set', async () => {
    const { controller, stubs } = makeController({ administersPlaceManagers: false });

    await expect(controller.getAssignments(mockReq(), MUNICIPALITY_ID)).rejects.toMatchObject({ status: 404 });
    await expect(controller.lookupPeople(mockReq(), MUNICIPALITY_ID, { adAccounts: [mockAdUsername] })).rejects.toMatchObject({ status: 404 });
    await expect(controller.changePlaces(mockReq(), MUNICIPALITY_ID, mockAdUsername, { add: ['north-home'], remove: [] })).rejects.toMatchObject({
      status: 404,
    });
    expect(stubs.listAccessUsers).not.toHaveBeenCalled();
    expect(stubs.get).not.toHaveBeenCalled();
  });
});

describe('lookupPeople', () => {
  it('names each account once and says which manager roles it holds', async () => {
    const { controller } = makeController();

    const response = await controller.lookupPeople(mockReq(), MUNICIPALITY_ID, {
      adAccounts: [mockAdUsername, ` ${mockAdUsername.toUpperCase()} `, 'unknown01'],
    });

    expect(response).toEqual({
      people: [
        // The last spelling of an account is the one answered for; the role lookup does not care about case.
        { adAccount: mockAdUsername.toUpperCase(), displayName: 'Nora Norr', roleKeys: [] },
        { adAccount: 'unknown01', roleKeys: [] },
      ],
    });
  });

  it('reports the manager roles and leaves out roles that are not a manager', async () => {
    const { controller } = makeController();

    const response = await controller.lookupPeople(mockReq(), MUNICIPALITY_ID, { adAccounts: [mockAdUsername] });

    expect(response.people).toEqual([{ adAccount: mockAdUsername, displayName: 'Nora Norr', roleKeys: ['UNIT_MANAGER'] }]);
  });
});

describe('changePlaces', () => {
  it('gives a unit to a person who already has places, by replacing their entry', async () => {
    const { controller, stubs } = makeController();

    const response = await controller.changePlaces(mockReq(), MUNICIPALITY_ID, mockAdUsername, { add: ['north-housing'], remove: [] });

    expect(stubs.updateAccessUser).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, NAMESPACE, 'entry-north', {
      userId: mockAdUsername.toUpperCase(),
      origin: 'MANUAL',
      accessByType: [
        { type: 'label', access: [readWrite('LOCATION/NORTH/HOME/**'), readWrite('CATEGORY/HSL/**'), readWrite('LOCATION/NORTH/HOUSING/**')] },
      ],
    });
    expect(stubs.createAccessUser).not.toHaveBeenCalled();
    expect(response).toEqual({
      adAccount: mockAdUsername.toUpperCase(),
      origin: 'MANUAL',
      placePaths: ['LOCATION/NORTH/HOME', 'LOCATION/NORTH/HOUSING'],
    });
  });

  it('gives an area as one pattern per unit, to a person who is new to AccessMapper but known to the directory', async () => {
    const { controller, stubs } = makeController();

    const response = await controller.changePlaces(mockReq(), MUNICIPALITY_ID, NEW_MANAGER.toUpperCase(), { add: ['north'], remove: [] });

    expect(stubs.lookupDisplayNames).toHaveBeenCalledWith(expect.anything(), [NEW_MANAGER]);
    expect(stubs.createAccessUser).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, NAMESPACE, {
      userId: NEW_MANAGER,
      origin: 'MANUAL',
      accessByType: [{ type: 'label', access: [readWrite('LOCATION/NORTH/HOME/**'), readWrite('LOCATION/NORTH/HOUSING/**')] }],
    });
    expect(response.placePaths).toEqual(['LOCATION/NORTH/HOME', 'LOCATION/NORTH/HOUSING']);
  });

  it('refuses a new account the directory does not know, before anything is written', async () => {
    const { controller, stubs } = makeController();

    await expect(controller.changePlaces(mockReq(), MUNICIPALITY_ID, 'typo01', { add: ['north-home'], remove: [] })).rejects.toMatchObject({
      status: 400,
    });
    expect(stubs.createAccessUser).not.toHaveBeenCalled();
  });

  it('removes the entry of a person whose last place is taken away', async () => {
    const { controller, stubs } = makeController({
      accessUsers: [accessUser('entry-north', mockAdUsername, 'AUTOMATIC', ['LOCATION/NORTH/HOME/**'])],
    });

    const response = await controller.changePlaces(mockReq(), MUNICIPALITY_ID, mockAdUsername, { add: [], remove: ['north-home'] });

    expect(stubs.deleteAccessUser).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, NAMESPACE, 'entry-north');
    expect(stubs.updateAccessUser).not.toHaveBeenCalled();
    expect(response).toEqual({ adAccount: mockAdUsername, origin: '', placePaths: [] });
  });

  it('takes an area away from a person who holds it as one pattern on the area', async () => {
    const { controller, stubs } = makeController();

    await controller.changePlaces(mockReq(), MUNICIPALITY_ID, 'area01man', { add: [], remove: ['south'] });

    expect(stubs.deleteAccessUser).toHaveBeenCalledWith(expect.anything(), MUNICIPALITY_ID, NAMESPACE, 'entry-area');
  });

  it('writes nothing when nothing changes, and needs no directory for it', async () => {
    const { controller, stubs } = makeController();

    const response = await controller.changePlaces(mockReq(), MUNICIPALITY_ID, mockAdUsername, { add: ['north-home'], remove: ['south-home'] });

    expect(stubs.updateAccessUser).not.toHaveBeenCalled();
    expect(stubs.lookupDisplayNames).not.toHaveBeenCalled();
    expect(response).toEqual({ adAccount: mockAdUsername.toUpperCase(), origin: 'AUTOMATIC', placePaths: ['LOCATION/NORTH/HOME'] });
  });

  it('refuses a label that is not a place before reading anybody', async () => {
    const { controller, stubs } = makeController();

    await expect(controller.changePlaces(mockReq(), MUNICIPALITY_ID, mockAdUsername, { add: ['category-hsl'], remove: [] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(controller.changePlaces(mockReq(), MUNICIPALITY_ID, ' ', { add: ['north-home'], remove: [] })).rejects.toMatchObject({
      status: 400,
    });
    expect(stubs.listAccessUsers).not.toHaveBeenCalled();
  });

  it('fails rather than guesses when AccessMapper returns an entry without an id', async () => {
    const { controller, stubs } = makeController({
      accessUsers: [{ ...accessUser('', mockAdUsername, 'AUTOMATIC', ['LOCATION/NORTH/HOME/**']), id: undefined }],
    });

    await expect(controller.changePlaces(mockReq(), MUNICIPALITY_ID, mockAdUsername, { add: ['north-housing'], remove: [] })).rejects.toMatchObject({
      status: 502,
    });
    expect(stubs.updateAccessUser).not.toHaveBeenCalled();
  });
});
