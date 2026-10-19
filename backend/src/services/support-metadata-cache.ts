import type { User } from '@/interfaces/users.interface';

import type ApiService from './api.service';
import type { ApiRequestConfig, ApiResponse } from './api.service';

/** How long the BFF keeps a namespace's metadata before it asks Support Management again. */
export const SUPPORT_METADATA_TTL_MS = 60 * 60 * 1000;

interface CachedMetadata {
  readonly response: Promise<ApiResponse<unknown>>;
  readonly expiresAt: number;
}

const trimSlashes = (part: string): string => part.replace(/(^\/|\/$)/g, '');

const pathOf = (baseURL: string): string => {
  try {
    return new URL(baseURL).pathname;
  } catch {
    return baseURL;
  }
};

/**
 * The path under the API gateway the request goes to, so the two ways a caller can address the same metadata - a
 * service base URL and a path below it, or the whole path - share one entry. It is built without the gateway's own
 * address, which keeps this module free of the configuration: the tests clear the cache from a setup file, and
 * loading the configuration there would read the environment before a test has set its own.
 */
const cacheKey = ({ baseURL, url = '', params }: ApiRequestConfig): string => {
  const path = [baseURL ? pathOf(baseURL) : '', url].map(trimSlashes).filter(Boolean).join('/');
  return params ? `${path}?${JSON.stringify(params)}` : path;
};

/**
 * Support Management's metadata - categories, labels, statuses, phases, roles and measure types - is configuration of
 * the namespace, the same answer for every user. The BFF reads it for nearly every page and for every write it
 * validates, so each answer is kept for an hour and shared by every request; a change to a namespace's metadata
 * reaches Draken within the hour.
 *
 * A failed read is never kept, concurrent reads of the same metadata share one request, and every caller gets a copy
 * of its own, so nothing a caller does to the answer reaches the next one.
 */
class SupportMetadataCache {
  private readonly entries = new Map<string, CachedMetadata>();

  async read<T>(apiService: Pick<ApiService, 'get'>, config: ApiRequestConfig, user: User): Promise<ApiResponse<T>> {
    const key = cacheKey(config);
    const now = Date.now();
    let cached = this.entries.get(key);
    if (!cached || now >= cached.expiresAt) {
      const response = apiService.get<T>(config, user);
      cached = { response, expiresAt: now + SUPPORT_METADATA_TTL_MS };
      this.entries.set(key, cached);
      response.catch(() => {
        if (this.entries.get(key)?.response === response) this.entries.delete(key);
      });
    }
    const response = (await cached.response) as ApiResponse<T>;
    return { ...response, data: structuredClone(response.data) };
  }

  /** Forgets every kept answer; the tests start each case from an empty cache. */
  clear(): void {
    this.entries.clear();
  }
}

export const supportMetadataCache = new SupportMetadataCache();
