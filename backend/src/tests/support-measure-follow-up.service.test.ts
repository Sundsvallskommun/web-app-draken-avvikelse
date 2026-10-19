import type { Measure } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import ApiService, { type ApiRequestConfig, type ApiResponse } from '@/services/api.service';
import { SupportMeasureService } from '@/services/support-measure.service';

import { mockUser } from './helpers/http';

const unitManagers = 'MOCK_UNIT_MANAGERS';
const roles = [
  { key: 'enhetschef', label: 'Enhetschef', group: unitManagers },
  { key: 'lex-utredare', label: 'LEX-utredare', group: 'MOCK_LEX_INVESTIGATORS' },
];
/** The unit's manager follows the measure up, and registered it too, so editing it is theirs as well. */
const user = mockUser({ groups: [unitManagers] });
const answers = { desiredEffectAchieved: false, followUpDescription: 'Ingen förbättring ännu.' };

/** Simulates the SM 16.0 measure resource, including writes that succeed but lose their response. */
class MeasureApi extends ApiService {
  measure: Measure = {
    id: 'measure-1',
    version: 3,
    addedByUser: user.username,
    accept: 'TRUE',
    plannedStart: '2026-09-08T12:00:00Z',
    goal: 'Originalmål',
  };
  parent = { version: 7, status: 'ONGOING' };
  failure?: 'patch-before' | 'patch-after' | 'race' | 'denied';
  patches: ApiRequestConfig[] = [];

  private response<T>(data: unknown, status = 200, version?: number): ApiResponse<T> {
    return { data: structuredClone(data) as T, message: 'success', status, headers: version === undefined ? {} : { etag: `"${version}"` } };
  }

  override async get<T>(config: ApiRequestConfig): Promise<ApiResponse<T>> {
    const url = config.url ?? '';
    if (url.endsWith('/metadata')) return this.response({ measureTypes: [], roles: [] });
    if (url.endsWith('/measures')) return this.response([this.measure]);
    if (url.endsWith('/measures/measure-1')) return this.response(this.measure);
    return this.response(this.parent, 200, this.parent.version);
  }

  override async patch<T, D>(config: ApiRequestConfig<D>): Promise<ApiResponse<T>> {
    expect(config.url).toMatch(/\/measures\/measure-1$/);
    this.patches.push(config);
    if (this.failure === 'denied') throw new HttpException(403, 'Denied');
    if (this.failure === 'patch-before') throw new HttpException(503, 'Unavailable');
    // Another writer changes the measure between this command's read and its write.
    if (this.failure === 'race' && this.patches.length === 1) this.measure.version = (this.measure.version ?? 0) + 1;
    if ((config.headers as Record<string, string> | undefined)?.['If-Match'] !== `"${this.measure.version}"`) {
      throw new HttpException(412, 'Precondition failed');
    }
    this.measure = { ...this.measure, ...(config.data as Measure), version: (this.measure.version ?? 0) + 1 };
    this.parent.version++;
    if (this.failure === 'patch-after') throw new HttpException(503, 'Lost response');
    return this.response(this.measure);
  }
}

function setup() {
  const api = new MeasureApi();
  const service = new SupportMeasureService(api, roles);
  return {
    api,
    service,
    save: (version = 3, value = answers) => service.followUp('2281', 'errand-1', 'measure-1', `"${version}"`, value, user),
    read: () => service.read('2281', 'errand-1', user),
  };
}

test.each(['TRUE', 'REWORK'] as const)('saves answers, completion and execution for %s in one conditioned measure write', async accept => {
  const { api, save, read } = setup();
  api.measure.accept = accept;
  await save();
  expect(api.patches).toHaveLength(1);
  expect(api.patches[0].headers).toEqual({ 'If-Match': '"3"' });
  expect(api.patches[0].data).toEqual({
    executed: expect.any(String),
    result: 'NOT_COMPLETED',
    resultText: answers.followUpDescription,
    completedAt: expect.any(String),
  });
  const saved = api.patches[0].data as Measure;
  expect(saved.executed).toBe(saved.completedAt);
  expect((await read()).measures[0]).toMatchObject({
    goal: 'Originalmål',
    plannedStart: api.measure.plannedStart,
    result: 'NOT_COMPLETED',
    resultText: answers.followUpDescription,
    version: 4,
  });
});

test('saves a desired effect as achieved and trims what happened', async () => {
  const { api, save } = setup();
  await save(3, { desiredEffectAchieved: true, followUpDescription: '  Utbildningen är genomförd.  ' });
  expect(api.measure).toMatchObject({ result: 'COMPLETED', resultText: 'Utbildningen är genomförd.' });
});

test.each([{ followUpDescription: '   ' }, { followUpDescription: 'x'.repeat(4001) }])(
  'rejects incomplete answers without writing: %j',
  async fields => {
    const { api, save } = setup();
    await expect(save(3, { ...answers, ...fields })).rejects.toMatchObject({ status: 400 });
    expect(api.patches).toHaveLength(0);
  },
);

test('preserves an already recorded execution date', async () => {
  const { api, save } = setup();
  api.measure.executed = '2026-09-09T12:00:00Z';
  await save();
  expect(api.patches[0].data).not.toHaveProperty('executed');
  expect(api.measure).toMatchObject({ executed: '2026-09-09T12:00:00Z', result: 'NOT_COMPLETED' });
});

test('saves nothing when the write fails before it is applied', async () => {
  const { api, save } = setup();
  api.failure = 'patch-before';
  await expect(save()).rejects.toMatchObject({ status: 503 });
  expect(api.measure.result).toBeUndefined();
  expect(api.measure.executed).toBeUndefined();
});

test('accepts an identical retry after a lost response despite the old version', async () => {
  const { api, save } = setup();
  api.failure = 'patch-after';
  await expect(save()).rejects.toMatchObject({ status: 503 });
  api.failure = undefined;
  await save();
  expect(api.patches).toHaveLength(1);
  expect(api.measure.version).toBe(4);
});

test('never replaces the answers of a measure that is already followed up', async () => {
  const { api, save } = setup();
  await save();
  await expect(save(4, { ...answers, followUpDescription: 'Ersätt svaren' })).rejects.toMatchObject({ status: 409 });
  await expect(save(4, { ...answers, desiredEffectAchieved: true })).rejects.toMatchObject({ status: 409 });
  expect(api.patches).toHaveLength(1);
  expect(api.measure.resultText).toBe(answers.followUpDescription);
});

test('lets Support Management refuse a measure changed after it was read, and succeeds on its fresh version', async () => {
  const { api, save } = setup();
  api.failure = 'race';
  await expect(save()).rejects.toMatchObject({ status: 412 });
  expect(api.measure.result).toBeUndefined();
  await save(4);
  expect(api.measure).toMatchObject({ result: 'NOT_COMPLETED', version: 5 });
});

test('passes a refusal from the measure resource on unchanged', async () => {
  const { api, save } = setup();
  api.failure = 'denied';
  await expect(save()).rejects.toMatchObject({ status: 403 });
  expect(api.measure.result).toBeUndefined();
});

test.each([{ accept: undefined }, { accept: 'FALSE' }, { plannedStart: undefined }] as const)('rejects an ineligible measure: %j', async fields => {
  const { api, save } = setup();
  api.measure = { ...api.measure, ...fields };
  await expect(save()).rejects.toMatchObject({ status: 409 });
  expect(api.patches).toHaveLength(0);
});

test('concurrent commands save only one answer for the measure', async () => {
  const { api, save } = setup();
  const outcomes = await Promise.allSettled([save(), save(3, { ...answers, followUpDescription: 'Ett annat svar' })]);
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(api.measure.resultText).toBe(answers.followUpDescription);
  expect(api.measure.version).toBe(4);
});

test('rejects locked errands and stale measure versions before writing', async () => {
  const { api, save } = setup();
  api.parent.status = 'SOLVED';
  await expect(save()).rejects.toMatchObject({ status: 409 });
  api.parent.status = 'ONGOING';
  await expect(save(2)).rejects.toMatchObject({ status: 412 });
  expect(api.patches).toHaveLength(0);
});

test('ordinary editing cannot change the execution belonging to a saved follow-up', async () => {
  const { api, service, save } = setup();
  await save();
  await expect(service.update('2281', 'errand-1', 'measure-1', '"4"', { executed: '2026-09-09T00:00:00Z' }, user)).rejects.toMatchObject({
    status: 409,
  });
  expect(api.patches).toHaveLength(1);
});

describe('moving the end date of a measure being followed up', () => {
  const moveTo = (plannedComplete: string, version = 3) => {
    const { api, service } = setup();
    return { api, move: () => service.changePlannedComplete('2281', 'errand-1', 'measure-1', `"${version}"`, { plannedComplete }, user) };
  };

  it('writes only the new end date, conditioned on the measure version', async () => {
    const { api, move } = moveTo('2026-10-15T00:00:00Z');
    await move();
    expect(api.patches).toHaveLength(1);
    expect(api.patches[0]).toMatchObject({ data: { plannedComplete: '2026-10-15T00:00:00Z' }, headers: { 'If-Match': '"3"' } });
    expect(api.measure).toMatchObject({ plannedStart: '2026-09-08T12:00:00Z', plannedComplete: '2026-10-15T00:00:00Z', version: 4 });
  });

  it('writes a rewritten description in the same request as the date it explains', async () => {
    const { api, service } = setup();
    await service.changePlannedComplete(
      '2281',
      'errand-1',
      'measure-1',
      '"3"',
      { plannedComplete: '2026-10-15T00:00:00Z', description: 'Flyttas: föreläsaren är sjuk.' },
      user,
    );
    expect(api.patches).toHaveLength(1);
    expect(api.patches[0].data).toEqual({ plannedComplete: '2026-10-15T00:00:00Z', description: 'Flyttas: föreläsaren är sjuk.' });
  });

  it('refuses an end before the decided start', async () => {
    const { api, move } = moveTo('2026-09-01T00:00:00Z');
    await expect(move()).rejects.toMatchObject({ status: 400 });
    expect(api.patches).toHaveLength(0);
  });

  it.each([{ accept: undefined }, { accept: 'FALSE' }, { plannedStart: undefined }, { result: 'COMPLETED' }] as const)(
    'refuses a measure that is not planned, approved and open: %j',
    async fields => {
      const { api, move } = moveTo('2026-10-15T00:00:00Z');
      api.measure = { ...api.measure, ...fields };
      await expect(move()).rejects.toMatchObject({ status: 409 });
      expect(api.patches).toHaveLength(0);
    },
  );

  it('refuses a stale version and a locked errand before writing', async () => {
    const stale = moveTo('2026-10-15T00:00:00Z', 2);
    await expect(stale.move()).rejects.toMatchObject({ status: 412 });
    const locked = moveTo('2026-10-15T00:00:00Z');
    locked.api.parent.status = 'SOLVED';
    await expect(locked.move()).rejects.toMatchObject({ status: 409 });
    expect([...stale.api.patches, ...locked.api.patches]).toHaveLength(0);
  });
});

describe('who follows up a measure', () => {
  const followUpAs = (groups: string[]) => {
    const api = new MeasureApi();
    // Proposed by a LEX investigator, approved since: the unit's manager is the one to follow it up.
    api.measure.addedByUser = 'lex-investigator';
    const service = new SupportMeasureService(api, roles);
    return {
      api,
      save: () => service.followUp('2281', 'errand-1', 'measure-1', '"3"', answers, mockUser({ groups })),
      moveEnd: () =>
        service.changePlannedComplete('2281', 'errand-1', 'measure-1', '"3"', { plannedComplete: '2026-10-15T00:00:00Z' }, mockUser({ groups })),
    };
  };

  it("lets the unit's manager follow up a measure somebody else proposed", async () => {
    const { api, save } = followUpAs([unitManagers]);

    await expect(save()).resolves.toBeUndefined();
    expect(api.patches).toHaveLength(1);
  });

  it('refuses everybody else, the one who proposed it included, without writing', async () => {
    const { api, save } = followUpAs(['mock_lex_investigators']);

    await expect(save()).rejects.toMatchObject({ status: 403 });
    expect(api.patches).toHaveLength(0);
  });

  it("lets the unit's manager move the end date of a measure somebody else proposed, and nobody else", async () => {
    const manager = followUpAs([unitManagers]);
    await expect(manager.moveEnd()).resolves.toBeUndefined();
    expect(manager.api.patches).toHaveLength(1);

    const proposer = followUpAs(['mock_lex_investigators']);
    await expect(proposer.moveEnd()).rejects.toMatchObject({ status: 403 });
    expect(proposer.api.patches).toHaveLength(0);
  });
});
