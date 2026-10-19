import { ORIGIN } from '@/config';

export const isValidOrigin = (url: string): boolean => {
  const allowedOrigins = ORIGIN!
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin !== '');
  const origin = new URL(url).origin;
  return allowedOrigins.includes(origin);
};
