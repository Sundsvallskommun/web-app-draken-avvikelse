import { API_BASE_URL } from '@config';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';

import { logger } from './logger';
dayjs.extend(utc);

export const apiURL = (...parts: string[]): string => {
  const urlParts = [API_BASE_URL!, ...parts];
  return urlParts.map(pathPart => pathPart!.replace(/(^\/|\/$)/g, '')).join('/');
};

export const luhnCheck = (str = ''): boolean => {
  str = str.length === 12 ? str.slice(2) : str;
  let sum = 0;
  for (let i = 0, l = str.length; i < l; i++) {
    let v = parseInt(str[i]);
    v *= 2 - (i % 2);
    if (v > 9) {
      v -= 9;
    }
    sum += v;
  }
  return sum % 10 === 0;
};

export enum OrgNumberFormat {
  DASH,
  NODASH,
}

export const formatOrgNr = (orgNr: string, format: OrgNumberFormat = OrgNumberFormat.NODASH): string | undefined => {
  if (!orgNr) {
    return undefined;
  }
  const orgNumber = orgNr?.replace(/\D/g, '');
  if (!orgNumber || orgNumber.length !== 10 || !luhnCheck(orgNumber)) {
    return undefined;
  }
  return format === OrgNumberFormat.DASH ? orgNumber.substring(0, 6) + '-' + orgNumber.substring(6, 10) : orgNumber;
};

export const withRetries: <T>(retries: number, func: () => Promise<T>) => Promise<T | boolean> = (retries, func) => {
  return func().catch(_e => {
    if (retries > 0) {
      return withRetries(retries - 1, func);
    } else {
      logger.error('Out of retries in withRetries, returning false');
      return false;
    }
  });
};

export const formatOffsetDateTime = (date: Dayjs): string => date.format('YYYY-MM-DDTHH:mm:ss.SSSZ');

export const toOffsetDateTime = (date: Dayjs) => encodeURIComponent(formatOffsetDateTime(date));

export const isValidUrl = (string: string) => {
  let url;
  try {
    url = new URL(string);
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
};

export function buildCategoryFilter(list: string[]) {
  const unique = Array.from(new Set(list));
  if (unique.length === 0) return '';
  const parts = unique.map(s => `exists(labels.metadataLabel.resourcePath:'${s}')`);
  return `(${parts.join(' or ')})`;
}

export function findLeafComponents(cleanedData: string[]): Set<string> {
  const finalLeafNodes = new Set(cleanedData);

  for (const label of cleanedData) {
    for (const potentialChild of cleanedData) {
      if (potentialChild.length > label.length && potentialChild.startsWith(label + '/')) {
        finalLeafNodes.delete(label);
        break;
      }
    }
  }

  return finalLeafNodes;
}

function hasAnyAncestor(path: string, ancestorLists: string[][]): boolean {
  let current = path;

  while (true) {
    const idx = current.lastIndexOf('/');
    if (idx < 0) return ancestorLists[0].includes(current);

    current = current.substring(0, idx);

    if (ancestorLists.some(list => list.includes(current))) {
      return true;
    }
  }
}

export function removeUnreachablePaths(pathLists: (string[] | undefined)[]): string[] {
  const normalized = pathLists.filter((list): list is string[] => !!list && list.length > 0);

  if (normalized.length === 0) return [];
  if (normalized.length === 1) return [...normalized[0]];

  const parents = normalized[0];
  const rest = normalized.slice(1);

  const ancestorLists: string[][] = [parents];

  const cleaned: string[][] = [parents];

  for (const list of rest) {
    const filtered = list.filter(path => hasAnyAncestor(path, ancestorLists));
    cleaned.push(filtered);
    ancestorLists.push(filtered);
  }

  return cleaned.flat();
}
