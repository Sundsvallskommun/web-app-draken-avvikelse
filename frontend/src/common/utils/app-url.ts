export const appURL = (path?: string): string => {
  const origin =
    globalThis.window === undefined ? process.env.NEXT_PUBLIC_APP_URL || '' : globalThis.window.location.origin;

  const base = process.env.NEXT_PUBLIC_BASEPATH || '';

  return path ? `${origin}${base}${path}` : `${origin}${base}`;
};
