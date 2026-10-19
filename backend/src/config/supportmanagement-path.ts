export const trimSupportManagementPath = (value: string): string => {
  const trimmedValue = value.trim();
  let start = 0;
  while (trimmedValue[start] === '/') start += 1;

  let end = trimmedValue.length;
  while (end > start && trimmedValue[end - 1] === '/') end -= 1;
  return trimmedValue.slice(start, end);
};

export const normalizeSupportManagementResourcePath = (value: string | undefined): string => trimSupportManagementPath(value ?? '').toUpperCase();
