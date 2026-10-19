import axios, { AxiosAdapter, AxiosError } from 'axios';

import { apiServiceName } from '@/config/api-config';
import ApiService from '@/services/api.service';
import ApiTokenService from '@/services/api-token.service';
import { REQUEST_GROUP_HEADER, runInRequestGroup } from '@/utils/request-group';
import { apiURL } from '@/utils/util';

import { mockUser } from './helpers/http';

const user = mockUser({ permissions: { canEditSupportManagement: true } } as never);

/** Every request below targets the token URL, which bypasses the OAuth interceptor, and supplies its
 *  own adapter, so no test here reaches the network. */
const TOKEN_URL = 'token';

const okAdapter =
  (data: unknown, headers: Record<string, string> = {}, status = 200): AxiosAdapter =>
  async config => ({ config, data, headers, status, statusText: status === 201 ? 'Created' : 'OK' });

const failingAdapter =
  (status: number, data: unknown, statusText: string): AxiosAdapter =>
  async config => {
    throw new AxiosError('Upstream request failed', undefined, config, undefined, { config, data, headers: {}, status, statusText });
  };

beforeEach(() => {
  vi.spyOn(ApiTokenService.prototype, 'getToken').mockResolvedValue('test-token');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApiService', () => {
  it.each([false, true])('maps an upstream resource denial to 403 only when opted in (%s)', async mapUnauthorizedToForbidden => {
    await expect(
      new ApiService().get(
        {
          adapter: failingAdapter(401, { detail: 'Key not writable' }, 'Unauthorized'),
          url: TOKEN_URL,
          propagateClientError: true,
          mapUnauthorizedToForbidden,
        },
        user,
      ),
    ).rejects.toMatchObject({ status: mapUnauthorizedToForbidden ? 403 : 401, message: 'Key not writable' });
  });

  it('retains upstream response headers for BFF endpoints that need concurrency metadata', async () => {
    const response = await new ApiService().get<{ saved: boolean }>(
      { adapter: okAdapter({ saved: true }, { etag: '"4"' }), includeResponseHeaders: true, url: TOKEN_URL },
      user,
    );

    expect(response.data).toEqual({ saved: true });
    expect(response.headers?.etag).toBe('"4"');
    expect(response.status).toBe(200);
  });

  it('can preserve a create response instead of following its Location header', async () => {
    const follow = vi.spyOn(axios, 'get');
    const response = await new ApiService().put<{ saved: boolean }, { value: string }>(
      {
        adapter: okAdapter({ saved: true }, { location: '/created-resource', etag: '"1"' }, 201),
        data: { value: 'new' },
        followLocation: false,
        includeResponseHeaders: true,
        url: TOKEN_URL,
      },
      user,
    );

    expect(follow).not.toHaveBeenCalled();
    expect(response).toMatchObject({ data: { saved: true }, status: 201 });
    expect(response.headers?.etag).toBe('"1"');
  });

  describe('request group', () => {
    const capturedHeaders: Record<string, unknown>[] = [];
    const capturingAdapter: AxiosAdapter = async config => {
      capturedHeaders.push({ ...config.headers });
      return { config, data: {}, headers: {}, status: 200, statusText: 'OK' };
    };

    beforeEach(() => {
      capturedHeaders.length = 0;
    });

    it('sends the group of the request being handled to Support Management', async () => {
      await runInRequestGroup('group-of-the-save', () =>
        new ApiService().patch({ adapter: capturingAdapter, url: `${apiServiceName('supportmanagement')}/2281/errands/errand-1`, data: {} }, user),
      );

      expect(capturedHeaders[0][REQUEST_GROUP_HEADER]).toBe('group-of-the-save');
    });

    it('finds Support Management in baseURL as well, where most errand writes name it', async () => {
      await runInRequestGroup('group-of-the-save', () =>
        new ApiService().patch(
          { adapter: capturingAdapter, baseURL: apiURL(apiServiceName('supportmanagement')), url: '2281/errands/errand-1', data: {} },
          user,
        ),
      );

      expect(capturedHeaders[0][REQUEST_GROUP_HEADER]).toBe('group-of-the-save');
    });

    it('sends no group to an API that does not read one', async () => {
      await runInRequestGroup('group-of-the-save', () =>
        new ApiService().get({ adapter: capturingAdapter, url: `${apiServiceName('employee')}/portalpersondata/someone` }, user),
      );

      expect(capturedHeaders[0]).not.toHaveProperty(REQUEST_GROUP_HEADER);
    });

    it('sends no group outside a request, and keeps one the caller set itself', async () => {
      const errandUrl = `${apiServiceName('supportmanagement')}/2281/errands/errand-1`;
      await new ApiService().get({ adapter: capturingAdapter, url: errandUrl }, user);
      await runInRequestGroup('ambient', () =>
        new ApiService().put({ adapter: capturingAdapter, url: errandUrl, headers: { [REQUEST_GROUP_HEADER]: 'explicit' } }, user),
      );

      expect(capturedHeaders[0]).not.toHaveProperty(REQUEST_GROUP_HEADER);
      expect(capturedHeaders[1][REQUEST_GROUP_HEADER]).toBe('explicit');
    });
  });

  describe('silent writes', () => {
    const capturedHeaders: Record<string, unknown>[] = [];
    const capturingAdapter: AxiosAdapter = async config => {
      capturedHeaders.push({ ...config.headers });
      return { config, data: {}, headers: {}, status: 200, statusText: 'OK' };
    };

    beforeEach(() => {
      capturedHeaders.length = 0;
    });

    it('asks Support Management not to notify anyone of a write the system makes on its own', async () => {
      await new ApiService().post({ adapter: capturingAdapter, url: TOKEN_URL, data: {}, notifySubscribers: false }, user);

      expect(capturedHeaders[0]['X-notify']).toBe('false');
    });

    it('leaves every other write to notify as usual', async () => {
      await new ApiService().post({ adapter: capturingAdapter, url: TOKEN_URL, data: {} }, user);

      expect(capturedHeaders[0]).not.toHaveProperty('X-notify');
    });
  });

  it('does not add upstream headers to existing controller response wrappers unless requested', async () => {
    const response = await new ApiService().get<{ saved: boolean }>({ adapter: okAdapter({ saved: true }, { etag: '"4"' }), url: TOKEN_URL }, user);

    expect(response).toEqual({ data: { saved: true }, message: 'success' });
  });

  for (const status of [409, 412]) {
    it(`preserves upstream ${status} responses when the caller opts into client-error propagation`, async () => {
      await expect(
        new ApiService().put<{ saved: boolean }, { value: string }>(
          {
            adapter: failingAdapter(status, { detail: 'Investigation version conflict' }, 'Conflict'),
            data: { value: 'new' },
            propagateClientError: true,
            url: TOKEN_URL,
          },
          user,
        ),
      ).rejects.toMatchObject({ status, message: 'Investigation version conflict' });
    });
  }

  it('preserves an upstream client-error status when the response body is empty', async () => {
    await expect(
      new ApiService().patch<{ saved: boolean }, { value: string }>(
        {
          adapter: failingAdapter(400, undefined, 'Bad Request'),
          data: { value: 'new' },
          propagateClientError: true,
          url: TOKEN_URL,
        },
        user,
      ),
    ).rejects.toMatchObject({ status: 400, message: 'Request failed' });
  });

  it('preserves an empty upstream client error from a GET readback', async () => {
    await expect(
      new ApiService().get<{ saved: boolean }>(
        { adapter: failingAdapter(403, undefined, 'Forbidden'), propagateClientError: true, url: TOKEN_URL },
        user,
      ),
    ).rejects.toMatchObject({ status: 403, message: 'Request failed' });
  });

  it('surfaces only the upstream server errors the caller names, collapsing the rest into 500', async () => {
    const searchUnavailable = { detail: 'Search not available' };
    await expect(
      new ApiService().get(
        { adapter: failingAdapter(503, searchUnavailable, 'Service Unavailable'), propagateServerErrors: [503, 504], url: TOKEN_URL },
        user,
      ),
    ).rejects.toMatchObject({ status: 503, message: 'Search not available' });
    await expect(
      new ApiService().get(
        { adapter: failingAdapter(502, searchUnavailable, 'Bad Gateway'), propagateServerErrors: [503, 504], url: TOKEN_URL },
        user,
      ),
    ).rejects.toMatchObject({ status: 500, message: 'Internal server error' });
    await expect(
      new ApiService().get({ adapter: failingAdapter(503, searchUnavailable, 'Service Unavailable'), url: TOKEN_URL }, user),
    ).rejects.toMatchObject({ status: 500, message: 'Internal server error' });
  });
});
