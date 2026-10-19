import { HttpException } from '@exceptions/HttpException';
import { User } from '@interfaces/users.interface';
import { logger } from '@utils/logger';
import { currentRequestGroupId, REQUEST_GROUP_HEADER } from '@utils/request-group';
import { apiURL } from '@utils/util';
import type { AxiosResponseHeaders, RawAxiosResponseHeaders } from 'axios';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';

import { apiServiceName } from '@/config/api-config';

import ApiTokenService from './api-token.service';

export class ApiResponse<T> {
  data!: T;
  message!: string;
  headers?: AxiosResponseHeaders | RawAxiosResponseHeaders;
  status?: number;
}

// Per-request options for upstream error handling, Location following and concurrency metadata.
// `propagateClientError` preserves upstream 4xx statuses and messages instead of returning a generic 500.
export type ApiRequestConfig<D = any> = AxiosRequestConfig<D> & {
  followLocation?: boolean;
  includeResponseHeaders?: boolean;
  propagateClientError?: boolean;
  /** Support Management uses 401 for resource denials; these must not expire the BFF session. */
  mapUnauthorizedToForbidden?: boolean;
  /** Upstream 5xx statuses the caller handles itself, surfaced with their own status instead of a generic 500. */
  propagateServerErrors?: readonly number[];
  /**
   * `false` makes a Support Management write silent: its subscribers are not notified of it. For what
   * the system writes on its own - read markers, acknowledgements, derived labels, bookkeeping - never
   * for something a user did. Support Management honours it from 17.0; older versions ignore it.
   */
  notifySubscribers?: false;
};

/** Support Management's switch for keeping one write from notifying the errand's subscribers. */
const SILENT_WRITE_HEADERS = { 'X-notify': 'false' } as const;

const apiTokenService = new ApiTokenService();

/**
 * Only Support Management reads the request group; no other upstream is sent a header it does not know.
 * Callers name the service either in the url or in `baseURL` with a relative url, so both are read.
 */
const isSupportManagementRequest = (request: Pick<AxiosRequestConfig, 'baseURL' | 'url'>): boolean =>
  `${request.baseURL ?? ''}/${request.url ?? ''}/`.includes(`/${apiServiceName('supportmanagement')}/`);

/** The group header for a Support Management call made while handling a user's request, else nothing. */
const requestGroupHeaders = (request: Pick<AxiosRequestConfig, 'baseURL' | 'url'>): Record<string, string> => {
  const requestGroupId = currentRequestGroupId();
  return requestGroupId && isSupportManagementRequest(request) ? { [REQUEST_GROUP_HEADER]: requestGroupId } : {};
};

/**
 * Render a request body for the error log. Multipart requests carry a form-data
 * stream rather than a string, so it can only be described, not excerpted.
 */
const describeRequestBody = (data: unknown): string => {
  if (typeof data === 'string') {
    return data.slice(0, 1500);
  }
  if (data === undefined || data === null) {
    return '';
  }
  return `[${data.constructor?.name ?? typeof data} body, not logged]`;
};

const logAxiosResponseError = (error: AxiosError): void => {
  const { response } = error;
  if (!response) {
    logger.error(`API request failed without a response: ${error.message}`);
    return;
  }
  logger.error(`ERROR: API request failed with status: ${response.status}`);
  logger.error(`Error details: ${JSON.stringify(response.data)}`);
  logger.error(`Error url: ${response.config.baseURL || ''}/${response.config.url}`);
  logger.error(`Error data: ${describeRequestBody(response.config.data)}`);
  logger.error(`Error method: ${response.config.method}`);
  logger.error(`Error headers: ${response.config.headers}`);
};

const readUpstreamErrorMessage = (data: unknown): string => {
  if (typeof data === 'string') return data.trim() ? data : 'Request failed';
  if (typeof data !== 'object' || data === null) return 'Request failed';

  const errorBody = data as { readonly detail?: unknown; readonly message?: unknown; readonly title?: unknown };
  for (const candidate of [errorBody.detail, errorBody.message, errorBody.title]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return 'Request failed';
};

class ApiService {
  private instance: AxiosInstance;
  constructor() {
    this.instance = axios.create();
    this.instance.interceptors.request.use(
      async function (request) {
        if (request.url === apiURL('token')) {
          return request;
        }
        const token = await apiTokenService.getToken();
        const defaultHeaders = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Request-Id': uuidv4(),
          ...requestGroupHeaders(request),
        };
        const isSimulatorRequest = request.url?.includes('simulatorserver');
        if (!isSimulatorRequest) {
          const fullUrl = `${request.baseURL || ''}/${request.url}`;
          logger.info(`MAKING ${request.method?.toUpperCase()} REQUEST TO URL ${fullUrl}`);
          logger.info(`x-request-id: ${defaultHeaders['X-Request-Id']}`);
        }
        request.headers = { ...defaultHeaders, ...request.headers } as any;
        request.headers['Content-Type'] = request.headers['Content-Type'] || defaultHeaders['Content-Type'];
        return request;
      },
      function (error) {
        return Promise.reject(error);
      },
    );

    this.instance.interceptors.response.use(
      async function (response) {
        const token = await apiTokenService.getToken();
        const defaultHeaders = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Request-Id': uuidv4(),
        };
        // `followLocation: false` opts a single request out. Unlike `propagateClientError` this
        // flag is deliberately not stripped from the axios config, so it survives onto
        // `response.config` and is readable here.
        const followLocation = (response.config as ApiRequestConfig).followLocation !== false;
        if (followLocation && response.headers.location) {
          logger.info(`Response contained location header: ${response.headers.location}`);
          logger.info(`Base URL was: ${response.config.baseURL}`);
          const sentBy = response.config.headers?.['X-Sent-By'];
          const headers = sentBy === undefined ? defaultHeaders : { ...defaultHeaders, 'X-Sent-By': sentBy };
          return axios.get(response.headers.location, { baseURL: response.config.baseURL, headers }).catch(e => {
            logger.error(`Error in location header request: ${e.details}`);
            logger.error(`Base URL was: ${e.config?.baseURL}`);
            logger.error(`URL was: ${e.config?.url}`);
            logger.error(`Method was: ${e.config?.method}`);
            return response;
          });
        }
        return response;
      },
      function (error) {
        return Promise.reject(error);
      },
    );
  }
  private async request<T>(config: ApiRequestConfig, user: User): Promise<ApiResponse<T>> {
    const { includeResponseHeaders, propagateClientError, mapUnauthorizedToForbidden, propagateServerErrors, notifySubscribers, ...axiosConfig } =
      config;
    const defaultParams = {};
    const preparedConfig: AxiosRequestConfig = {
      ...axiosConfig,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        ...axiosConfig.headers,
        ...(notifySubscribers === false ? SILENT_WRITE_HEADERS : {}),
        'X-Sent-By': [`type=adAccount; ${user.username}`],
      },
      params: { ...defaultParams, ...axiosConfig.params },
      url: axiosConfig.baseURL ? axiosConfig.url : apiURL(axiosConfig.url!),
    };
    try {
      const res = await this.instance(preparedConfig);
      return includeResponseHeaders
        ? { data: res.data, message: 'success', headers: res.headers, status: res.status }
        : { data: res.data, message: 'success' };
    } catch (error: unknown) {
      if (!axios.isAxiosError(error)) {
        logger.error(`Unknown error: ${error}`);
        throw new HttpException(500, 'Internal server error');
      }

      logAxiosResponseError(error);
      const { response } = error;
      if (response?.status === 404) {
        throw new HttpException(404, 'Not found');
      }

      // Opt-in: surface upstream client errors (4xx) so callers can show the real message in
      // context instead of an opaque 500. Server/network errors still become 500 below.
      const status = response?.status;
      if (propagateClientError && status !== undefined && status >= 400 && status < 500) {
        throw new HttpException(status === 401 && mapUnauthorizedToForbidden ? 403 : status, readUpstreamErrorMessage(response?.data));
      }
      if (status !== undefined && propagateServerErrors?.includes(status)) {
        throw new HttpException(status, readUpstreamErrorMessage(response?.data));
      }
      throw new HttpException(500, 'Internal server error');
    }
  }

  public async get<T>(config: ApiRequestConfig, user: User): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'GET' }, user);
  }

  public async post<T, D>(config: ApiRequestConfig<D>, user: User): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'POST' }, user);
  }

  public async patch<T, D>(config: ApiRequestConfig<D>, user: User): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PATCH' }, user);
  }

  public async put<T, D>(config: ApiRequestConfig<D>, user: User): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT' }, user);
  }

  public async delete<T>(config: ApiRequestConfig, user: User): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE' }, user);
  }
}
export default ApiService;
