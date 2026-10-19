import dayjs from 'dayjs';

export const newNumberPhonePattern = /^$|^(?:\+|0)[0-9\s-]{6,19}$/;
export const phonePattern = /^$|^(\+?[0-9]{7,11})$/gi;
export const supportManagementPhonePattern = /^\+[1-9]\d{3,14}$/gi;

export const invalidPhoneMessage = 'Ej giltigt telefonnummer';

export const ssnPattern = /^$|^(19|20)[0-9]{10}$/gi;
export const usernamePattern = /.*/;

export const invalidSsnMessage = 'Ej giltigt personnummer (ange tolv siffror: ååååmmddxxxx)';
export const invalidUsernameMessage = 'Ej giltigt användarnamn, mellanslag ej tillåtet.';

export const orgNumberPattern = /^$|^([0-9]{6}-[0-9]{4})$/gi;
export const invalidOrgNumberMessage = 'Ej giltigt organisationsnummer (ange tio siffror med streck: kkllmm-nnnn)';

export const truncate = (text: string | null | undefined, maxLength: number): string => {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
};

export const luhnCheck = (str = ''): boolean => {
  str = str?.replace('-', '');
  if (!str) {
    return false;
  }
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
  let orgNumber = orgNr?.replace(/\D/g, '');
  if (!orgNumber || orgNumber.length !== 10 || !luhnCheck(orgNumber)) {
    return; // NOTE: incorrect org number
  }
  return format === OrgNumberFormat.DASH ? orgNumber.substring(0, 6) + '-' + orgNumber.substring(6, 10) : orgNumber;
};

export const base64Decode = (base64: string) => {
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return atob(base64);
  }
};

export const sortBy = (list: any[], field: string) =>
  list && list.length > 0 ? list.sort((a, b) => (a[field] > b[field] ? 1 : -1)) : [];

export function deepFlattenToObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  return Object.keys(obj).reduce((acc: Record<string, unknown>, k) => {
    const pre = prefix.length ? prefix + '_' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      Object.assign(acc, deepFlattenToObject(obj[k] as Record<string, unknown>, pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
}

export function prettyTime(time: string | Date) {
  if (!time) {
    return '';
  }
  const d = dayjs(time);
  // check if today
  if (d.isSame(dayjs(), 'day')) {
    return `Idag ${d.format('HH:mm')}`;
  } else if (d.isSame(dayjs().subtract(1, 'day'), 'day')) {
    return `Igår ${d.format('HH:mm')}`;
  } else {
    return d.format('YYYY-MM-DD HH:mm');
  }
}

/**
 * True when react-hook-form reports at least one field as changed by the user.
 * Use this rather than formState.isDirty for save buttons and unsaved-changes
 * warnings: isDirty compares all form values against defaultValues, so a
 * setValue for a field that does not exist in defaultValues (eg the sidebar's
 * admin/status/priority placeholders) makes it true without any user edit.
 */
export function hasDirtyFields(dirtyFields: Record<string, unknown> | undefined): boolean {
  return dirtyFields ? Object.values(deepFlattenToObject(dirtyFields)).some(Boolean) : false;
}
