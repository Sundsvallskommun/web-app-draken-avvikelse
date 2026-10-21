import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { HandlerGroupRole } from '@/config/handler-group-roles';
import { Measure, MetadataResponse } from '@/data-contracts/supportmanagement/data-contracts';
import { CreateSupportMeasureDto, DecideSupportMeasureDto, FollowUpSupportMeasureDto, UpdateSupportMeasureDto } from '@/dtos/support-measure.dto';
import { HttpException } from '@/exceptions/HttpException';
import ApiService from '@/services/api.service';
import { MEASURE_ACCESS_RESOURCE, SupportInvestigationAccessService } from '@/services/support-investigation-access.service';
import { SupportMeasureService } from '@/services/support-measure.service';

import { mockUser } from './helpers/http';
import { mockMunicipalityId, mockSupportErrandId } from './helpers/mock-data';

const user = mockUser({ groups: ['AD-MANAGER'] });
const handlerRoles: HandlerGroupRole[] = [
  { key: 'manager', label: 'Enhetschef', group: 'ad-manager', measures: { roleName: 'MANAGER', measureGroup: 'PREVENTIVE', decides: true } },
  { key: 'nurse', label: 'HSL', group: 'ad-nurse', measures: { roleName: 'NURSE', measureGroup: 'CLINICAL', decides: false } },
];
const proposingRoles: HandlerGroupRole[] = handlerRoles.map(role => ({ ...role, measures: { ...role.measures!, decides: false } }));
/** A registration role the namespace metadata does not know, which makes the registration policy invalid. */
const invalidRoles: HandlerGroupRole[] = [
  { key: 'unknown', label: 'Okänd', group: 'ad-manager', measures: { roleName: 'UNKNOWN', measureGroup: 'PREVENTIVE', decides: true } },
];
const educationId = 'dd000000-0000-4000-8000-000000000100';
const oldTypeId = 'dd000000-0000-4000-8000-000000000101';
const metadata: MetadataResponse = {
  measureTypes: [
    { id: educationId, name: 'EDUCATION', displayName: 'Utbildning', measureGroups: ['PREVENTIVE'] },
    { id: oldTypeId, name: 'OLD', measureGroups: ['PREVENTIVE'], deprecated: true },
  ],
  roles: [
    { name: 'NURSE', displayName: 'HSL', sortOrder: 2 },
    { name: 'MANAGER', displayName: 'Enhetschef', sortOrder: 1 },
    { name: 'RETIRED', displayName: 'Tidigare roll', deprecated: true },
  ],
};
const current = { version: 7, status: 'ONGOING' };
const measure: Measure = {
  id: 'measure-1',
  type: 'OLD',
  version: 3,
  goal: 'Existing goal',
  addedByRole: 'MANAGER',
  addedByUser: mockUser().username,
};
const response = <T>(data: T) => ({ data, message: 'success' });
const newMeasure: CreateSupportMeasureDto = {
  type: 'EDUCATION',
  addedByRole: 'MANAGER',
  description: 'Gemensam utbildning',
  goal: 'Säkrare arbetssätt',
  executed: '2026-09-08T12:00:00+02:00',
};

const plannedProposal: CreateSupportMeasureDto = {
  type: 'EDUCATION',
  addedByRole: 'MANAGER',
  description: 'Gemensam utbildning',
  goal: 'Säkrare arbetssätt',
  plannedStart: '2026-09-08T12:00:00+02:00',
  plannedComplete: '2026-09-10T12:00:00+02:00',
};

const followUp: FollowUpSupportMeasureDto = { desiredEffectAchieved: false, followUpDescription: 'Ingen förbättring ännu.' };
test.each([
  { desiredEffectAchieved: undefined },
  { desiredEffectAchieved: null },
  { desiredEffectAchieved: 'false' },
  { followUpDescription: undefined },
  { followUpDescription: '  ' },
  { followUpDescription: 'x'.repeat(4001) },
  { description: 'Ersätt originalet' },
  { executed: '2026-09-09T00:00:00Z' },
  { accept: 'TRUE' },
  { result: 'COMPLETED' },
  { resultText: 'Direkt till åtgärden' },
  { completedAt: '2026-09-09T00:00:00Z' },
])('follow-up contract rejects missing answers and fields from other workflows: %j', async fields => {
  const errors = await validate(plainToInstance(FollowUpSupportMeasureDto, { ...followUp, ...fields }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  expect(errors.length).toBeGreaterThan(0);
});

test.each([false, true])('follow-up accepts the explicit boolean answer %s', async desiredEffectAchieved => {
  expect(
    await validate(plainToInstance(FollowUpSupportMeasureDto, { ...followUp, desiredEffectAchieved }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  ).toEqual([]);
});

afterEach(() => vi.restoreAllMocks());

function setup(roles: readonly HandlerGroupRole[] = handlerRoles) {
  const api = new ApiService();
  const get = vi.spyOn(api, 'get').mockImplementation(async config => response(config.url?.endsWith('/metadata') ? metadata : current));
  const patch = vi.spyOn(api, 'patch').mockResolvedValue(response(undefined));
  const post = vi.spyOn(api, 'post').mockResolvedValue(response(undefined));
  const remove = vi.spyOn(api, 'delete').mockResolvedValue(response(undefined));
  // Support Management's answer on the measures resource, which alone decides whether they are writable.
  const access = { getResourceLevel: vi.fn<SupportInvestigationAccessService['getResourceLevel']>(async () => 'RW') };
  const service = new SupportMeasureService(api, roles, 'ad-superadmins', access as unknown as SupportInvestigationAccessService);
  return { service, get, patch, post, remove, access };
}

test('reads protected measures with their own versions', async () => {
  const { service, get, access } = setup();
  get.mockResolvedValueOnce(response([measure])).mockResolvedValueOnce(response(metadata));
  expect(await service.read(mockMunicipalityId, mockSupportErrandId, user)).toEqual({
    measures: [measure],
    metadata,
    creationRoles: [metadata.roles![1]],
    registration: {
      status: 'ready',
      roleTypes: [
        { roleName: 'MANAGER', measureTypes: ['EDUCATION'], decides: true },
        { roleName: 'NURSE', measureTypes: [], decides: false },
      ],
    },
    canWrite: true,
    // The catalogue names roles, and this user holds neither of the unit's managers' roles.
    mayFollowUp: false,
    // The measure is still a proposal, so it holds the errand from the follow-up and from closing.
    closeRefusal: expect.stringMatching(/^Ärendet kan inte avslutas/u),
    followUpRefusal: expect.stringMatching(/^Ärendet kan inte gå vidare till uppföljning/u),
  });
  // The measures and the metadata: a follow-up is part of the measure, not a document of its own.
  expect(get).toHaveBeenCalledTimes(2);
  expect(get.mock.calls[0][0]).toMatchObject({
    url: expect.stringContaining('/errands/' + mockSupportErrandId + '/measures'),
    propagateClientError: true,
  });
  expect(access.getResourceLevel).toHaveBeenCalledWith(user, mockMunicipalityId, mockSupportErrandId, MEASURE_ACCESS_RESOURCE);
});

// The role catalogue says how a writer registers; whether anyone may write is Support Management's call.
test.each([
  ['R', false],
  ['LR', false],
  [undefined, false],
] as const)('offers no writes when Support Management grants %s on the measures', async (level, canWrite) => {
  const { service, get, access } = setup();
  access.getResourceLevel.mockResolvedValueOnce(level);
  get.mockResolvedValueOnce(response([measure])).mockResolvedValueOnce(response(metadata));
  const snapshot = await service.read(mockMunicipalityId, mockSupportErrandId, user);
  expect(snapshot.canWrite).toBe(canWrite);
  expect(snapshot.creationRoles).toEqual([metadata.roles![1]]);
});

test('keeps the measures readable but offers no writes when the access lookup fails', async () => {
  const { service, get, access } = setup();
  access.getResourceLevel.mockRejectedValueOnce(new HttpException(503, 'Unavailable'));
  get.mockResolvedValueOnce(response([measure])).mockResolvedValueOnce(response(metadata));
  const snapshot = await service.read(mockMunicipalityId, mockSupportErrandId, user);
  expect(snapshot.measures).toEqual([measure]);
  expect(snapshot.canWrite).toBe(false);
});

// The client disables closing on the very refusal the close would get, so the two cannot disagree.
test('says why the errand cannot be closed while a measure is unhandled', async () => {
  const proposal: Measure = { ...measure, id: 'proposal', accept: undefined };
  const { service, get } = setup();
  get.mockResolvedValueOnce(response([proposal])).mockResolvedValueOnce(response(metadata));

  const snapshot = await service.read(mockMunicipalityId, mockSupportErrandId, user);

  expect(snapshot.closeRefusal).toBe('Ärendet kan inte avslutas förrän alla åtgärder är hanterade: 1 åtgärd väntar på beslut.');
  // Ä13. The same proposal keeps the errand from the follow-up, and the snapshot says so in the refusal's words.
  expect(snapshot.followUpRefusal).toBe(
    'Ärendet kan inte gå vidare till uppföljning förrän alla åtgärdsförslag är bedömda: 1 förslag väntar på att godkännas, delvis godkännas eller avslås.',
  );
});

test('names no close refusal once every measure is handled', async () => {
  const rejected: Measure = { ...measure, accept: 'FALSE' };
  const { service, get } = setup();
  get.mockResolvedValueOnce(response([rejected])).mockResolvedValueOnce(response(metadata));
  const decided = await service.read(mockMunicipalityId, mockSupportErrandId, user);
  expect(decided).not.toHaveProperty('closeRefusal');
  expect(decided).not.toHaveProperty('followUpRefusal');
});

test('propagates denied access instead of showing a falsely empty list', async () => {
  const { service, get } = setup();
  get.mockRejectedValueOnce(new HttpException(403, 'Denied'));
  await expect(service.read(mockMunicipalityId, mockSupportErrandId, user)).rejects.toMatchObject({ status: 403 });
});

test('creates through the protected resource with the authenticated creator', async () => {
  const { service, post } = setup();
  await service.create(mockMunicipalityId, mockSupportErrandId, newMeasure, user);
  expect(post.mock.calls[0]).toEqual([
    expect.objectContaining({
      url: expect.stringContaining('/errands/' + mockSupportErrandId + '/measures'),
      data: { ...newMeasure, accept: 'TRUE', addedByUser: user.username },
      followLocation: false,
      propagateClientError: true,
    }),
    user,
  ]);
  expect(post.mock.calls[0][0].headers).toBeUndefined();
  expect(post.mock.calls[0][0].data).toHaveProperty('addedByUser', user.username);
});

test.each([400, 403])('propagates API role/type validation failures (%s)', async status => {
  const { service, post } = setup();
  post.mockRejectedValueOnce(new HttpException(status, 'Registration rejected'));
  await expect(service.create(mockMunicipalityId, mockSupportErrandId, newMeasure, user)).rejects.toMatchObject({ status });
});

test('does not create in a locked errand', async () => {
  const { service, get, post } = setup();
  get.mockResolvedValueOnce(response({ ...current, status: 'SOLVED' }));
  await expect(service.create(mockMunicipalityId, mockSupportErrandId, newMeasure, user)).rejects.toMatchObject({ status: 409 });
  expect(post).not.toHaveBeenCalled();
});

test.each([
  [[], 'unconfigured'],
  [invalidRoles, 'invalid'],
] as const)('reads history when registration configuration is absent or invalid: %j', async (roles, expectedStatus) => {
  const { service, get } = setup(roles);
  get.mockResolvedValueOnce(response([measure])).mockResolvedValueOnce(response(metadata));
  const snapshot = await service.read(mockMunicipalityId, mockSupportErrandId, user);
  expect(snapshot.measures).toEqual([measure]);
  expect(snapshot.creationRoles).toEqual([]);
  expect(snapshot.registration.status).toBe(expectedStatus);
});

const plannedOnErrand = (errandId: string, errandNumber: string, ...measures: Measure[]) => ({
  id: errandId,
  errandNumber,
  title: 'Fallskada',
  status: 'ONGOING',
  measures,
});
const openPlanned = (id: string, plannedComplete: string): Measure => ({ ...measure, id, accept: 'TRUE', plannedComplete });

test('reads open planned measures across the errands upstream grants, one page at a time, with the errand attached', async () => {
  const { service, get } = setup();
  const pageUrls: string[] = [];
  get.mockImplementation(async config => {
    if (config.url?.endsWith('/metadata')) return response(metadata);
    pageUrls.push(config.url ?? '');
    const page = Number(new URL('http://x/' + config.url).searchParams.get('page'));
    return response(
      page === 0
        ? {
            content: [plannedOnErrand('e1', 'VOF-2026-0001', openPlanned('later', '2026-11-01T00:00:00Z'), { ...measure, id: 'proposal' })],
            last: false,
          }
        : { content: [plannedOnErrand('e2', 'VOF-2026-0002', openPlanned('soon', '2026-09-20T00:00:00Z'))], last: true },
    );
  });
  const snapshot = await service.readPlanned(mockMunicipalityId, user);
  expect(snapshot.measures.map(planned => [planned.id, planned.errand.errandNumber])).toEqual([
    ['soon', 'VOF-2026-0002'],
    ['later', 'VOF-2026-0001'],
  ]);
  // The errand's title is left out: the overview does not show it.
  expect(snapshot.measures[0].errand).toEqual({ id: 'e2', errandNumber: 'VOF-2026-0002', status: 'ONGOING' });
  expect(snapshot.metadata).toEqual(metadata);
  expect(snapshot.truncated).toBe(false);
  expect(pageUrls).toHaveLength(2);
  const query = new URL('http://x/' + pageUrls[0]).searchParams;
  expect(pageUrls[0]).toMatch(/\/errands\?/);
  expect(query.get('filter')).toBe(
    "(measures.accept:'TRUE' or measures.accept:'REWORK') and measures.executed is null" +
      " and (measures.plannedStart is not null or measures.plannedComplete is not null) and status!'SOLVED'",
  );
  expect(query.get('size')).toBe('100');
  expect(query.get('sort')).toBe('created,asc');
  expect(new URL('http://x/' + pageUrls[1]).searchParams.get('page')).toBe('1');
  expect(get.mock.calls[0][0]).toMatchObject({ propagateClientError: true, mapUnauthorizedToForbidden: true });
  expect(get.mock.calls[0][1]).toBe(user);
});

test('stops walking pages at the cap and says the overview is incomplete', async () => {
  const { service, get } = setup();
  get.mockImplementation(async config =>
    response(
      config.url?.endsWith('/metadata')
        ? metadata
        : { content: [plannedOnErrand('e', 'VOF-2026-0001', openPlanned('m', '2026-09-20T00:00:00Z'))], last: false },
    ),
  );
  const snapshot = await service.readPlanned(mockMunicipalityId, user);
  expect(snapshot.truncated).toBe(true);
  expect(snapshot.measures).toHaveLength(1);
  expect(get.mock.calls.filter(([config]) => config.url?.includes('/errands?'))).toHaveLength(10);
});

test('stops on an empty page even when upstream does not flag it as the last one', async () => {
  const { service, get } = setup();
  get.mockImplementation(async config => response(config.url?.endsWith('/metadata') ? metadata : { content: [], last: false }));
  const snapshot = await service.readPlanned(mockMunicipalityId, user);
  expect(snapshot).toEqual({ measures: [], metadata, truncated: false });
  expect(get).toHaveBeenCalledTimes(2);
});

test('propagates denied access to the planned overview instead of showing it as empty', async () => {
  const { service, get } = setup();
  get.mockRejectedValueOnce(new HttpException(403, 'Denied'));
  await expect(service.readPlanned(mockMunicipalityId, user)).rejects.toMatchObject({ status: 403 });
});

test('edits historic proposals with the original measure ETag while preserving attribution', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'Revised' }, user);
  expect(patch.mock.calls[0]).toEqual([
    expect.objectContaining({
      url: expect.stringContaining('/measures/measure-1'),
      data: { goal: 'Revised' },
      headers: { 'If-Match': '"3"' },
      followLocation: false,
      propagateClientError: true,
    }),
    user,
  ]);
});

test('changes type by its metadata name, never by its display name', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { type: 'EDUCATION' }, user);
  expect(patch.mock.calls[0][0].data).toEqual({ type: 'EDUCATION' });
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await expect(service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { type: 'Utbildning' }, user)).rejects.toMatchObject({
    status: 400,
  });
  expect(patch).toHaveBeenCalledOnce();
});

test('allows an unchanged historic type', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { type: 'OLD', goal: 'Revised' }, user);
  expect(patch.mock.calls[0][0].data).toEqual({ type: 'OLD', goal: 'Revised' });
});

test.each(['SOLVED', 'SUSPENDED', 'ASSIGNED', 'REOPENED'])('rejects writes in locked status %s', async status => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response({ ...current, status }));
  await expect(service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'Revised' }, user)).rejects.toMatchObject({
    status: 409,
  });
  expect(patch).not.toHaveBeenCalled();
});

test('rejects a stale measure version before writing', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await expect(service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"2"', { goal: 'Revised' }, user)).rejects.toMatchObject({
    status: 412,
  });
  expect(patch).not.toHaveBeenCalled();
});

test('allows intervening parent edits without substituting the measure version', async () => {
  const { service, get, patch } = setup();
  get
    .mockResolvedValueOnce(response(current))
    .mockResolvedValueOnce(response(measure))
    .mockResolvedValueOnce(response({ ...current, version: 19 }));
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'Revised' }, user);
  expect(patch.mock.calls[0][0].headers).toEqual({ 'If-Match': '"3"' });
});

test('propagates a conflict that occurs between reading and writing the measure', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  patch.mockRejectedValueOnce(new HttpException(412, 'Measure changed'));
  await expect(service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'Revised' }, user)).rejects.toMatchObject({
    status: 412,
  });
});

test('rejects an errand locked during dependent reads', async () => {
  const { service, get, patch } = setup();
  get
    .mockResolvedValueOnce(response(current))
    .mockResolvedValueOnce(response(measure))
    .mockResolvedValueOnce(response({ ...current, status: 'SOLVED' }));
  await expect(service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'Revised' }, user)).rejects.toMatchObject({
    status: 409,
  });
  expect(patch).not.toHaveBeenCalled();
});

test.each([undefined, '3', 'W/"3"', '*', '"3", "4"', `"${Number.MAX_SAFE_INTEGER + 1}"`])('rejects absent or invalid If-Match %s', async ifMatch => {
  const { service, get, patch } = setup();
  await expect(service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', ifMatch, { goal: 'Revised' }, user)).rejects.toMatchObject({
    status: ifMatch === undefined ? 428 : 400,
  });
  expect(get).not.toHaveBeenCalled();
  expect(patch).not.toHaveBeenCalled();
});

test('rejects upstream responses without a measure version', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, version: undefined }));
  await expect(service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'Revised' }, user)).rejects.toMatchObject({
    status: 502,
  });
  expect(patch).not.toHaveBeenCalled();
});

test.each([
  { type: ' ' },
  { type: null },
  { measureTypeId: educationId },
  { version: 3 },
  { accept: 'TRUE' },
  { addedByUser: 'someone-else' },
  { addedByRole: 'MANAGER' },
  { reworkGoal: 'Bypass' },
  { result: 'COMPLETED' },
  { resultText: 'Uppföljning utan uppföljningsflödet' },
  { id: 'other-id' },
  { plannedStart: null },
  { plannedStart: 'invalid' },
])('rejects read-only or invalid edits: %j', async body => {
  const errors = await validate(plainToInstance(UpdateSupportMeasureDto, body), { whitelist: true, forbidNonWhitelisted: true });
  expect(errors.length).toBeGreaterThan(0);
});

test('accepts a type name and basic fields in a narrow patch', async () => {
  const errors = await validate(plainToInstance(UpdateSupportMeasureDto, { type: 'EDUCATION', goal: 'Revised' }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  expect(errors).toEqual([]);
});

test.each([
  { type: undefined },
  { type: ' ' },
  { measureTypeId: educationId },
  { addedByRole: undefined },
  { addedByRole: null },
  { addedByRole: ' ' },
  { description: undefined },
  { goal: ' ' },
  { addedByUser: 'someone-else' },
  { version: 3 },
  { accept: 'TRUE' },
  { plannedStart: null },
])('rejects missing, invalid or browser-supplied audit fields on creation: %j', async fields => {
  const errors = await validate(plainToInstance(CreateSupportMeasureDto, { ...newMeasure, ...fields }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  expect(errors.length).toBeGreaterThan(0);
});

test('accepts the creation contract with a role name and without browser-supplied creator', async () => {
  expect(await validate(plainToInstance(CreateSupportMeasureDto, newMeasure), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
});

test('rejects a role the current session groups do not grant', async () => {
  const { service, post } = setup();
  await expect(service.create(mockMunicipalityId, mockSupportErrandId, { ...newMeasure, addedByRole: 'NURSE' }, user)).rejects.toMatchObject({
    status: 403,
  });
  expect(post).not.toHaveBeenCalled();
});

test('rejects an active type outside the selected role configuration', async () => {
  const { service, post } = setup();
  const nurse = mockUser({ groups: ['ad-nurse'] });
  await expect(service.create(mockMunicipalityId, mockSupportErrandId, { ...newMeasure, addedByRole: 'NURSE' }, nurse)).rejects.toMatchObject({
    status: 400,
  });
  expect(post).not.toHaveBeenCalled();
});

test('does not infer namespace roles by comparing group text to role names', async () => {
  const { service, get } = setup();
  get.mockResolvedValueOnce(response([measure])).mockResolvedValueOnce(response(metadata));
  const snapshot = await service.read(mockMunicipalityId, mockSupportErrandId, mockUser({ groups: ['MANAGER'] }));
  expect(snapshot.creationRoles).toEqual([]);
});

test('preserves a historical measure when registration is not configured', async () => {
  const { service, get, patch } = setup([]);
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'Revised' }, user);
  expect(patch).toHaveBeenCalledOnce();
});

test('checks type changes against the saved role, independently of the editor role', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { type: 'EDUCATION' }, mockUser({ groups: ['ad-nurse'] }));
  expect(patch.mock.calls[0][0].data).toEqual({ type: 'EDUCATION' });
});

test('rejects an effective date range that reverses the stored start and new completion', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, plannedStart: '2026-09-10T00:00:00Z' }));
  await expect(
    service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { plannedComplete: '2026-09-09T00:00:00Z' }, user),
  ).rejects.toMatchObject({ status: 400 });
  expect(patch).not.toHaveBeenCalled();
});

test("accepts a deciding role's own measure on creation and leaves other roles' measures as proposals", async () => {
  const deciding = setup();
  await deciding.service.create(mockMunicipalityId, mockSupportErrandId, newMeasure, user);
  expect(deciding.post.mock.calls[0][0].data).toMatchObject({ addedByRole: 'MANAGER', accept: 'TRUE' });

  const proposing = setup(proposingRoles);
  await proposing.service.create(mockMunicipalityId, mockSupportErrandId, plannedProposal, user);
  expect(proposing.post.mock.calls[0][0].data).not.toHaveProperty('accept');
});

test('rejects executed measures from a proposing role on creation', async () => {
  const { service, post } = setup(proposingRoles);
  await expect(service.create(mockMunicipalityId, mockSupportErrandId, newMeasure, user)).rejects.toMatchObject({ status: 400 });
  expect(post).not.toHaveBeenCalled();
});

test('lets a proposal be reported as executed only once it is accepted', async () => {
  const pending = setup(proposingRoles);
  pending.get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await expect(
    pending.service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { executed: '2026-09-09T12:00:00+02:00' }, user),
  ).rejects.toMatchObject({ status: 400 });
  expect(pending.patch).not.toHaveBeenCalled();

  const accepted = setup(proposingRoles);
  accepted.get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, accept: 'TRUE' }));
  await accepted.service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { executed: '2026-09-09T12:00:00+02:00' }, user);
  expect(accepted.patch).toHaveBeenCalledTimes(1);
});

test('rejects an executed date in the future on creation and on update', async () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const create = setup();
  await expect(create.service.create(mockMunicipalityId, mockSupportErrandId, { ...newMeasure, executed: future }, user)).rejects.toMatchObject({
    status: 400,
  });
  expect(create.post).not.toHaveBeenCalled();

  const update = setup();
  update.get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, accept: 'TRUE' }));
  await expect(update.service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { executed: future }, user)).rejects.toMatchObject({
    status: 400,
  });
  expect(update.patch).not.toHaveBeenCalled();
});

test('lets only the user who registered a measure edit it, regardless of case', async () => {
  const other = setup();
  other.get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, addedByUser: 'someone.else' }));
  await expect(other.service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'x' }, user)).rejects.toMatchObject({
    status: 403,
  });
  expect(other.patch).not.toHaveBeenCalled();

  const own = setup();
  own.get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, addedByUser: String(user.username).toUpperCase() }));
  await own.service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'x' }, user);
  expect(own.patch).toHaveBeenCalledTimes(1);

  const unattributed = setup();
  unattributed.get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, addedByUser: undefined }));
  await expect(unattributed.service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'x' }, user)).rejects.toMatchObject({
    status: 403,
  });
});

/** When an approved proposal is to run: its proposer left the dates open, so the decision sets them. */
const approvalDates = { plannedStart: '2026-10-12T00:00:00+02:00', plannedComplete: '2026-11-30T00:00:00+01:00' };

test.each(['TRUE', 'FALSE', 'REWORK'] as const)('a deciding user can assess another role’s proposal with decision %s', async accept => {
  const { service, get, patch } = setup();
  // Deliberately outside the manager's own selectable types. The decision must not rewrite the proposal.
  const proposal = { ...measure, addedByUser: 'someone.else', addedByRole: 'NURSE', type: 'CLINICAL' };
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(proposal));
  await service.decide(
    mockMunicipalityId,
    mockSupportErrandId,
    'measure-1',
    '"3"',
    {
      accept,
      acceptMotivation: '  Endast dokumentationsdelen ska genomföras.  ',
      ...(accept === 'FALSE' ? {} : approvalDates),
    },
    user,
  );
  expect(patch.mock.calls[0]).toEqual([
    {
      url: expect.stringContaining('/measures/measure-1'),
      data: {
        accept,
        acceptMotivation: 'Endast dokumentationsdelen ska genomföras.',
        // A rejection plans nothing; an approval, whole or partial, says when the measure runs.
        ...(accept === 'FALSE' ? {} : approvalDates),
      },
      headers: { 'If-Match': '"3"' },
      followLocation: false,
      propagateClientError: true,
      mapUnauthorizedToForbidden: true,
    },
    user,
  ]);
  expect(patch).toHaveBeenCalledTimes(1);
});

test('full acceptance permits an omitted comment', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept: 'TRUE', ...approvalDates }, user);
  expect(patch.mock.calls[0][0].data).toEqual({ accept: 'TRUE', acceptMotivation: '', ...approvalDates });
});

test.each([
  ['TRUE', {}],
  ['REWORK', { acceptMotivation: 'Endast del A.' }],
] as const)('refuses to approve a proposal without saying when it runs: %s', async (accept, motivation) => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await expect(service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept, ...motivation }, user)).rejects.toMatchObject({
    status: 400,
    message: 'Ange start- och slutdatum för en godkänd åtgärd.',
  });
  expect(patch).not.toHaveBeenCalled();
});

test('refuses an approval that ends before it starts', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  const reversed = { plannedStart: approvalDates.plannedComplete, plannedComplete: approvalDates.plannedStart };
  await expect(
    service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept: 'TRUE', ...reversed }, user),
  ).rejects.toMatchObject({ status: 400 });
  expect(patch).not.toHaveBeenCalled();
});

test.each([{ groups: ['ad-nurse'] }, { groups: ['MANAGER'] }, { groups: [] }])(
  'does not grant decision rights from another role or a role name: %j',
  async ({ groups }) => {
    const { service, get, patch } = setup();
    get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
    await expect(
      service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept: 'TRUE' }, mockUser({ groups })),
    ).rejects.toMatchObject({ status: 403 });
    expect(patch).not.toHaveBeenCalled();
  },
);

test.each([[[]], [invalidRoles]])('blocks decisions when role configuration is unavailable: %j', async roles => {
  const { service, get, patch } = setup(roles);
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await expect(service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept: 'TRUE' }, user)).rejects.toMatchObject({
    status: 503,
  });
  expect(patch).not.toHaveBeenCalled();
});

test.each(['FALSE', 'REWORK'] as const)('requires a nonblank comment for %s', async accept => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await expect(
    service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept, acceptMotivation: '  ' }, user),
  ).rejects.toMatchObject({ status: 400 });
  expect(patch).not.toHaveBeenCalled();
});

test.each([{ accept: 'TRUE' }, { accept: 'FALSE' }, { accept: 'REWORK' }, { executed: '2026-09-09T00:00:00Z' }])(
  'does not replace a decision or assess an executed measure: %j',
  async fields => {
    const { service, get, patch } = setup();
    get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, ...fields }));
    await expect(service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept: 'TRUE' }, user)).rejects.toMatchObject({
      status: 409,
    });
    expect(patch).not.toHaveBeenCalled();
  },
);

test('rejects a decision on a stale version before fetching decision permissions', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  await expect(service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"2"', { accept: 'TRUE' }, user)).rejects.toMatchObject({
    status: 412,
  });
  expect(patch).not.toHaveBeenCalled();
});

test('does not decide when the parent is locked during permission checks', async () => {
  const { service, get, patch } = setup();
  get
    .mockResolvedValueOnce(response(current))
    .mockResolvedValueOnce(response(measure))
    .mockResolvedValueOnce(response(metadata))
    .mockResolvedValueOnce(response({ ...current, status: 'SOLVED' }));
  await expect(service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept: 'TRUE' }, user)).rejects.toMatchObject({
    status: 409,
  });
  expect(patch).not.toHaveBeenCalled();
});

test('propagates a decision conflict without retrying the write', async () => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(measure));
  patch.mockRejectedValueOnce(new HttpException(412, 'Measure changed'));
  await expect(
    service.decide(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { accept: 'TRUE', ...approvalDates }, user),
  ).rejects.toMatchObject({
    status: 412,
  });
  expect(patch).toHaveBeenCalledTimes(1);
});

test.each(['TRUE', 'FALSE', 'REWORK'])('protects the original content after decision %s while allowing planning updates', async accept => {
  const { service, get, patch } = setup();
  for (const changes of [{ goal: 'Changed goal' }, { description: 'Changed description' }, { type: 'EDUCATION' }]) {
    get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, accept }));
    await expect(service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', changes, user)).rejects.toMatchObject({ status: 409 });
  }
  expect(patch).not.toHaveBeenCalled();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, accept }));
  const changes = { responsibleUser: 'Anna', plannedStart: '2026-09-10T00:00:00Z' };
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', changes, user);
  expect(patch.mock.calls[0][0].data).toEqual(changes);
});

test.each([undefined, 'TRUE', 'REWORK'])('never lets editing change a start date once set (decision %s)', async accept => {
  const { service, get, patch } = setup();
  const planned = { ...measure, accept, plannedStart: '2026-09-08T00:00:00Z', plannedComplete: '2026-09-30T00:00:00Z' };
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(planned));
  await expect(
    service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { plannedStart: '2026-09-15T00:00:00Z' }, user),
  ).rejects.toMatchObject({ status: 409, message: 'Startdatumet kan inte ändras.' });
  expect(patch).not.toHaveBeenCalled();
});

test.each(['TRUE', 'REWORK'])('leaves the end date of a measure approved by %s to the follow-up', async accept => {
  const { service, get, patch } = setup();
  const approved = { ...measure, accept, plannedStart: '2026-09-08T00:00:00Z', plannedComplete: '2026-09-30T00:00:00Z' };
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(approved));
  await expect(
    service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { plannedComplete: '2026-10-15T00:00:00Z' }, user),
  ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Ändra slutdatum') });
  expect(patch).not.toHaveBeenCalled();

  // The same days written another way are no change, and the rest of the measure is still the registrar's.
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(approved));
  const changes = { plannedStart: '2026-09-08T02:00:00+02:00', plannedComplete: '2026-09-30T02:00:00+02:00', responsibleUser: 'Anna' };
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', changes, user);
  expect(patch.mock.calls[0][0].data).toEqual(changes);
});

test.each(['TRUE', 'REWORK'])('allows execution after %s even if registration is no longer configured', async accept => {
  const { service, get, patch } = setup([]);
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, accept }));
  await service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { executed: '2026-09-09T00:00:00Z' }, user);
  expect(patch).toHaveBeenCalledTimes(1);
});

test.each([undefined, 'FALSE', 'UNKNOWN'])('even a deciding role cannot execute a measure without approval: %s', async accept => {
  const { service, get, patch } = setup();
  get.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...measure, accept }));
  await expect(
    service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { executed: '2026-09-09T00:00:00Z' }, user),
  ).rejects.toMatchObject({ status: 400 });
  expect(patch).not.toHaveBeenCalled();
});

test.each([
  { accept: 'TRUE', ...approvalDates },
  { accept: 'FALSE', acceptMotivation: 'Avslås därför att…' },
  { accept: 'REWORK', acceptMotivation: 'Genomför endast del A eftersom…', ...approvalDates },
])('accepts the narrow decision contract: %j', async body => {
  expect(await validate(plainToInstance(DecideSupportMeasureDto, body), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
});

test.each([
  { accept: null },
  { accept: 'UNKNOWN' },
  { accept: undefined },
  { accept: 'TRUE' },
  { accept: 'REWORK', acceptMotivation: 'Genomför endast del A eftersom…' },
  { accept: 'TRUE', plannedStart: 'i morgon', plannedComplete: approvalDates.plannedComplete },
  { accept: 'FALSE' },
  { accept: 'REWORK', acceptMotivation: '  ' },
  { accept: 'FALSE', acceptMotivation: null },
  { addedByRole: 'MANAGER' },
  { addedByUser: 'forged' },
  { goal: 'Replacement' },
  { reworkGoal: 'Replacement' },
  { reworkDescription: 'Replacement' },
  { executed: '2026-09-09T00:00:00Z' },
])('rejects invalid decisions and fields belonging to other workflows: %j', async fields => {
  const errors = await validate(plainToInstance(DecideSupportMeasureDto, { accept: 'TRUE', ...fields }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  expect(errors.length).toBeGreaterThan(0);
});

/** The workflow as the namespace metadata describes it: Utredning, then the follow-up. */
const phasedMetadata: MetadataResponse = {
  ...metadata,
  phases: [
    { id: 'investigation-phase', name: 'INVESTIGATION', phaseOrder: 2 },
    { id: 'follow-up-phase', name: 'FOLLOW_UP', phaseOrder: 3 },
  ],
};

/** The service over an errand in the given phase, holding the given measure. */
function setupInPhase(phaseId: string, existing: Measure) {
  const context = setup();
  context.get.mockImplementation(async config => {
    if (config.url?.endsWith('/metadata')) return response(phasedMetadata);
    if (config.url?.includes('/measures/')) return response(existing);
    return response({ ...current, phases: [{ phaseId }] });
  });
  return context;
}

const decidedMeasure: Measure = { ...measure, accept: 'TRUE', description: 'Utbilda personalen' };

test("lets a decided measure's content be put right while the errand is investigated, and locks it after", async () => {
  const investigated = setupInPhase('investigation-phase', decidedMeasure);
  await investigated.service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { description: 'Utbilda all personal' }, user);
  expect(investigated.patch.mock.calls[0][0].data).toEqual({ description: 'Utbilda all personal' });

  const followedUp = setupInPhase('follow-up-phase', decidedMeasure);
  await expect(
    followedUp.service.update(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', { goal: 'Nytt mål' }, user),
  ).rejects.toMatchObject({ status: 409, message: 'Typ, beskrivning och mål är låsta efter beslut när ärendet har lämnat Utredning.' });
  expect(followedUp.patch).not.toHaveBeenCalled();
});

test('removes an own measure that is not carried out while the errand is investigated, on its own version', async () => {
  const { service, remove } = setupInPhase('investigation-phase', decidedMeasure);

  await service.remove(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', user);

  expect(remove).toHaveBeenCalledTimes(1);
  expect(remove.mock.calls[0][0]).toMatchObject({
    url: expect.stringMatching(/\/errands\/[^/]+\/measures\/measure-1$/u),
    headers: { 'If-Match': '"3"' },
  });
});

test.each([
  ['somebody else registered it', { ...decidedMeasure, addedByUser: 'someone.else' }, 'investigation-phase', 403],
  ['it is carried out', { ...decidedMeasure, executed: '2026-09-09T12:00:00+02:00' }, 'investigation-phase', 409],
  ['the errand has left Utredning', decidedMeasure, 'follow-up-phase', 409],
])('removes no measure when %s', async (_reason, existing, phaseId, status) => {
  const { service, remove } = setupInPhase(phaseId, existing);

  await expect(service.remove(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"3"', user)).rejects.toMatchObject({ status });
  expect(remove).not.toHaveBeenCalled();
});

test('removes no measure on a version somebody has moved past', async () => {
  const { service, remove } = setupInPhase('investigation-phase', decidedMeasure);

  await expect(service.remove(mockMunicipalityId, mockSupportErrandId, 'measure-1', '"2"', user)).rejects.toMatchObject({ status: 412 });
  expect(remove).not.toHaveBeenCalled();
});
