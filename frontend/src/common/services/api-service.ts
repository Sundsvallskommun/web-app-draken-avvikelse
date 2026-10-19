'use client';

import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface Data {
  error?: string;
}

export interface ApiResponse<T = unknown> {
  data: T;
  message: string;
}

const handleError = (error: AxiosError<ApiResponse>) => {
  if (globalThis.window !== undefined) {
    if (error?.response?.status === 401 && !globalThis.window.location.pathname.includes('login')) {
      const basePath = process.env.NEXT_PUBLIC_BASEPATH || '';
      globalThis.window.location.href = `${globalThis.window.location.origin}${basePath}/login?path=${globalThis.window.location.pathname}&failMessage=${error.response.data.message}`;
    }
  }

  throw error;
};

const options = {
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
};

/** The user action in progress, while one is; see `withRequestGroup`. */
let actionRequestGroupId: string | undefined;

/**
 * Runs one user action so that every request it makes carries the same `X-Request-Group-Id`.
 *
 * Support Management groups the events a single action produces - the errand, its parameters, a note -
 * into one notification for the people following the errand, instead of one per request. An action
 * started inside another joins the outer one. A request something else makes while the action runs,
 * such as the notification poll, carries the id too; reads produce no events, so that is harmless.
 */
export const withRequestGroup = async <T>(action: () => Promise<T>): Promise<T> => {
  if (actionRequestGroupId) return action();
  actionRequestGroupId = uuidv4();
  try {
    return await action();
  } finally {
    actionRequestGroupId = undefined;
  }
};

const requestGroupHeaders = (): Record<string, string> =>
  actionRequestGroupId ? { 'X-Request-Group-Id': actionRequestGroupId } : {};

const get = <T>(url: string, customOptions: AxiosRequestConfig = {}) =>
  axios
    .get<T>(`${process.env.NEXT_PUBLIC_API_URL}/${url}`, {
      ...options,
      ...customOptions,
      headers: { ...options.headers, ...requestGroupHeaders(), ...customOptions.headers },
    })
    .catch(handleError);

const post = <T, U>(url: string, data: U, customOptions: { [key: string]: any } = {}) => {
  return axios
    .post<T>(`${process.env.NEXT_PUBLIC_API_URL}/${url}`, data, {
      ...options,
      ...customOptions,
      headers: { ...options.headers, ...requestGroupHeaders(), ...customOptions.headers },
    })
    .catch(handleError);
};

const patch = <T, U>(url: string, data: U, customOptions: { [key: string]: any } = {}) => {
  return axios
    .patch<T>(`${process.env.NEXT_PUBLIC_API_URL}/${url}`, data, {
      ...options,
      ...customOptions,
      headers: { ...options.headers, ...requestGroupHeaders(), ...customOptions.headers },
    })
    .catch(handleError);
};

const put = <T, U>(url: string, data: U, customOptions: { [key: string]: any } = {}) => {
  return axios
    .put<T>(`${process.env.NEXT_PUBLIC_API_URL}/${url}`, data, {
      ...options,
      ...customOptions,
      headers: { ...options.headers, ...requestGroupHeaders(), ...customOptions.headers },
    })
    .catch(handleError);
};

const deleteRequest = <T>(url: string, customOptions: { [key: string]: any } = {}) => {
  return axios
    .delete<T>(`${process.env.NEXT_PUBLIC_API_URL}/${url}`, {
      ...options,
      ...customOptions,
      headers: { ...options.headers, ...requestGroupHeaders(), ...customOptions.headers },
    })
    .catch(handleError);
};

export const apiService = { get, post, patch, put, deleteRequest };
